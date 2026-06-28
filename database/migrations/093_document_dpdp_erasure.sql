-- DG-SEC-03: DPDP Act 2023 Right-to-Erasure support for document.document.
--
-- Changes:
--   1. Make user_id nullable (was NOT NULL) so the AccountDeletionSubscriber can
--      NULL it on account deletion — consistent with loan/gst/itr schema pattern.
--   2. Add anonymized_at and anonymization_reason columns to track erasure state.
--   3. Drop and recreate the user_id index to allow NULL values correctly.
--
-- The RLS policy USING (user_id = ...) continues to work correctly for authenticated
-- requests. After erasure, user_id IS NULL, so the row is invisible to any tenant
-- (NULL != any value) — this is the intended post-erasure isolation behaviour.

-- 1. Allow NULL for user_id (right-to-erasure: set to NULL on account deletion)
ALTER TABLE document.document
    ALTER COLUMN user_id DROP NOT NULL;

-- 2. DPDP erasure audit columns
ALTER TABLE document.document
    ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS anonymization_reason VARCHAR(100);

-- 3. Partial index: only on non-anonymised rows (rows where user_id IS NOT NULL)
DROP INDEX IF EXISTS document.idx_document_user_id;
CREATE INDEX idx_document_user_id
    ON document.document (user_id, uploaded_at)
    WHERE user_id IS NOT NULL;
