-- =============================================================================
-- 106: Add cooldown_minutes to auth.otp_request (DG-AUTH-07)
--
-- Background: OTP validity / attempt limits were previously hardcoded in OtpService
-- (5 min validity, 3 max attempts, 30-min cooldown). DG-AUTH-07 makes these
-- config-driven (Auth:Otp section in appsettings.json). The per-row cooldown_minutes
-- column lets OtpRequest.IncrementAttempt() use the value that was in effect at
-- creation time rather than re-reading config at verify time (handles hot config
-- changes safely).
--
-- Additive only — default of 30 preserves existing behaviour for all rows created
-- before this migration. No data loss, no schema renames.
-- =============================================================================

BEGIN;

ALTER TABLE auth.otp_request
    ADD COLUMN IF NOT EXISTS cooldown_minutes SMALLINT NOT NULL DEFAULT 30;

COMMENT ON COLUMN auth.otp_request.cooldown_minutes IS
    'Cooldown duration (minutes) applied when max_attempts is reached. '
    'Populated from Auth:Otp:CooldownMinutes config at row creation time (DG-AUTH-07). '
    'Default 30 matches the pre-config legacy value.';

COMMIT;
