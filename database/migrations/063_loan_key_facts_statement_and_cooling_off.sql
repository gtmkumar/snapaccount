-- =============================================================================
-- 063_loan_key_facts_statement_and_cooling_off.sql
-- LoanService — Phase 7 Wave 2 (backend B7/B8: RBI Digital Lending Guidelines
-- — Key Facts Statement (KFS) + GAP-021 cooling-off window). ADDITIVE migration.
-- Extends 026_loan_products_applications.sql. Does NOT rename/drop any column.
-- Idempotent / re-runnable.
--
-- Context
-- -------
-- backend-agent merged the KeyFactsStatement EF entity/configuration and added
-- CoolingOffEndsAt/CoolingOffDays to the LoanApplication entity, all with NO
-- backing SQL (LoanService has no EF migrations — these SQL files are canonical).
--
-- Two deltas:
--   1. NEW TABLE loan.key_facts_statement
--      EF: KeyFactsStatementConfiguration → LoanService.Domain.Entities.KeyFactsStatement
--   2. ADD COLUMNS on the EXISTING loan.applications table (created by 026):
--         cooling_off_ends_at TIMESTAMPTZ NULL
--         cooling_off_days    INT         NULL
--      EF: LoanApplicationConfiguration maps CoolingOffEndsAt → cooling_off_ends_at,
--          CoolingOffDays → cooling_off_days. (The EF table is loan.applications,
--          NOT loan.loan_applications as the handoff list tentatively stated.)
--
-- NOTE on RecordConsent / kfs_id linkage (handoff item to verify):
--   The new RecordConsentCommand requires a KfsId, but the Consent ENTITY and
--   ConsentConfiguration have NO KfsId property/column — the handler only uses
--   KfsId to look up + acknowledge the KFS (it is NOT persisted on loan.consents).
--   Therefore NO kfs_id column/FK is added to loan.consents. (Confirmed against
--   ConsentConfiguration.cs and RecordConsentCommandHandler.)
--
-- Compliance: RBI Digital Lending Guidelines 2022. The KFS is HMAC-SHA256 signed
-- and is an immutable legal artifact served before consent. A no-MODIFY trigger
-- enforces integrity of the signed fields while still allowing the borrower
-- acknowledgement (acknowledged_at), audit stamping, and soft-delete.
--
-- Depends on: 000_init.sql, 026_loan_products_applications.sql.
-- =============================================================================


-- =============================================================================
-- 1. loan.key_facts_statement — RBI KFS (HMAC-signed, immutable signed fields)
--    EF: KeyFactsStatementConfiguration → KeyFactsStatement : BaseAuditableEntity
-- =============================================================================
CREATE TABLE IF NOT EXISTS loan.key_facts_statement (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK to the loan application (Phase 6C v2 table). Many KFS per application are
    -- allowed (re-generation/versioning), so this is not unique.
    application_id              UUID NOT NULL REFERENCES loan.applications (id),
    -- APR (%), inclusive of all fees. EF HasPrecision(10,4).
    annual_percentage_rate      NUMERIC(10,4) NOT NULL,
    -- Loan amount in INR. EF HasPrecision(18,2).
    loan_amount                 NUMERIC(18,2) NOT NULL,
    -- Loan tenure in months.
    tenure_months               INTEGER       NOT NULL,
    -- Monthly EMI in INR. EF HasPrecision(18,2).
    monthly_emi                 NUMERIC(18,2) NOT NULL,
    -- JSON fee itemisation: [{ name, amount, type }]. EF jsonb.
    fees_json                   JSONB,
    -- JSON repayment schedule: [{ emiNumber, dueDate, principal, interest, total }]. EF jsonb.
    repayment_schedule_json     JSONB,
    -- Lender (partner bank / NBFC) name. (max 200)
    lender_name                 VARCHAR(200),
    -- Grievance-officer contact (name, email, phone), config-driven. (max 1000)
    grievance_officer_contact   VARCHAR(1000),
    -- Cooling-off window in calendar days (RBI minimum = 3).
    cooling_off_days            INTEGER       NOT NULL,
    -- HMAC-SHA256 signature over the canonical payload (base64). (max 500)
    hmac_signature              VARCHAR(500),
    -- When the KFS was generated.
    generated_at                TIMESTAMPTZ   NOT NULL,
    -- When the borrower acknowledged the KFS; NULL until acknowledged (mutable once).
    acknowledged_at             TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,             -- EF global soft-delete filter
    created_by                  UUID,
    updated_by                  UUID
);

