-- =============================================================================
-- 109_loan_consent_device_bank_and_eligibility_status.sql
-- LoanService — DG-LOAN-06 + DG-LOAN-07
--
-- DG-LOAN-06: Add device-id and bank-list audit fields to loan.consents.
--   F4.2 requires consent recorded with timestamp (already present), IP address
--   (already present), device ID, and list of banks. This migration adds:
--     - device_id      VARCHAR(128) NULL  — masked device identifier for DPDP audit
--     - shared_with_bank_ids  JSONB  NULL — array of partner-bank UUIDs for
--                                            DATA_SHARE_WITH_BANK consents
--
-- DG-LOAN-07: Eligibility status — no schema changes needed; tri-state is
--   computed in the application layer. This comment documents intent only.
--   The EligibilityStatus enum (Eligible/PartiallyEligible/NotEligible) and
--   per-product unmet-criteria strings are derived at runtime by EligibilityEngine
--   and returned in the API response DTO. No additional DB columns are required
--   since eligibility is stateless (re-computed per request).
--
-- ADDITIVE / idempotent. Depends on: 027_loan_documents_consents.sql,
--   103_loan_consent_revoke_and_kfs_extended_fields.sql.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — DG-LOAN-06: device_id audit column on loan.consents
-- =============================================================================

ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS device_id  VARCHAR(128) NULL;

COMMENT ON COLUMN loan.consents.device_id IS
    'DG-LOAN-06 / F4.2: Masked device identifier recorded at consent time for '
    'DPDP audit trail. Format: first 8 + "..." + last 4 chars of the raw device id, '
    'or the raw value if <= 12 chars. NULL for consents recorded before this migration '
    'or where the client did not supply a device id.';

-- =============================================================================
-- PART 2 — DG-LOAN-06: shared_with_bank_ids audit column on loan.consents
-- =============================================================================

ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS shared_with_bank_ids  JSONB NULL;

COMMENT ON COLUMN loan.consents.shared_with_bank_ids IS
    'DG-LOAN-06 / F4.2: JSON array of partner-bank UUIDs with whom application data '
    'was or will be shared as a result of this DATA_SHARE_WITH_BANK consent. '
    'NULL for non-data-share consent types or when the bank assignment is not yet known. '
    'Example: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"]. '
    'Retained for 7-year DPDP audit trail alongside the HMAC signature.';

-- Partial index for quick lookup: "which consents disclosed data to a given bank?"
CREATE INDEX IF NOT EXISTS idx_consents_shared_with_bank_ids
    ON loan.consents USING GIN (shared_with_bank_ids)
    WHERE shared_with_bank_ids IS NOT NULL;

COMMIT;

-- =============================================================================
-- End 109_loan_consent_device_bank_and_eligibility_status.sql
-- =============================================================================
