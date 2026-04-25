-- =============================================================================
-- 030_chat_audit_indexes.sql
-- Phase 6F Track F2 — ChatService indexes (inbox, message pagination, search)
--
-- Indexes:
--   1. (org_id, status, last_message_at DESC) for inbox queries —
--      "show me OPEN/ASSIGNED threads in this org, newest activity first".
--   2. (assigned_ca_id, status, last_message_at DESC) for CA inbox.
--   3. (thread_id, sent_at DESC) for message pagination —
--      keyset pagination on sent_at descending.
--   4. (thread_id, sent_at DESC) WHERE is_read_by_recipient = FALSE —
--      partial index for unread-count math.
--   5. GIN on body_tsvector for chat history full-text search.
--   6. (category, priority) for routing rule lookup (already in 029, reaffirmed
--      to be idempotent here).
--
-- Idempotent. Additive. Depends on: 029_chat_signalr.sql.
-- =============================================================================

-- Inbox: org-scoped, by status, newest activity first.
CREATE INDEX IF NOT EXISTS idx_chat_threads_org_status_last_msg
    ON chat.threads (org_id, status, last_message_at DESC NULLS LAST)
    WHERE deleted_at IS NULL;

-- CA inbox: per-CA, by status, newest activity first.
CREATE INDEX IF NOT EXISTS idx_chat_threads_ca_status_last_msg
    ON chat.threads (assigned_ca_id, status, last_message_at DESC NULLS LAST)
    WHERE assigned_ca_id IS NOT NULL AND deleted_at IS NULL;

-- User inbox: per-end-user, newest activity first.
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_last_msg
    ON chat.threads (user_id, last_message_at DESC NULLS LAST)
    WHERE deleted_at IS NULL;

-- Category breakdown (used by admin filters on ChatInbox).
CREATE INDEX IF NOT EXISTS idx_chat_threads_org_category
    ON chat.threads (org_id, category)
    WHERE deleted_at IS NULL;

-- Reference linkage lookup (e.g., "show all threads for this loan application").
CREATE INDEX IF NOT EXISTS idx_chat_threads_reference
    ON chat.threads (reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- Retention sweep (daily job: archive threads past retention_until).
CREATE INDEX IF NOT EXISTS idx_chat_threads_retention_until
    ON chat.threads (retention_until)
    WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

-- Message pagination: keyset on (thread_id, sent_at DESC).
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_sent_at
    ON chat.messages (thread_id, sent_at DESC);

-- Unread message count per thread.
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_unread
    ON chat.messages (thread_id, sent_at DESC)
    WHERE is_read_by_recipient = FALSE AND deleted_at IS NULL;

-- Sender-scoped queries (admin/audit: "all messages by user X").
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_sent_at
    ON chat.messages (sender_user_id, sent_at DESC)
    WHERE sender_user_id IS NOT NULL;

-- Full-text search across chat history (admin search; per-thread search).
-- GIN is the right choice for tsvector; the column is STORED so the index is
-- maintained on insert/update without re-computing the tsvector at query time.
CREATE INDEX IF NOT EXISTS idx_chat_messages_body_tsvector
    ON chat.messages USING GIN (body_tsvector);

-- =============================================================================
-- End of 030_chat_audit_indexes.sql
-- =============================================================================
