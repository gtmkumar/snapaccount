-- =============================================================================
-- 056_chat_callback_write_alignment.sql
-- Align CHECK-constraint vocabularies with the domain enum names so EF writes
-- succeed. The callback/chat services have NO EF migrations — the SQL schema is
-- canonical — but the original CHECK vocabularies (migrations 018 & 029) were
-- authored independently of the C# enums. EF persists each enum as the
-- UPPER_SNAKE_CASE form of its member name (UpperSnakeEnumConverter); the old
-- CHECK lists rejected those values, so every callback/chat write 500'd.
--
-- These tables hold no rows that use a soon-to-be-invalid value (EF inserts were
-- failing the CHECK, and the only seeded row — callback.callbacks PENDING/GST/NORMAL
-- — remains valid), so the constraints can be swapped without data migration.
-- Idempotent: DROP ... IF EXISTS + ADD.
-- Depends on: 018_callback_schema.sql, 029_chat_signalr.sql
-- =============================================================================

BEGIN;

-- ── callback.callbacks ───────────────────────────────────────────────────────
-- status: CallbackStatus (Pending/Assigned/Confirmed/Completed/Escalated/Cancelled)
ALTER TABLE callback.callbacks DROP CONSTRAINT IF EXISTS callbacks_status_check;
ALTER TABLE callback.callbacks ADD CONSTRAINT callbacks_status_check
    CHECK (status IN ('PENDING','ASSIGNED','CONFIRMED','COMPLETED','ESCALATED','CANCELLED'));

-- category: CallbackCategory (General/Gst/Itr/Loan/Accounting/Subscription/Technical)
ALTER TABLE callback.callbacks DROP CONSTRAINT IF EXISTS callbacks_category_check;
ALTER TABLE callback.callbacks ADD CONSTRAINT callbacks_category_check
    CHECK (category IN ('GENERAL','GST','ITR','LOAN','ACCOUNTING','SUBSCRIPTION','TECHNICAL'));

-- priority: CallbackPriority (Low/Normal/High/Urgent) — already matches; re-asserted for clarity.
ALTER TABLE callback.callbacks DROP CONSTRAINT IF EXISTS callbacks_priority_check;
ALTER TABLE callback.callbacks ADD CONSTRAINT callbacks_priority_check
    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'));

-- ── chat.threads ─────────────────────────────────────────────────────────────
-- status: ThreadStatus (Open/PendingUser/Resolved/Escalated/Reopened).
-- Replaces the original OPEN/ASSIGNED/RESOLVED/CLOSED vocabulary, which the domain
-- state machine never emitted.
ALTER TABLE chat.threads DROP CONSTRAINT IF EXISTS threads_status_check;
ALTER TABLE chat.threads ADD CONSTRAINT threads_status_check
    CHECK (status IN ('OPEN','PENDING_USER','RESOLVED','ESCALATED','REOPENED'));
-- category (GST/ITR/DOC/LOAN/BILLING/GENERAL) already matches ThreadCategory — unchanged.

-- ── chat.thread_participants ─────────────────────────────────────────────────
-- role: ParticipantRole (User/Agent/CA/LoanOfficer/Bot).
ALTER TABLE chat.thread_participants DROP CONSTRAINT IF EXISTS thread_participants_role_check;
ALTER TABLE chat.thread_participants ADD CONSTRAINT thread_participants_role_check
    CHECK (role IN ('USER','AGENT','CA','LOAN_OFFICER','BOT'));

-- ── chat.messages.sender_role ────────────────────────────────────────────────
-- Vocabulary ('USER','CA','ADMIN','SYSTEM','AI') is unchanged. The application now
-- maps the sender's participant role into one of these values (MessageSenderRole);
-- previously the column was never written and INSERTs 500'd on the NOT NULL.

COMMIT;
