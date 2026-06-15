-- =============================================================================
-- 086_chat_appointment_topic.sql
-- Wave 7 mobile reconciliation — additive topic column on chat.appointments
--
-- Adds:
--   chat.appointments.topic  — nullable VARCHAR(50): consult topic chosen at booking
--                              (ACCOUNTING, GST, ITR, LOAN, OTHER)
--
-- House rules:
--   • Additive-only — no existing column altered.
--   • CHECK constraint rejects unknown topic values (NULL is allowed for legacy rows).
--   • snake_case, replay-safe (guarded by information_schema check).
--   • Index added for filtering by topic (useful for CA management views).
--
-- Depends on: 080_chat_appointments_bookmarks_permissions.sql (chat.appointments exists)
-- Replay-safe on top of 080–085.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'chat'
          AND table_name   = 'appointments'
          AND column_name  = 'topic'
    ) THEN
        ALTER TABLE chat.appointments
            ADD COLUMN topic VARCHAR(50)
                CONSTRAINT chk_appointment_topic
                CHECK (topic IS NULL OR topic IN ('ACCOUNTING', 'GST', 'ITR', 'LOAN', 'OTHER'));

        COMMENT ON COLUMN chat.appointments.topic IS
            'Consult topic chosen at booking time (ACCOUNTING, GST, ITR, LOAN, OTHER). '
            'Nullable — legacy rows booked before migration 086 will have NULL. '
            'Previously smuggled as a "[TOPIC] " prefix in the notes column by the mobile client.';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_appointments_topic
    ON chat.appointments (topic)
    WHERE deleted_at IS NULL AND topic IS NOT NULL;
