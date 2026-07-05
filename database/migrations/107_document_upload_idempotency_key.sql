-- =============================================================================
-- 107: Add idempotency_key to document.document (DG-DOC-08)
--
-- Background: The mobile offline-first capture flow (offline-first-photo-capture.md §4)
-- assigns a UUID v4 idempotency key to each upload attempt and re-sends it on
-- retry. Without server-side deduplication, a force-quit between a successful
-- upload and the client receiving the success-ack causes a duplicate document row.
--
-- This migration adds a nullable idempotency_key column + a lookup index so the
-- backend can detect repeat uploads and return the existing document (200) instead
-- of inserting a new row.
--
-- NOTE: document.document is RANGE-partitioned by uploaded_at, and PostgreSQL
-- requires any UNIQUE index on a partitioned table to include every partition-key
-- column. A unique (organization_id, idempotency_key) index is therefore impossible
-- without uploaded_at — which would defeat cross-day dedup. So uniqueness is enforced
-- in the application layer (query-first by org+key before insert); this index only
-- accelerates that lookup. The mobile retry path is sequential, so the residual
-- race window is negligible for this use case.
--
-- Additive only — no existing rows are affected (all get NULL).
-- =============================================================================

BEGIN;

ALTER TABLE document.document
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN document.document.idempotency_key IS
    'DG-DOC-08: Client UUID v4 sent as Idempotency-Key header on mobile upload. '
    'NULL for web / legacy uploads. App-level dedup per (org, key) — repeat key returns 200 existing.';

-- Non-unique partial lookup index (partitioned table cannot carry a cross-partition
-- UNIQUE index without the uploaded_at partition key). Supports the app-level dedup query.
CREATE INDEX IF NOT EXISTS ix_document_org_idempotency_key
    ON document.document (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMIT;
