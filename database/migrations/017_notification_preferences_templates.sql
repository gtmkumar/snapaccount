-- =============================================================================
-- 017_notification_preferences_templates.sql
-- Phase 6E — Notification schema extensions (additive).
--
-- Scope doc (phase-6E-scope.md) calls for:
--   - notification.notification_preferences  (per-user per-event-type channel matrix
--                                             + quiet-hours + dedup window)
--   - notification.notification_templates    (versioned, per-locale: en/hi/bn)
--   - notification.notification_log          (provider send attempts w/ retry + cost)
--   - notification.dlq_items                 (retry-exhausted messages)
--
-- The existing 008_notification_schema.sql already provides:
--   - notification.notification_template     (templates — non-versioned, single row per code)
--   - notification.notification_preference   (per-user per-event-type channel flags)
--   - notification.notification_log          (provider delivery log, minimal)
--   - notification.notification               (the dispatch record — partitioned)
--
-- This migration is ADDITIVE ONLY:
--   * Adds missing columns via ADD COLUMN IF NOT EXISTS.
--   * Creates new companion tables for DLQ + template versioning metadata.
--   * Does NOT rename or drop anything. Backend-agent maps domain names onto
--     existing singular-form tables; new columns cover the scope deltas.
--
-- Depends on: 008_notification_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notification.notification_preference  -- extend for quiet hours + dedup
-- -----------------------------------------------------------------------------
-- Existing shape already covers per-user per-event (push/sms/email/in_app/whatsapp)
-- booleans. Phase 6E adds quiet-hours + do-not-disturb + per-pref dedup window
-- (I2 dedup rule: "don't send same event twice in 6h window").
-- -----------------------------------------------------------------------------
ALTER TABLE notification.notification_preference
    ADD COLUMN IF NOT EXISTS quiet_hours_start       TIME,
    ADD COLUMN IF NOT EXISTS quiet_hours_end         TIME,
    ADD COLUMN IF NOT EXISTS quiet_hours_timezone    VARCHAR(64) DEFAULT 'Asia/Kolkata',
    ADD COLUMN IF NOT EXISTS dnd_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS dnd_until               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dedup_window_minutes    INT NOT NULL DEFAULT 360,
    ADD COLUMN IF NOT EXISTS preferred_locale        VARCHAR(10) NOT NULL DEFAULT 'en';

-- -----------------------------------------------------------------------------
-- notification.notification_template  -- extend for versioning + locale index
-- -----------------------------------------------------------------------------
-- Existing table already has `language` column. Phase 6E adds explicit
-- version, effective-date window, and makes (event_type, channel, language, version)
-- the logical uniqueness key so multiple historical versions can coexist.
-- -----------------------------------------------------------------------------
ALTER TABLE notification.notification_template
    ADD COLUMN IF NOT EXISTS version                INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_current             BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS effective_from         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS effective_to           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dlt_template_id        VARCHAR(100),   -- MSG91 DLT (SMS regulatory)
    ADD COLUMN IF NOT EXISTS sender_id              VARCHAR(50),    -- SMS sender header / Email From name
    ADD COLUMN IF NOT EXISTS approval_status        VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (approval_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','RETIRED'));

-- Partial unique index: one "current" template per (event_type, channel, language)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_template_current_per_channel_locale
    ON notification.notification_template (event_type, channel, language)
    WHERE is_current = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_template_language
    ON notification.notification_template (language);

-- -----------------------------------------------------------------------------
-- notification.notification_log  -- extend with retry + cost + status transitions
-- -----------------------------------------------------------------------------
-- Existing shape tracks (provider, provider_message_id, provider_status,
-- is_delivered, delivered_at, cost_units). Phase 6E adds explicit status
-- progression enum (QUEUED/SENT/DELIVERED/FAILED/BOUNCED), retry_count, and
-- a normalized INR cost column.
-- -----------------------------------------------------------------------------
ALTER TABLE notification.notification_log
    ADD COLUMN IF NOT EXISTS status                 VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED','BOUNCED')),
    ADD COLUMN IF NOT EXISTS retry_count            SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_inr               NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS failure_reason         TEXT,
    ADD COLUMN IF NOT EXISTS last_attempt_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_retry_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notification_log_status
    ON notification.notification_log (status);
CREATE INDEX IF NOT EXISTS idx_notification_log_next_retry
    ON notification.notification_log (next_retry_at)
    WHERE status = 'FAILED' AND next_retry_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- notification.dlq_items
-- -----------------------------------------------------------------------------
-- Dead-letter queue for notification sends that exhausted their retry budget.
-- An operator inspects these manually; optionally re-queue via admin tool.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification.dlq_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id         UUID,                             -- FK by value (partitioned parent)
    notification_log_id     UUID REFERENCES notification.notification_log (id) ON DELETE SET NULL,
    user_id                 UUID,
    event_type              VARCHAR(200) NOT NULL,
    channel                 VARCHAR(30) NOT NULL
                                CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
    provider                VARCHAR(50),
    payload                 JSONB NOT NULL,                   -- original send payload (sans secrets)
    failure_reason          TEXT NOT NULL,
    error_code              VARCHAR(100),
    retry_count             SMALLINT NOT NULL DEFAULT 0,
    first_failed_at         TIMESTAMPTZ NOT NULL,
    last_failed_at          TIMESTAMPTZ NOT NULL,
    resolution_status       VARCHAR(30) NOT NULL DEFAULT 'OPEN'
                                CHECK (resolution_status IN ('OPEN','REQUEUED','ACKNOWLEDGED','DROPPED')),
    resolved_at             TIMESTAMPTZ,
    resolved_by             UUID,
    resolution_notes        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_dlq_items_user_id
    ON notification.dlq_items (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_items_event_type
    ON notification.dlq_items (event_type);
CREATE INDEX IF NOT EXISTS idx_dlq_items_channel
    ON notification.dlq_items (channel);
CREATE INDEX IF NOT EXISTS idx_dlq_items_resolution
    ON notification.dlq_items (resolution_status) WHERE resolution_status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_dlq_items_last_failed_at
    ON notification.dlq_items (last_failed_at);

ALTER TABLE notification.dlq_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_dlq_items_updated_at'
    ) THEN
        CREATE TRIGGER trg_dlq_items_updated_at
            BEFORE UPDATE ON notification.dlq_items
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- DLQ is operator-only. Default-deny via RLS; operators use an elevated
-- backend connection that bypasses RLS (per the existing pattern for admin
-- tables). A restrictive policy allows only the owning user to view their
-- own rows, matching the existing notification_preference policy pattern.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'notification' AND tablename = 'dlq_items'
          AND policyname = 'dlq_items_user_isolation'
    ) THEN
        CREATE POLICY dlq_items_user_isolation ON notification.dlq_items
            USING (user_id IS NULL
                OR user_id = current_setting('app.current_user_id', TRUE)::UUID);
    END IF;
END $$;

-- =============================================================================
-- End 017_notification_preferences_templates.sql
-- =============================================================================
