-- =============================================================================
-- 111_itr_assessee_profile_columns.sql
-- BUG-ITR-ASSESSEE-MAPPING (High / live-confirmed AND-LIVE-07)
--
-- The EF `Assessee` entity + AssesseeConfiguration map columns that do not exist
-- in the live `itr.assessee_profiles` table, so EVERY EF query against Assessee
-- generates SQL referencing nonexistent columns and 500s. This breaks:
--     GET  /itr/profile
--     PUT  /itr/profile
--     POST /itr/filings
-- and surfaces on mobile as the ITR dashboard "Couldn't load your returns".
--
-- This migration is the ADDITIVE half of the fix. The peer agent `be-diverge`
-- owns the EF config (AssesseeConfiguration.cs + Assessee entity) and supplied the
-- AUTHORITATIVE column spec below (write path persists all 7 fields via
-- UpdateProfileCommand + validation, so an additive migration is the correct
-- direction — Ignore() would drop written data). NO .cs files are touched here.
--
-- ── PART 1: columns the entity maps that are ABSENT from the live table (ADD) ──
--     full_name          VARCHAR(200)              (FullName)
--     assessee_type      VARCHAR(50) NOT NULL DEFAULT 'INDIVIDUAL'  (AssesseeType)
--     email              VARCHAR(200)              (Email)
--     phone_number       VARCHAR(20)               (PhoneNumber)
--     aadhaar_last4      VARCHAR(4)                (AadhaarLast4)
--     address            TEXT                      (Address — flat string, mapped by
--                                                    convention to `address`, NOT the
--                                                    pre-existing rich `address_jsonb`)
--     annual_turnover_cr NUMERIC(18,2)             (AnnualTurnoverCr)
--
--   All are nullable except assessee_type (per be-diverge's authoritative DDL).
--   full_name is app-side IsRequired in the EF config but left nullable at the DB
--   level per that spec (0 rows today; the write path always supplies a value).
--   assessee_type carries a DB default mirroring the EF HasDefaultValue("INDIVIDUAL").
--
--   Already present, NOT touched: dob (DateOfBirth→dob), organization_id (mig 066),
--   anonymized_at / anonymization_reason (mig 068), pan, pan_last4, user_id, id,
--   created_at/_by, updated_at/_by, deleted_at.
--
-- ── PART 2: the REVERSE divergence — live NOT-NULL columns the entity does NOT map ──
-- When EF inserts an Assessee it only supplies the columns the entity models, so any
-- live NOT-NULL column without a default would break the INSERT. Full audit of the
-- live NOT-NULL columns the EF entity does NOT map:
--     ay                  text     NOT NULL, NO default  -> DEFAULT '_PROFILE_' below.
--     residential_status  varchar  NOT NULL, DEFAULT 'RESIDENT' (+ CHECK)  -> OK, DB fills it.
--     is_disability_claim boolean  NOT NULL, DEFAULT false                 -> OK, DB fills it.
--     id / created_at / updated_at  NOT NULL, defaults gen_random_uuid()/now() -> OK.
--     user_id             uuid     NOT NULL, no default -> mapped by the entity (UserId),
--                                   so EF always supplies it. Not touched.
--   (gender, occupation are nullable — no action.)
--
--   `ay` fix — validated against the live constraint set:
--     * ay is type `text`, so it holds the sentinel '_PROFILE_'.
--     * There is a UNIQUE constraint uq_assessee_profiles_user_ay UNIQUE (user_id, ay).
--       The Assessee profile is one-row-per-USER (no per-AY profile concept — assessment
--       year lives on itr.filings). We therefore keep `ay` NOT NULL and give it a DB
--       DEFAULT of the sentinel '_PROFILE_' rather than dropping NOT NULL: an EF insert
--       that omits `ay` gets '_PROFILE_', and UNIQUE(user_id, ay) then enforces exactly
--       one profile row per user. (Dropping NOT NULL would leave ay NULL, and Postgres
--       treats NULLs as DISTINCT in a unique index, which would silently allow multiple
--       profile rows per user — the wrong outcome.)
--     * Table has 0 rows today, so no existing values collide with the sentinel.
--
-- ADDITIVE / idempotent (ADD COLUMN IF NOT EXISTS; SET DEFAULT is naturally re-runnable).
-- No column or table is dropped or renamed. Re-runnable.
-- Depends on: the original itr.assessee_profiles table creation migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — add the entity-mapped columns absent from the live table
-- =============================================================================

ALTER TABLE itr.assessee_profiles
    ADD COLUMN IF NOT EXISTS full_name          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS assessee_type      VARCHAR(50) NOT NULL DEFAULT 'INDIVIDUAL',
    ADD COLUMN IF NOT EXISTS email              VARCHAR(200),
    ADD COLUMN IF NOT EXISTS phone_number       VARCHAR(20),
    ADD COLUMN IF NOT EXISTS aadhaar_last4      VARCHAR(4),
    ADD COLUMN IF NOT EXISTS address            TEXT,
    ADD COLUMN IF NOT EXISTS annual_turnover_cr NUMERIC(18,2);

COMMENT ON COLUMN itr.assessee_profiles.full_name IS
    'BUG-ITR-ASSESSEE-MAPPING: Assessee full name as per PAN (entity FullName). '
    'App-side IsRequired; nullable at DB level per authoritative spec.';
COMMENT ON COLUMN itr.assessee_profiles.assessee_type IS
    'BUG-ITR-ASSESSEE-MAPPING: Assessee type (entity AssesseeType). One of INDIVIDUAL, '
    'HUF, FIRM, COMPANY, AOP, BOI, AJP. DB default mirrors EF HasDefaultValue("INDIVIDUAL").';
COMMENT ON COLUMN itr.assessee_profiles.email IS
    'BUG-ITR-ASSESSEE-MAPPING: Registered email address (entity Email, optional).';
COMMENT ON COLUMN itr.assessee_profiles.phone_number IS
    'BUG-ITR-ASSESSEE-MAPPING: Indian mobile number (entity PhoneNumber, optional).';
COMMENT ON COLUMN itr.assessee_profiles.aadhaar_last4 IS
    'BUG-ITR-ASSESSEE-MAPPING: Last 4 digits of Aadhaar for masked display '
    '(entity AadhaarLast4, optional). NEVER stores the full Aadhaar number.';
COMMENT ON COLUMN itr.assessee_profiles.address IS
    'BUG-ITR-ASSESSEE-MAPPING: Residential address as a flat string (entity Address, '
    'mapped by convention to `address`). Distinct from the pre-existing structured '
    '`address_jsonb` column, which is left untouched.';
COMMENT ON COLUMN itr.assessee_profiles.annual_turnover_cr IS
    'BUG-ITR-ASSESSEE-MAPPING: Annual turnover in crore for business assessees '
    '(entity AnnualTurnoverCr, optional).';

-- =============================================================================
-- PART 2 — default the reverse-divergence NOT-NULL column the entity does not map
-- =============================================================================

-- `ay` is NOT NULL with no default and is NOT modelled by the EF entity, so an EF
-- INSERT (which omits it) would fail. Give it a sentinel default so the insert
-- succeeds while UNIQUE(user_id, ay) still enforces one profile row per user.
ALTER TABLE itr.assessee_profiles
    ALTER COLUMN ay SET DEFAULT '_PROFILE_';

COMMENT ON COLUMN itr.assessee_profiles.ay IS
    'BUG-ITR-ASSESSEE-MAPPING: DEFAULT ''_PROFILE_'' added in migration 111. The EF '
    'Assessee entity does not model an assessment year on the profile (AY is per-filing '
    'on itr.filings); the profile is one-row-per-user. Kept NOT NULL with this sentinel '
    'so EF inserts that omit ay succeed and UNIQUE(user_id, ay) enforces one row per user.';

COMMIT;

-- =============================================================================
-- End 111_itr_assessee_profile_columns.sql
-- =============================================================================
