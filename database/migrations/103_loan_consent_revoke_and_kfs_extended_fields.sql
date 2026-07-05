-- =============================================================================
-- 103_loan_consent_revoke_and_kfs_extended_fields.sql
-- LoanService — DG-LOAN-04 + DG-LOAN-05
--
-- DG-LOAN-04: Add DPDP-compliant consent revocation columns to loan.consents.
--   DPDP Act 2023 s.6: data principal may withdraw consent at any time.
--   Revocation is APPEND-ONLY — the original signed record is never deleted or
--   mutated. The revoked_at timestamp + reason are written in a separate UPDATE
--   that the existing DB trigger (trg_consents_no_delete) never fires on.
--   A revoked DATA_SHARE_WITH_BANK / DISBURSEMENT_MANDATE consent MUST block
--   further bank data sharing / disbursement (enforced in application layer).
--
-- DG-LOAN-05: Add structured KFS response fields to loan.key_facts_statement.
--   The mobile KFS screen requires fields currently absent from the server
--   response: nominal_interest_rate, total_fees, net_disbursal_amount,
--   total_amount_payable, cooling_off_terms (locale-aware text), and a
--   structured grievance officer JSON. Rather than breaking the immutability
--   invariant, these NEW columns are included in the immutability trigger so
--   they too become legally locked once written.
--
-- ADDITIVE / idempotent. Depends on: 027_loan_documents_consents.sql,
--   063_loan_key_facts_statement_and_cooling_off.sql,
--   079_loan_kfs_locale_and_auth_refresh_context.sql.
-- =============================================================================


-- =============================================================================
-- PART 1 — DG-LOAN-04: loan.consents revocation columns
-- =============================================================================

-- revoked_at: NULL = active consent; NOT NULL = revoked.
ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS revoked_at         TIMESTAMPTZ  NULL;

-- revocation_reason: free-text reason supplied by the data principal or operator.
ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS revocation_reason  VARCHAR(500) NULL;

COMMENT ON COLUMN loan.consents.revoked_at IS
    'DG-LOAN-04 / DPDP Act 2023 s.6: UTC timestamp when the data principal revoked '
    'this consent. NULL = consent is active. Revocation is append-only — the original '
    'signed record (signature_hash, signed_at, user_id, ip_address, user_agent) is '
    'never modified. A revoked DATA_SHARE_WITH_BANK or DISBURSEMENT_MANDATE consent '
    'blocks further bank data sharing and disbursement (enforced in application layer).';

COMMENT ON COLUMN loan.consents.revocation_reason IS
    'DG-LOAN-04: Optional reason supplied by the data principal at revocation time. '
    'Retained for DPDP audit trail (7-year retention alongside the original consent).';

CREATE INDEX IF NOT EXISTS idx_consents_revoked_at
    ON loan.consents (application_id, revoked_at)
    WHERE revoked_at IS NOT NULL;


-- =============================================================================
-- PART 2 — DG-LOAN-05: loan.key_facts_statement extended fields
-- =============================================================================

-- Nominal interest rate (% p.a., 2 d.p.) — distinct from APR which includes fees.
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS nominal_interest_rate   NUMERIC(10,4) NULL;

-- Interest calculation type (e.g. REDUCING_BALANCE, FLAT_RATE).
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS interest_type           VARCHAR(30)   NULL;

-- Total of all fees itemised in fees_json (INR, pre-computed for display).
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS total_fees              NUMERIC(18,2) NULL;

-- Net amount credited to borrower's account = loan_amount − total_fees.
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS net_disbursal_amount    NUMERIC(18,2) NULL;

-- Total amount payable over the loan life = loan_amount + total_interest + total_fees.
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS total_amount_payable    NUMERIC(18,2) NULL;

-- Locale-specific cooling-off plain-language text (versioned per locale).
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS cooling_off_terms       TEXT          NULL;

-- Structured grievance officer object (JSONB) per RBI mandate.
-- Schema: { name, phone, email, address, hours, escalation }
ALTER TABLE loan.key_facts_statement
    ADD COLUMN IF NOT EXISTS grievance_officer_json  JSONB         NULL;

COMMENT ON COLUMN loan.key_facts_statement.nominal_interest_rate IS
    'DG-LOAN-05: Nominal annual interest rate (%) before fees. Displayed alongside APR.';

COMMENT ON COLUMN loan.key_facts_statement.interest_type IS
    'DG-LOAN-05: e.g. REDUCING_BALANCE or FLAT_RATE. Drives the "Nominal interest rate: X% p.a. (reducing balance)" caption.';

