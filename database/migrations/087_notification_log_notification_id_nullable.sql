-- =============================================================================
-- 087_notification_log_notification_id_nullable.sql
-- Wave 7 live QA — BUG-W7-02 — relax NOT NULL on notification.notification_log.notification_id
--
-- Changes:
--   notification.notification_log.notification_id  NOT NULL → NULL
--
-- Why:
--   notification_id is an FK-BY-VALUE (no actual FK constraint — the parent
--   notification.notification table is partitioned, so cross-partition FKs are
--   not declared). It was minted NOT NULL by migration 008. Wave 7 introduced
--   two legitimate log-only flows that have no parent notification row:
--     • template manager "test send" (renders + dispatches a template without
--       persisting a notification),
--     • celebration / milestone entries that log a dispatch with no source row.
--   Both fail at INSERT with 23502 (null value in column "notification_id").
--   backend-agent has already updated the EF config (NotificationLogEntry →
--   notification_id mapped nullable). This migration aligns the DB.
--
-- House rules:
--   • Single column NULL-relaxation — NO data loss, NO existing rows touched,
--     existing populated values are unaffected (relaxing NOT NULL is always safe).
--   • snake_case, replay-safe (guarded by information_schema.is_nullable check).
--   • The idx_notification_log_notification_id index (from 008) is unaffected —
--     btree indexes already permit NULL keys; no index change needed.
--
-- Depends on: 008 (creates notification.notification_log with notification_id NOT NULL)
-- Replay-safe on top of 008–086.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'notification'
          AND table_name   = 'notification_log'
          AND column_name  = 'notification_id'
          AND is_nullable  = 'NO'
    ) THEN
        ALTER TABLE notification.notification_log
            ALTER COLUMN notification_id DROP NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN notification.notification_log.notification_id IS
    'FK-by-value to notification.notification (partitioned — no FK constraint). '
    'Nullable since migration 087 (BUG-W7-02): template test-sends and celebration/'
    'milestone log entries are dispatched with no parent notification row.';

-- =============================================================================
-- End 087_notification_log_notification_id_nullable.sql
-- =============================================================================
