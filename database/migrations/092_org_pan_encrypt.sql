-- DG-SEC-02: Widen auth.organization.pan_number to VARCHAR(512) to accommodate
-- AES-256-GCM ciphertext stored as base64 (nonce + tag + ciphertext envelope).
-- This mirrors migration 040_widen_pan_number.sql which widened auth.user_profile.pan_number.
--
-- IMPORTANT: Existing plaintext PAN values in this column are NOT backfill-encrypted here
-- because the encryption key is only available at application runtime (GCP Secret Manager).
-- A one-time backfill job must be run after deploying this migration and the application code.
-- Until the backfill runs, existing rows return their plaintext value from the
-- DecryptPan helper (which catches decrypt errors and returns the raw value as-is).
--
-- SECURITY NOTE: The plaintext-exact-match index idx_organization_pan_number becomes
-- semantically useless once values are ciphertext. It is dropped here. If PAN-based
-- lookup is required in future, add a deterministic hash column and index that instead.

-- Widen the column
ALTER TABLE auth.organization
    ALTER COLUMN pan_number TYPE VARCHAR(512);

-- Drop the now-useless plaintext-match index (ciphertext values are not equality-searchable)
DROP INDEX IF EXISTS auth.idx_organization_pan_number;
