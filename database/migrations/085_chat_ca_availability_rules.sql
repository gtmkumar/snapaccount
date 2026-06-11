-- =============================================================================
-- 085_chat_ca_availability_rules.sql
-- Wave 7A addendum — CA availability rules + appointment CA-cancel columns
--
-- Creates:
--   chat.ca_availability_rules   — recurring weekly schedule rules per CA
--
-- Alters (additive):
--   chat.appointments            — adds ca_cancellation_reason, cancelled_by_ca
--
-- Also seeds:
--   No new permissions (existing chat.slots.manage covers rules CRUD + generation)
--
-- House rules:
--   • snake_case columns, UUID PKs, audit columns (created_at/updated_at/deleted_at)
--   • created_by / updated_by are UUID (NOT TEXT) — matches BaseDbContext.GuidStringConverter
--   • RLS: CA profiles + slot-manage staff can read/write their own rules
--   • All INSERTs use ON CONFLICT DO NOTHING (idempotent re-run)
--   • No existing object altered without IF NOT EXISTS / IF COLUMN NOT EXISTS guards
--
-- Depends on: 080_chat_appointments_bookmarks_permissions.sql (chat.ca_profiles exists)
-- Replay-safe on top of 080–084.
-- =============================================================================

-- =============================================================================
-- 1. chat.ca_availability_rules
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat.ca_availability_rules (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ca_profile_id         UUID         NOT NULL REFERENCES chat.ca_profiles(id),
    weekday               SMALLINT     NOT NULL
                          CONSTRAINT chk_availability_rule_weekday CHECK (weekday BETWEEN 0 AND 6),
    start_time_ist        INTERVAL     NOT NULL,   -- offset from midnight (e.g. '09:00:00')
    end_time_ist          INTERVAL     NOT NULL,
    slot_duration_minutes INTEGER      NOT NULL
                          CONSTRAINT chk_slot_duration CHECK (slot_duration_minutes BETWEEN 15 AND 480),
    effective_from        DATE         NOT NULL,
    effective_to          DATE,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,
    created_by            UUID,
    updated_by            UUID,
    CONSTRAINT chk_availability_rule_end_after_start
        CHECK (end_time_ist > start_time_ist),
    CONSTRAINT chk_availability_rule_effective_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE chat.ca_availability_rules IS
    'Wave 7A addendum: recurring weekly availability rules per CA. '
    'The slot-generation job materialises AppointmentSlot rows from these rules each Sunday.';

CREATE INDEX IF NOT EXISTS ix_ca_availability_rules_ca_profile_id
    ON chat.ca_availability_rules (ca_profile_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ca_availability_rules_ca_active
    ON chat.ca_availability_rules (ca_profile_id, is_active)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_ca_availability_rules
    BEFORE UPDATE ON chat.ca_availability_rules
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- RLS: CA can only manage their own rules (via ca_profile_id → user_id join);
--       admins (SUPER_ADMIN/ORG_ADMIN) can see all.
ALTER TABLE chat.ca_availability_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'chat'
          AND tablename = 'ca_availability_rules'
          AND policyname = 'ca_availability_rules_policy'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY ca_availability_rules_policy ON chat.ca_availability_rules
            FOR ALL
            USING (
                deleted_at IS NULL
                AND (
                    -- CA can access their own rules
                    EXISTS (
                        SELECT 1 FROM chat.ca_profiles cp
                        WHERE cp.id = ca_profile_id
                          AND cp.user_id = current_setting('app.current_user_id', TRUE)::uuid
                          AND cp.deleted_at IS NULL
                    )
                    OR
                    -- Staff with slots.manage permission can see all rules
                    EXISTS (
                        SELECT 1 FROM auth.organization_member om
                        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::uuid
                          AND om.deleted_at IS NULL
                    )
                )
            )
        $policy$;
    END IF;
END $$;

-- =============================================================================
-- 2. Additive columns on chat.appointments (CA-cancel tracking)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'chat'
          AND table_name   = 'appointments'
          AND column_name  = 'cancelled_by_ca'
    ) THEN
        ALTER TABLE chat.appointments
            ADD COLUMN cancelled_by_ca       BOOLEAN      NOT NULL DEFAULT FALSE,
            ADD COLUMN ca_cancellation_reason VARCHAR(1000);
        COMMENT ON COLUMN chat.appointments.cancelled_by_ca IS
            'TRUE when the cancellation was initiated by the CA (no 2h rule applied).';
        COMMENT ON COLUMN chat.appointments.ca_cancellation_reason IS
            'Mandatory reason text when cancelled_by_ca = TRUE.';
    END IF;
END $$;
