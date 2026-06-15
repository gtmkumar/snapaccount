-- =============================================================================
-- 065_document_review_decision_columns.sql
-- DocumentService — Phase 7 (backend B15 handoff): persist the human review
-- decision (approve / reject) on a document.
-- ADDITIVE migration. Extends 003_document_schema.sql (and the Phase 6A
-- extracted_entities addition). Does NOT rename/drop/alter any column. Idempotent.
--
-- Background
-- ---------
-- The document review workflow transitions a document to PROCESSED (approved) or
-- REJECTED. The Document entity records who approved it and when, and — when
-- rejected — the human-supplied rejection reason. The canonical document.document
-- table had no columns to persist these decision fields, causing an EF-entity <->
-- DB-table divergence. We add the missing columns non-destructively.
--
-- Table shape: document.document is a RANGE-partitioned (by uploaded_at) parent
-- table. ADD COLUMN on the partitioned PARENT automatically propagates to every
-- existing monthly partition (document_2026_01 .. document_2026_12),
-- document_default and document_archive, and to all future partitions. We add the
-- columns once, at the parent.
--
-- Columns added (matching the B15 handoff exactly):
--   rejection_reason TEXT        — free-text reason captured when status -> REJECTED
--   approved_by      UUID        — user_id of the reviewer who approved/decided
--   approved_at      TIMESTAMPTZ — timestamp of the review decision
--
-- No FK is declared on approved_by: auth.user lives in the auth schema and the
-- document schema references auth identities by value (UUID) throughout (see the
-- existing user_id/created_by/updated_by columns, which are likewise unconstrained
-- UUIDs). This matches the established cross-schema convention. No CHECK-constraint
-- or RLS changes are made here; the existing document_user_isolation policy and
-- document_status_check are intentionally left untouched.
--
-- Depends on: 000_init.sql, 003_document_schema.sql.
-- =============================================================================

ALTER TABLE document.document
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS approved_by      UUID,
    ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;

COMMENT ON COLUMN document.document.rejection_reason IS
    'Free-text reason captured when a document review decision sets status to REJECTED. Added in migration 065.';
COMMENT ON COLUMN document.document.approved_by IS
    'user_id (auth.user, referenced by value) of the reviewer who recorded the approve/reject decision. Added in migration 065.';
COMMENT ON COLUMN document.document.approved_at IS
    'Timestamp the review decision (approve/reject) was recorded. Added in migration 065.';

-- =============================================================================
-- End 065_document_review_decision_columns.sql
-- =============================================================================