COMMENT ON COLUMN loan.key_facts_statement.total_fees IS
    'DG-LOAN-05: Sum of all fee amounts in fees_json. Pre-computed for display in FeeItemizationTable.';

COMMENT ON COLUMN loan.key_facts_statement.net_disbursal_amount IS
    'DG-LOAN-05: Amount actually credited to borrower = loan_amount − total_fees (fees deducted upfront). RBI KFS mandatory disclosure.';

COMMENT ON COLUMN loan.key_facts_statement.total_amount_payable IS
    'DG-LOAN-05: Total outflow = EMI × tenure_months. RBI KFS mandatory disclosure in LoanSnapshotGrid.';

COMMENT ON COLUMN loan.key_facts_statement.cooling_off_terms IS
    'DG-LOAN-05: Locale-specific plain-language cooling-off explanation text (versioned). e.g. "You may exit this loan within 3 days of disbursal by repaying the principal + proportionate APR…". Immutable once signed.';

COMMENT ON COLUMN loan.key_facts_statement.grievance_officer_json IS
    'DG-LOAN-05: Structured grievance officer {name,phone,email,address,hours,escalation}. Immutable once signed. Replaces the flat grievance_officer_contact for new KFS records; old records retain the flat string.';

-- Update the immutability trigger to protect the new signed fields.
-- These new fields are part of the signed legal artifact; they MUST NOT change
-- after the KFS is generated and the HMAC is computed.
-- The trigger function name was changed from loan.prevent_kfs_signed_field_update
-- to fn_kfs_immutable_signed_fields in migration 079; we recreate it here.

CREATE OR REPLACE FUNCTION fn_kfs_immutable_signed_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF  (NEW.application_id            IS DISTINCT FROM OLD.application_id)
     OR (NEW.annual_percentage_rate    IS DISTINCT FROM OLD.annual_percentage_rate)
     OR (NEW.loan_amount               IS DISTINCT FROM OLD.loan_amount)
     OR (NEW.tenure_months             IS DISTINCT FROM OLD.tenure_months)
     OR (NEW.monthly_emi               IS DISTINCT FROM OLD.monthly_emi)
     OR (NEW.fees_json                 IS DISTINCT FROM OLD.fees_json)
     OR (NEW.repayment_schedule_json   IS DISTINCT FROM OLD.repayment_schedule_json)
     OR (NEW.lender_name               IS DISTINCT FROM OLD.lender_name)
     OR (NEW.grievance_officer_contact IS DISTINCT FROM OLD.grievance_officer_contact)
     OR (NEW.cooling_off_days          IS DISTINCT FROM OLD.cooling_off_days)
     OR (NEW.hmac_signature            IS DISTINCT FROM OLD.hmac_signature)
     OR (NEW.generated_at              IS DISTINCT FROM OLD.generated_at)
     OR (NEW.locale                    IS DISTINCT FROM OLD.locale)
     -- DG-LOAN-05 new signed fields
     OR (NEW.nominal_interest_rate     IS DISTINCT FROM OLD.nominal_interest_rate)
     OR (NEW.interest_type             IS DISTINCT FROM OLD.interest_type)
     OR (NEW.total_fees                IS DISTINCT FROM OLD.total_fees)
     OR (NEW.net_disbursal_amount      IS DISTINCT FROM OLD.net_disbursal_amount)
     OR (NEW.total_amount_payable      IS DISTINCT FROM OLD.total_amount_payable)
     OR (NEW.cooling_off_terms         IS DISTINCT FROM OLD.cooling_off_terms)
     OR (NEW.grievance_officer_json    IS DISTINCT FROM OLD.grievance_officer_json)
    THEN
        RAISE EXCEPTION
            'loan.key_facts_statement signed fields are immutable (RBI KFS integrity). '
            'Only acknowledged_at, audit, and deleted_at may change.';
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger is already attached via CASCADE from 079; ensure it is present.
DROP TRIGGER IF EXISTS trg_kfs_immutable_signed_fields ON loan.key_facts_statement;
CREATE TRIGGER trg_kfs_immutable_signed_fields
    BEFORE UPDATE ON loan.key_facts_statement
    FOR EACH ROW EXECUTE FUNCTION fn_kfs_immutable_signed_fields();

-- =============================================================================
-- End 103_loan_consent_revoke_and_kfs_extended_fields.sql
-- =============================================================================
