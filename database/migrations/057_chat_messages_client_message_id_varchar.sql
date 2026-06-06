-- =============================================================================
-- 057_chat_messages_client_message_id_varchar.sql
-- Fix chat.messages.client_message_id type divergence (blocks ALL message writes).
--
-- The column was created as UUID (migration 029), but client_message_id is a
-- client-generated offline idempotency key — the mobile app sends arbitrary
-- strings like "local_1780595635192" (not UUIDs). The EF entity correctly models
-- it as string(128); the DB column type was the mismatch, so every message INSERT
-- failed with: 42804 column "client_message_id" is of type uuid but expression is
-- of type character varying.
--
-- Align the DB to the contract: UUID -> VARCHAR(128). The
-- uq_messages_thread_client_message_id unique index is rebuilt automatically by
-- the type change. Table is empty (no message ever inserted), so the USING cast
-- is a no-op.
-- Depends on: 029_chat_signalr.sql
-- =============================================================================

ALTER TABLE chat.messages
    ALTER COLUMN client_message_id TYPE VARCHAR(128)
    USING client_message_id::text;
