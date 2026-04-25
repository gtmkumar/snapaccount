-- =============================================================================
-- V2__fix_otp_hash_comment.sql
-- SEC-021: Fix misleading schema comment on auth.otp_request.otp_hash
-- Depends on: 001_auth_schema.sql (auth.otp_request must exist)
-- =============================================================================
-- The OTP hash uses SHA-256 with phone+OTP composite input, NOT bcrypt.
-- bcrypt is too slow for OTP verification; SHA-256 with phone salt is the
-- correct approach here.
--
-- Original inline comment in 001_auth_schema.sql said:
--   otp_hash VARCHAR(256) NOT NULL, -- bcrypt hash of OTP -- never store plain
-- The implementation actually uses: SHA256(phoneNumber + ":" + otp)

COMMENT ON COLUMN auth.otp_request.otp_hash IS
    'SHA-256 hash of composite input: SHA256(phoneNumber + ":" + otp). Phone number acts as salt. Never store plain OTP.';
