-- =============================================================================
-- 054_chat_threads_escalated_at.sql
-- Chat — add chat.threads.escalated_at timestamp.
-- ADDITIVE migration. Extends 029_chat_signalr.sql. Does NOT rewrite it.
-- Idempotent / re-runnable.
--
-- Background:
--   The ChatThread domain entity has an Escalate() transition that records when a
--   thread was escalated (EscalatedAt). The canonical chat.threads table created in
--   029_chat_signalr.sql never included a column to persist this, causing an
--   EF-entity <-> DB-table divergence. Rather than dropping the domain property,
--   we add the missing column non-destructively so the EF mapping
--   (ChatThreadConfiguration: EscalatedAt -> escalated_at) resolves to a real column.
--
--   No CHECK-constraint changes are made here: the threads_status_check constraint
--   (OPEN/ASSIGNED/RESOLVED/CLOSED) is intentionally left untouched by this migration.
-- =============================================================================

ALTER TABLE chat.threads
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN chat.threads.escalated_at IS
    'Timestamp the thread was escalated. Set by ChatThread.Escalate(). Added in migration 054.';
