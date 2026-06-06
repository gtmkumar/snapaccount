-- =============================================================================
-- 060_notification_ef_alignment.sql
-- NotificationService — align the notification.* tables with the EF Core domain
-- entities. ADDITIVE migration. Extends 008_notification_schema.sql and
-- 017_notification_preferences_templates.sql. Does NOT rename or drop any existing
-- column. Idempotent / re-runnable.
--
-- Context: NotificationService has NO EF migrations — the SQL migrations are the
-- canonical schema. The DbContext + entity configurations map PascalCase entity
-- properties onto the existing snake_case columns; this migration only ADDS the
-- genuinely-missing tables/columns the entity model needs and relaxes a handful of
-- NOT NULL constraints the dispatch-record entities cannot satisfy.
--
-- Three deltas:
--   1. notification.notification_event  — NEW table. The seeder's first phase writes
--      the 29-row event catalogue (NotificationEvent entity). 008/017 never created
--      a table for it, so the seeder previously crashed (band-aided away in PR #19).
--   2. notification.notification_log     — the EF NotificationLogEntry is a dispatch
--      record (user_id, event_code, channel, language, rendered_body, dedupe_key),
--      whereas 008's notification_log is a provider-delivery log keyed by
--      notification_id. The dispatch columns are added; notification_id /
--      notification_at / provider are relaxed to NULLable because the dispatch
--      record does not carry them.
--   3. notification.dlq_items            — adds locale + a plain-text original_payload
--      column (the entity stores rendered text, not JSON) + an is_resolved boolean,
--      and relaxes payload / first_failed_at to NULLable so the entity's Create()
--      factory (which does not supply them) produces valid inserts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. notification.notification_event  — event catalogue (NotificationEvent entity)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification.notification_event (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code       VARCHAR(200) NOT NULL UNIQUE,   -- e.g. GST_DEADLINE_7_DAYS
    event_name       VARCHAR(300) NOT NULL,
    category         VARCHAR(50)  NOT NULL,           -- GST/ITR/LOAN/SUBSCRIPTION/...
    default_channels VARCHAR(200) NOT NULL DEFAULT 'Push',  -- comma-separated: Push,Sms,Email
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    created_by       UUID,
    updated_by       UUID
);

CREATE INDEX IF NOT EXISTS idx_notification_event_category
    ON notification.notification_event (category);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_event_updated_at') THEN
        CREATE TRIGGER trg_notification_event_updated_at
            BEFORE UPDATE ON notification.notification_event
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. notification.notification_log  — add dispatch-record columns
-- -----------------------------------------------------------------------------
-- The dispatch record (NotificationLogEntry) carries who/what/which-channel plus a
-- dedupe key; these have no column in the provider-oriented 008 table.
ALTER TABLE notification.notification_log
    ADD COLUMN IF NOT EXISTS user_id        UUID,
    ADD COLUMN IF NOT EXISTS event_code     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS channel        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS language       VARCHAR(20) NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS rendered_body  TEXT,
    ADD COLUMN IF NOT EXISTS dedupe_key     VARCHAR(128);

-- Relax the provider-log NOT NULLs: the dispatch record does not supply them.
ALTER TABLE notification.notification_log ALTER COLUMN notification_id DROP NOT NULL;
ALTER TABLE notification.notification_log ALTER COLUMN notification_at DROP NOT NULL;
ALTER TABLE notification.notification_log ALTER COLUMN provider        DROP NOT NULL;

-- channel CHECK aligned with the rest of the schema's vocabulary.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_notification_log_channel'
    ) THEN
        ALTER TABLE notification.notification_log
            ADD CONSTRAINT chk_notification_log_channel
            CHECK (channel IS NULL OR channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_log_user_event
    ON notification.notification_log (user_id, event_code);
CREATE INDEX IF NOT EXISTS idx_notification_log_dedupe
    ON notification.notification_log (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. notification.dlq_items  — add locale + plain-text payload + is_resolved
-- -----------------------------------------------------------------------------
ALTER TABLE notification.dlq_items
    ADD COLUMN IF NOT EXISTS locale            VARCHAR(20) NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS original_payload  TEXT,        -- entity stores rendered text, not JSON
    ADD COLUMN IF NOT EXISTS is_resolved       BOOLEAN NOT NULL DEFAULT FALSE;

-- The entity's DlqItem.Create() does not populate the JSONB payload or first_failed_at,
-- so relax those to NULLable (original_payload / last_failed_at carry the data instead).
ALTER TABLE notification.dlq_items ALTER COLUMN payload DROP NOT NULL;
ALTER TABLE notification.dlq_items ALTER COLUMN first_failed_at DROP NOT NULL;

-- =============================================================================
-- End 060_notification_ef_alignment.sql
-- =============================================================================
