-- Migration 040: widen auth.user_profile.pan_number to hold AES-256 encrypted PAN (SEC-013).
-- The column was sized varchar(10) for plaintext PAN (AAAAA9999A), but PAN is stored
-- AES-256-CBC encrypted as Base64(IV[16] || ciphertext) (~64+ chars). Plaintext PAN is
-- never persisted. Additive/idempotent — safe to re-run.

ALTER TABLE auth.user_profile
    ALTER COLUMN pan_number TYPE VARCHAR(512);
