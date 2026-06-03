-- =============================================================================
-- 053_auth_kyc_gov_verification_toggle.sql
-- Auth — per-org government-verification toggle + KYC kind/status extension.
-- ADDITIVE migration. Extends 052_auth_kyc_verification.sql. Does NOT rewrite it.
-- Idempotent / re-runnable.
--
--   1. auth.organization.government_verification_enabled (boolean, default false):
--      per-org switch. When OFF, KYC numbers are stored unverified (status 'SAVED').
--   2. auth.kyc_verification:
--        - kind   now allows 'PAN','AADHAAR','GSTIN','TAN'
--        - status now allows 'SAVED','PENDING','VERIFIED','FAILED'
--          ('SAVED' = number stored unverified while gov verification is OFF)
--   3. Partial unique index ux_kyc_verification_user_kind (user_id, kind)
--      WHERE deleted_at IS NULL — at most one active record per user per kind,
--      enabling upsert semantics.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Per-organization government-verification toggle
-- -----------------------------------------------------------------------------
ALTER TABLE auth.organization
    ADD COLUMN IF NOT EXISTS government_verification_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 2. Extend kyc_verification CHECK constraints (drop + recreate idempotently)
--    kind:   PAN, AADHAAR, GSTIN, TAN
--    status: SAVED, PENDING, VERIFIED, FAILED
-- -----------------------------------------------------------------------------
ALTER TABLE auth.kyc_verification
    DROP CONSTRAINT IF EXISTS kyc_verification_kind_check;
ALTER TABLE auth.kyc_verification
    ADD CONSTRAINT kyc_verification_kind_check
        CHECK (kind IN ('PAN','AADHAAR','GSTIN','TAN'));

ALTER TABLE auth.kyc_verification
    DROP CONSTRAINT IF EXISTS kyc_verification_status_check;
ALTER TABLE auth.kyc_verification
    ADD CONSTRAINT kyc_verification_status_check
        CHECK (status IN ('SAVED','PENDING','VERIFIED','FAILED'));

-- -----------------------------------------------------------------------------
-- 3. At-most-one active record per (user_id, kind) — enables upsert.
--    Defensive de-dup of any pre-existing active duplicates (e.g. from earlier
--    E2E runs): soft-delete all but the most-recently-created row per group so
--    the unique index can be created.
-- -----------------------------------------------------------------------------
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, kind
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM auth.kyc_verification
    WHERE deleted_at IS NULL
)
UPDATE auth.kyc_verification k
SET deleted_at = NOW()
FROM ranked
WHERE k.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_kyc_verification_user_kind
    ON auth.kyc_verification (user_id, kind)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- End 053
-- =============================================================================
