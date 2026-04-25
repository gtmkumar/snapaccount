-- =============================================================================
-- 005_loan_schema.sql
-- Loan Service — Eligibility, Applications, Partner Banks, EMI
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS loan;

-- =============================================================================
-- loan.loan_type
-- Reference table for loan categories (Business, Working Capital, Personal, MSME-Mudra)
-- =============================================================================
CREATE TABLE loan.loan_type (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    min_amount      NUMERIC(20,2),
    max_amount      NUMERIC(20,2),
    min_tenure_months SMALLINT,
    max_tenure_months SMALLINT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_loan_type_code ON loan.loan_type (code);

CREATE TRIGGER trg_loan_type_updated_at
    BEFORE UPDATE ON loan.loan_type
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.partner_bank
-- Partner banks configured via admin panel (adapter pattern)
-- =============================================================================
CREATE TABLE loan.partner_bank (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_code           VARCHAR(50) NOT NULL UNIQUE,
    bank_name           VARCHAR(300) NOT NULL,
    bank_logo_url       TEXT,
    api_endpoint        TEXT,                        -- Configured by admin
    api_key_secret_ref  VARCHAR(200),               -- GCP Secret Manager reference
    supported_loan_types JSONB,                      -- Array of loan_type codes
    min_interest_rate   NUMERIC(6,3),
    max_interest_rate   NUMERIC(6,3),
    min_loan_amount     NUMERIC(20,2),
    max_loan_amount     NUMERIC(20,2),
    processing_fee_pct  NUMERIC(5,2),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    contact_email       VARCHAR(320),
    contact_phone       VARCHAR(20),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_partner_bank_code ON loan.partner_bank (bank_code);
CREATE INDEX idx_partner_bank_is_active ON loan.partner_bank (is_active);

CREATE TRIGGER trg_partner_bank_updated_at
    BEFORE UPDATE ON loan.partner_bank
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.eligibility_criteria
-- Eligibility rules per loan type (managed by admin)
-- =============================================================================
CREATE TABLE loan.eligibility_criteria (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_type_id                UUID NOT NULL REFERENCES loan.loan_type (id),
    partner_bank_id             UUID REFERENCES loan.partner_bank (id),  -- NULL = global criteria
    min_business_vintage_months SMALLINT,
    min_annual_turnover_inr     NUMERIC(20,2),
    min_gst_compliance_months   SMALLINT,
    min_credit_score            SMALLINT,
    kyc_required                BOOLEAN NOT NULL DEFAULT TRUE,
    gst_returns_required        BOOLEAN NOT NULL DEFAULT TRUE,
    bank_statements_required    BOOLEAN NOT NULL DEFAULT TRUE,
    months_gst_returns_required SMALLINT NOT NULL DEFAULT 12,
    months_bank_statements_required SMALLINT NOT NULL DEFAULT 12,
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX idx_eligibility_loan_type_id ON loan.eligibility_criteria (loan_type_id);
CREATE INDEX idx_eligibility_bank_id ON loan.eligibility_criteria (partner_bank_id) WHERE partner_bank_id IS NOT NULL;

CREATE TRIGGER trg_eligibility_criteria_updated_at
    BEFORE UPDATE ON loan.eligibility_criteria
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.loan_application
-- Core loan application lifecycle
-- =============================================================================
CREATE TABLE loan.loan_application (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,               -- auth.user.id
    organization_id     UUID NOT NULL,               -- auth.organization.id
    loan_type_id        UUID NOT NULL REFERENCES loan.loan_type (id),
    partner_bank_id     UUID REFERENCES loan.partner_bank (id),
    application_number  VARCHAR(100) NOT NULL UNIQUE,
    requested_amount    NUMERIC(20,2) NOT NULL,
    requested_tenure_months SMALLINT NOT NULL,
    purpose             TEXT,
    status              VARCHAR(60) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','DOCUMENTS_READY','SUBMITTED',
                                'UNDER_REVIEW','ADDITIONAL_DOCS_NEEDED',
                                'APPROVED','DISBURSED','REJECTED','WITHDRAWN'
                            )),
    -- Eligibility check
    eligibility_check_passed BOOLEAN,
    eligibility_checked_at TIMESTAMPTZ,
    eligibility_notes   TEXT,
    -- Bank response
    bank_reference_number VARCHAR(100),
    bank_status         VARCHAR(100),
    bank_status_updated_at TIMESTAMPTZ,
    approved_amount     NUMERIC(20,2),
    approved_interest_rate NUMERIC(6,3),
    approved_tenure_months SMALLINT,
    rejection_reason    TEXT,
    -- Important timestamps
    submitted_at        TIMESTAMPTZ,
    approved_at         TIMESTAMPTZ,
    disbursed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_loan_app_user_id ON loan.loan_application (user_id);
CREATE INDEX idx_loan_app_org_id ON loan.loan_application (organization_id);
CREATE INDEX idx_loan_app_loan_type_id ON loan.loan_application (loan_type_id);
CREATE INDEX idx_loan_app_bank_id ON loan.loan_application (partner_bank_id) WHERE partner_bank_id IS NOT NULL;
CREATE INDEX idx_loan_app_status ON loan.loan_application (status);
CREATE INDEX idx_loan_app_app_number ON loan.loan_application (application_number);

ALTER TABLE loan.loan_application ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_loan_application_updated_at
    BEFORE UPDATE ON loan.loan_application
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.document_package
-- Auto-generated document packages for loan applications
-- =============================================================================
CREATE TABLE loan.document_package (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan.loan_application (id) ON DELETE CASCADE,
    package_type        VARCHAR(100) NOT NULL DEFAULT 'STANDARD',
    storage_path        TEXT,                        -- GCS path to generated PDF
    watermark_text      VARCHAR(200),
    included_documents  JSONB,                       -- List of document IDs included
    generated_at        TIMESTAMPTZ,
    is_submitted        BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_doc_package_loan_app_id ON loan.document_package (loan_application_id);

ALTER TABLE loan.document_package ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_document_package_updated_at
    BEFORE UPDATE ON loan.document_package
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.loan_consent
-- Explicit user consent for data sharing with banks (RBI guidelines)
-- =============================================================================
CREATE TABLE loan.loan_consent (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan.loan_application (id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    consent_text        TEXT NOT NULL,               -- Exact consent text shown to user
    consent_version     VARCHAR(50) NOT NULL,
    is_granted          BOOLEAN NOT NULL,
    granted_at          TIMESTAMPTZ,
    ip_address          INET,
    device_id           VARCHAR(256),
    is_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at          TIMESTAMPTZ,
    revocation_reason   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_loan_consent_loan_app_id ON loan.loan_consent (loan_application_id);
CREATE INDEX idx_loan_consent_user_id ON loan.loan_consent (user_id);

ALTER TABLE loan.loan_consent ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_loan_consent_updated_at
    BEFORE UPDATE ON loan.loan_consent
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.loan_offer
-- Offers received from banks for a loan application
-- =============================================================================
CREATE TABLE loan.loan_offer (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan.loan_application (id) ON DELETE CASCADE,
    partner_bank_id     UUID NOT NULL REFERENCES loan.partner_bank (id),
    offer_amount        NUMERIC(20,2) NOT NULL,
    interest_rate_pct   NUMERIC(6,3) NOT NULL,
    tenure_months       SMALLINT NOT NULL,
    processing_fee      NUMERIC(20,2),
    emi_amount          NUMERIC(20,2),
    offer_valid_until   DATE,
    terms_and_conditions TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
    accepted_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_loan_offer_app_id ON loan.loan_offer (loan_application_id);
CREATE INDEX idx_loan_offer_bank_id ON loan.loan_offer (partner_bank_id);
CREATE INDEX idx_loan_offer_status ON loan.loan_offer (status);

ALTER TABLE loan.loan_offer ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_loan_offer_updated_at
    BEFORE UPDATE ON loan.loan_offer
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.loan_disbursement
-- Disbursement tracking
-- =============================================================================
CREATE TABLE loan.loan_disbursement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan.loan_application (id),
    partner_bank_id     UUID NOT NULL REFERENCES loan.partner_bank (id),
    disbursement_amount NUMERIC(20,2) NOT NULL,
    disbursement_date   DATE NOT NULL,
    bank_transaction_ref VARCHAR(200),
    account_number      VARCHAR(100),                -- Masked
    ifsc_code           VARCHAR(20),
    utr_number          VARCHAR(100),
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_loan_disbursement_app_id ON loan.loan_disbursement (loan_application_id);
CREATE INDEX idx_loan_disbursement_bank_id ON loan.loan_disbursement (partner_bank_id);

ALTER TABLE loan.loan_disbursement ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_loan_disbursement_updated_at
    BEFORE UPDATE ON loan.loan_disbursement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- loan.emi_schedule
-- EMI schedule for approved/disbursed loans
-- =============================================================================
CREATE TABLE loan.emi_schedule (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan.loan_application (id),
    installment_number  SMALLINT NOT NULL,
    due_date            DATE NOT NULL,
    emi_amount          NUMERIC(20,2) NOT NULL,
    principal_component NUMERIC(20,2) NOT NULL,
    interest_component  NUMERIC(20,2) NOT NULL,
    outstanding_balance NUMERIC(20,2) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','PAID','OVERDUE','WAIVED')),
    paid_amount         NUMERIC(20,2),
    paid_at             TIMESTAMPTZ,
    payment_reference   VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (loan_application_id, installment_number)
);

CREATE INDEX idx_emi_schedule_app_id ON loan.emi_schedule (loan_application_id);
CREATE INDEX idx_emi_schedule_due_date ON loan.emi_schedule (due_date);
CREATE INDEX idx_emi_schedule_status ON loan.emi_schedule (status);

ALTER TABLE loan.emi_schedule ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_emi_schedule_updated_at
    BEFORE UPDATE ON loan.emi_schedule
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY loan_app_isolation ON loan.loan_application
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR organization_id IN (
               SELECT om.organization_id FROM auth.organization_member om
               WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
           ));

CREATE POLICY doc_package_isolation ON loan.document_package
    USING (loan_application_id IN (
        SELECT id FROM loan.loan_application
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY loan_consent_isolation ON loan.loan_consent
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY loan_offer_isolation ON loan.loan_offer
    USING (loan_application_id IN (
        SELECT id FROM loan.loan_application
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY loan_disbursement_isolation ON loan.loan_disbursement
    USING (loan_application_id IN (
        SELECT id FROM loan.loan_application
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY emi_schedule_isolation ON loan.emi_schedule
    USING (loan_application_id IN (
        SELECT id FROM loan.loan_application
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
