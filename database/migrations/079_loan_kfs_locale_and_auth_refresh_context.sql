-- =============================================================================
-- 079_loan_kfs_locale_and_auth_refresh_context.sql
-- LoanService: ADD locale column to loan.key_facts_statement (NEW-D10 backend half)
-- AuthService: no schema changes (org-switcher backend is pure application logic)
--
-- ADDITIVE migration — idempotent / re-runnable.
-- Depends on: 063_loan_key_facts_statement_and_cooling_off.sql
-- =============================================================================

-- =============================================================================
-- 1. loan.key_facts_statement — add locale column
--
-- The KFS locale records which language version of the RBI Key Facts Statement
-- was generated and served to the borrower. The resolution chain is:
--   caller param → user preference → org default → 'en' (fallback)
--
-- Supported locales: en, hi, bn (configurable via Loan:SupportedKfsLocales).
-- RBI KFS is statutory — 'en' is always the ultimate fallback, never a failure.
--
-- EF: KeyFactsStatementConfiguration → property Locale, column locale,
--     varchar(10) NOT NULL DEFAULT 'en'.
-- =============================================================================

ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN loan.key_facts_statement.locale IS
    'BCP-47 locale tag for this KFS version (e.g. en, hi, bn). '
    'Immutable after generation — the signed fields trigger already enforces '
    'that locale cannot be modified once stored.';

-- Patch the immutable-fields trigger to include locale in the guard.
-- The existing trigger function (fn_kfs_immutable_signed_fields) was generated
-- by migration 063 and needs updating so that locale is also treated as signed/immutable.
-- We DROP and recreate the function only.

DROP FUNCTION IF EXISTS fn_kfs_immutable_signed_fields() CASCADE;

CREATE OR REPLACE FUNCTION fn_kfs_immutable_signed_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Signed / legally-immutable fields: raise if any of them change.
    -- acknowledged_at, audit columns (created_at, updated_at, created_by, updated_by),
    -- and deleted_at ARE permitted to change.
    IF  (NEW.application_id          IS DISTINCT FROM OLD.application_id)
     OR (NEW.annual_percentage_rate  IS DISTINCT FROM OLD.annual_percentage_rate)
     OR (NEW.loan_amount             IS DISTINCT FROM OLD.loan_amount)
     OR (NEW.tenure_months           IS DISTINCT FROM OLD.tenure_months)
     OR (NEW.monthly_emi             IS DISTINCT FROM OLD.monthly_emi)
     OR (NEW.fees_json               IS DISTINCT FROM OLD.fees_json)
     OR (NEW.repayment_schedule_json IS DISTINCT FROM OLD.repayment_schedule_json)
     OR (NEW.lender_name             IS DISTINCT FROM OLD.lender_name)
     OR (NEW.grievance_officer_contact IS DISTINCT FROM OLD.grievance_officer_contact)
     OR (NEW.cooling_off_days        IS DISTINCT FROM OLD.cooling_off_days)
     OR (NEW.hmac_signature          IS DISTINCT FROM OLD.hmac_signature)
     OR (NEW.generated_at            IS DISTINCT FROM OLD.generated_at)
     OR (NEW.locale                  IS DISTINCT FROM OLD.locale)
    THEN
        RAISE EXCEPTION
            'loan.key_facts_statement signed fields are immutable (RBI KFS integrity). '
            'Only acknowledged_at, audit, and deleted_at may change.';
    END IF;
    RETURN NEW;
END;
$$;

-- Re-attach trigger (CASCADE above already dropped the old one)
DROP TRIGGER IF EXISTS trg_kfs_immutable_signed_fields ON loan.key_facts_statement;
CREATE TRIGGER trg_kfs_immutable_signed_fields
    BEFORE UPDATE ON loan.key_facts_statement
    FOR EACH ROW EXECUTE FUNCTION fn_kfs_immutable_signed_fields();

-- =============================================================================
-- 2. Index for locale-scoped KFS retrieval
--    GET /loans/applications/{id}/kfs?locale=hi needs to find the hi variant fast.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_key_facts_statement_application_locale
    ON loan.key_facts_statement (application_id, locale)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- End 079_loan_kfs_locale_and_auth_refresh_context.sql
-- =============================================================================