-- EF: builder.HasIndex(ApplicationId) → ix_key_facts_statement_application_id
CREATE INDEX IF NOT EXISTS ix_key_facts_statement_application_id
    ON loan.key_facts_statement (application_id);

DROP TRIGGER IF EXISTS trg_key_facts_statement_updated_at ON loan.key_facts_statement;
CREATE TRIGGER trg_key_facts_statement_updated_at
    BEFORE UPDATE ON loan.key_facts_statement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Immutability guard: the signed core fields of a KFS must never change after it
-- is generated (RBI legal artifact + the HMAC must keep verifying). The borrower
-- acknowledgement (acknowledged_at), audit columns (updated_at/updated_by) and
-- soft-delete (deleted_at) ARE allowed to change. Any attempt to mutate a signed
-- field raises an exception. Uses IS DISTINCT FROM so NULLs compare safely.
CREATE OR REPLACE FUNCTION loan.prevent_kfs_signed_field_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.application_id            IS DISTINCT FROM OLD.application_id
       OR NEW.annual_percentage_rate IS DISTINCT FROM OLD.annual_percentage_rate
       OR NEW.loan_amount            IS DISTINCT FROM OLD.loan_amount
       OR NEW.tenure_months          IS DISTINCT FROM OLD.tenure_months
       OR NEW.monthly_emi            IS DISTINCT FROM OLD.monthly_emi
       OR NEW.fees_json              IS DISTINCT FROM OLD.fees_json
       OR NEW.repayment_schedule_json IS DISTINCT FROM OLD.repayment_schedule_json
       OR NEW.lender_name            IS DISTINCT FROM OLD.lender_name
       OR NEW.grievance_officer_contact IS DISTINCT FROM OLD.grievance_officer_contact
       OR NEW.cooling_off_days       IS DISTINCT FROM OLD.cooling_off_days
       OR NEW.hmac_signature         IS DISTINCT FROM OLD.hmac_signature
       OR NEW.generated_at           IS DISTINCT FROM OLD.generated_at
    THEN
        RAISE EXCEPTION 'loan.key_facts_statement signed fields are immutable (RBI KFS integrity). Only acknowledged_at, audit, and deleted_at may change.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kfs_immutable_signed_fields ON loan.key_facts_statement;
CREATE TRIGGER trg_kfs_immutable_signed_fields
    BEFORE UPDATE ON loan.key_facts_statement
    FOR EACH ROW EXECUTE FUNCTION loan.prevent_kfs_signed_field_update();

-- RLS: org-scoped via the parent application (mirrors loan.consents in 027).
ALTER TABLE loan.key_facts_statement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS key_facts_statement_isolation ON loan.key_facts_statement;
CREATE POLICY key_facts_statement_isolation ON loan.key_facts_statement
    USING (
        application_id IN (
            SELECT a.id FROM loan.applications a
            WHERE a.org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
            )
        )
    );

COMMENT ON TABLE loan.key_facts_statement IS
    'RBI Digital Lending Guidelines — Key Facts Statement. HMAC-signed, immutable signed fields (enforced by trg_kfs_immutable_signed_fields); only acknowledged_at is mutable.';


-- =============================================================================
-- 2. loan.applications — GAP-021 RBI cooling-off window columns
--    EF: LoanApplicationConfiguration maps these on the EXISTING table.
-- =============================================================================
ALTER TABLE loan.applications
    ADD COLUMN IF NOT EXISTS cooling_off_ends_at TIMESTAMPTZ NULL;

ALTER TABLE loan.applications
    ADD COLUMN IF NOT EXISTS cooling_off_days INT NULL;

COMMENT ON COLUMN loan.applications.cooling_off_ends_at IS
    'GAP-021 (RBI DL Guidelines): UTC end of the post-disbursement cooling-off window. NULL until disbursed.';
COMMENT ON COLUMN loan.applications.cooling_off_days IS
    'GAP-021 (RBI DL Guidelines): number of cooling-off days granted, copied from the acknowledged KFS. NULL until disbursed.';

-- =============================================================================
-- End 063_loan_key_facts_statement_and_cooling_off.sql
-- =============================================================================
