-- =============================================================================
-- 014_high_priority_services.sql
-- High Priority Services — Professional Tax, GST Refund, GST Annual Return,
-- Advance Tax, LUT Filing, Valuation, Section 206AB, Lower TDS Certificate,
-- Virtual CFO / MIS, Unified Compliance Calendar
-- Depends on: 000_init.sql, 001_auth_schema.sql, 004_gst_schema.sql,
--             006_itr_schema.sql, 013_additional_services_schema.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- NEW SCHEMAS
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS valuation;
CREATE SCHEMA IF NOT EXISTS vcfo;


-- #############################################################################
-- 1. PROFESSIONAL TAX (payroll schema — extend)
-- #############################################################################

-- =============================================================================
-- payroll.professional_tax_registration
-- State-level Professional Tax employer registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.professional_tax_registration (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    state_code              VARCHAR(5) NOT NULL,                           -- e.g. 'MH','KA','WB'
    pt_registration_number  VARCHAR(100),
    registration_date       TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','ACTIVE','SUSPENDED','CANCELLED','SURRENDERED'
                                )),
    employer_type           VARCHAR(30) NOT NULL DEFAULT 'COMPANY'
                                CHECK (employer_type IN (
                                    'COMPANY','LLP','PARTNERSHIP','PROPRIETORSHIP',
                                    'HUF','TRUST','OTHER'
                                )),
    deduction_frequency     VARCHAR(20) DEFAULT 'MONTHLY'
                                CHECK (deduction_frequency IN ('MONTHLY','HALF_YEARLY','ANNUAL')),
    portal_username         VARCHAR(200),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_pt_reg_org_id ON payroll.professional_tax_registration (organization_id);
CREATE INDEX idx_pt_reg_user_id ON payroll.professional_tax_registration (user_id);
CREATE INDEX idx_pt_reg_state ON payroll.professional_tax_registration (state_code);
CREATE INDEX idx_pt_reg_status ON payroll.professional_tax_registration (status);

ALTER TABLE payroll.professional_tax_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_reg_org_isolation ON payroll.professional_tax_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_pt_reg_updated_at
    BEFORE UPDATE ON payroll.professional_tax_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- payroll.professional_tax_return
-- Monthly/half-yearly/annual PT return filing
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.professional_tax_return (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    pt_registration_id      UUID NOT NULL REFERENCES payroll.professional_tax_registration (id),
    state_code              VARCHAR(5) NOT NULL,
    period_type             VARCHAR(20) NOT NULL
                                CHECK (period_type IN ('MONTHLY','HALF_YEARLY','ANNUAL')),
    period_month            SMALLINT CHECK (period_month BETWEEN 1 AND 12),
    period_year             SMALLINT NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    amount                  NUMERIC(18,2) NOT NULL DEFAULT 0,
    challan_number          VARCHAR(100),
    filing_date             TIMESTAMPTZ,
    due_date                TIMESTAMPTZ NOT NULL,
    payment_date            TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','FILED','PAID','OVERDUE','REVISED','CANCELLED'
                                )),
    late_fee                NUMERIC(18,2) DEFAULT 0,
    interest                NUMERIC(18,2) DEFAULT 0,
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_pt_return_org_id ON payroll.professional_tax_return (organization_id);
CREATE INDEX idx_pt_return_user_id ON payroll.professional_tax_return (user_id);
CREATE INDEX idx_pt_return_reg_id ON payroll.professional_tax_return (pt_registration_id);
CREATE INDEX idx_pt_return_state ON payroll.professional_tax_return (state_code);
CREATE INDEX idx_pt_return_period ON payroll.professional_tax_return (period_year, period_month);
CREATE INDEX idx_pt_return_status ON payroll.professional_tax_return (status);
CREATE INDEX idx_pt_return_due_date ON payroll.professional_tax_return (due_date);

ALTER TABLE payroll.professional_tax_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_return_org_isolation ON payroll.professional_tax_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_pt_return_updated_at
    BEFORE UPDATE ON payroll.professional_tax_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 2. GST REFUND (gst schema — extend)
-- #############################################################################

-- =============================================================================
-- gst.gst_refund
-- GST refund application tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.gst_refund (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    gstin                   VARCHAR(15) NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    refund_type             VARCHAR(40) NOT NULL
                                CHECK (refund_type IN (
                                    'IGST_EXPORT','ITC_ACCUMULATION','EXCESS_CASH',
                                    'INVERTED_DUTY','DEEMED_EXPORT','PROVISIONAL',
                                    'ASSESSMENT_EXCESS','OTHER'
                                )),
    arn_number              VARCHAR(100),
    refund_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
    sanctioned_amount       NUMERIC(18,2),
    rejected_amount         NUMERIC(18,2),
    application_date        TIMESTAMPTZ,
    deficiency_memo_date    TIMESTAMPTZ,
    provisional_refund_date TIMESTAMPTZ,
    final_order_date        TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN (
                                    'DRAFT','APPLIED','DEFICIENCY','PROVISIONAL',
                                    'FINAL','REJECTED','WITHDRAWN','CREDITED'
                                )),
    portal_status           VARCHAR(100),
    tax_period_from         TIMESTAMPTZ,
    tax_period_to           TIMESTAMPTZ,
    bank_account_number     VARCHAR(30),
    ifsc_code               VARCHAR(11),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_gst_refund_org_id ON gst.gst_refund (organization_id);
CREATE INDEX idx_gst_refund_user_id ON gst.gst_refund (user_id);
CREATE INDEX idx_gst_refund_gstin ON gst.gst_refund (gstin);
CREATE INDEX idx_gst_refund_type ON gst.gst_refund (refund_type);
CREATE INDEX idx_gst_refund_status ON gst.gst_refund (status);
CREATE INDEX idx_gst_refund_arn ON gst.gst_refund (arn_number) WHERE arn_number IS NOT NULL;

ALTER TABLE gst.gst_refund ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_refund_org_isolation ON gst.gst_refund FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gst_refund_updated_at
    BEFORE UPDATE ON gst.gst_refund
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_refund_document
-- Supporting documents for GST refund applications
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.gst_refund_document (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gst_refund_id           UUID NOT NULL REFERENCES gst.gst_refund (id),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    document_name           VARCHAR(300) NOT NULL,
    document_type           VARCHAR(60) NOT NULL,                          -- e.g. 'SHIPPING_BILL','BRC','CA_CERTIFICATE','STATEMENT_2'
    storage_path            TEXT NOT NULL,
    file_size_bytes         BIGINT,
    mime_type               VARCHAR(100),
    status                  VARCHAR(20) NOT NULL DEFAULT 'UPLOADED'
                                CHECK (status IN ('UPLOADED','VERIFIED','REJECTED','ARCHIVED')),
    verified_by             UUID REFERENCES auth."user" (id),
    verified_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_gst_refund_doc_refund_id ON gst.gst_refund_document (gst_refund_id);
CREATE INDEX idx_gst_refund_doc_org_id ON gst.gst_refund_document (organization_id);

ALTER TABLE gst.gst_refund_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_refund_doc_org_isolation ON gst.gst_refund_document FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gst_refund_doc_updated_at
    BEFORE UPDATE ON gst.gst_refund_document
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 3. GST ANNUAL RETURN (gst schema — extend)
-- #############################################################################

-- =============================================================================
-- gst.gst_annual_return
-- GSTR-9 annual return
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.gst_annual_return (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES auth.organization (id),
    user_id                     UUID NOT NULL REFERENCES auth."user" (id),
    financial_year              VARCHAR(10) NOT NULL,                      -- e.g. '2024-25'
    gstin                       VARCHAR(15) NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    turnover_as_per_books       NUMERIC(18,2),
    turnover_as_per_returns     NUMERIC(18,2),
    itc_as_per_books            NUMERIC(18,2),
    itc_as_per_returns          NUMERIC(18,2),
    tax_payable                 NUMERIC(18,2),
    tax_paid                    NUMERIC(18,2),
    additional_tax_liability    NUMERIC(18,2),
    refund_claimed              NUMERIC(18,2),
    late_fee                    NUMERIC(18,2),
    status                      VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN (
                                        'DRAFT','IN_PROGRESS','REVIEW','FILED',
                                        'REVISED','CANCELLED'
                                    )),
    filing_date                 TIMESTAMPTZ,
    due_date                    TIMESTAMPTZ NOT NULL,
    arn_number                  VARCHAR(100),
    remarks                     TEXT,
    assigned_to                 UUID REFERENCES auth."user" (id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID,
    UNIQUE (organization_id, financial_year, gstin)
);

CREATE INDEX idx_gst_annual_org_id ON gst.gst_annual_return (organization_id);
CREATE INDEX idx_gst_annual_user_id ON gst.gst_annual_return (user_id);
CREATE INDEX idx_gst_annual_fy ON gst.gst_annual_return (financial_year);
CREATE INDEX idx_gst_annual_gstin ON gst.gst_annual_return (gstin);
CREATE INDEX idx_gst_annual_status ON gst.gst_annual_return (status);

ALTER TABLE gst.gst_annual_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_annual_org_isolation ON gst.gst_annual_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gst_annual_updated_at
    BEFORE UPDATE ON gst.gst_annual_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_reconciliation_statement
-- GSTR-9C reconciliation statement (audit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.gst_reconciliation_statement (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES auth.organization (id),
    user_id                     UUID NOT NULL REFERENCES auth."user" (id),
    gst_annual_return_id        UUID REFERENCES gst.gst_annual_return (id),
    financial_year              VARCHAR(10) NOT NULL,
    gstin                       VARCHAR(15) NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    audited_turnover            NUMERIC(18,2),
    turnover_as_per_gstr9       NUMERIC(18,2),
    difference                  NUMERIC(18,2),
    reasons_for_difference      JSONB,
    itc_as_per_audited          NUMERIC(18,2),
    itc_as_per_gstr9            NUMERIC(18,2),
    itc_difference              NUMERIC(18,2),
    additional_tax_payable      NUMERIC(18,2),
    ca_name                     VARCHAR(300),
    ca_membership_number        VARCHAR(50),
    udin                        VARCHAR(50),
    status                      VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN (
                                        'DRAFT','IN_PROGRESS','REVIEW','FILED','CANCELLED'
                                    )),
    filing_date                 TIMESTAMPTZ,
    remarks                     TEXT,
    assigned_to                 UUID REFERENCES auth."user" (id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID,
    UNIQUE (organization_id, financial_year, gstin)
);

CREATE INDEX idx_gst_recon_stmt_org_id ON gst.gst_reconciliation_statement (organization_id);
CREATE INDEX idx_gst_recon_stmt_user_id ON gst.gst_reconciliation_statement (user_id);
CREATE INDEX idx_gst_recon_stmt_annual_id ON gst.gst_reconciliation_statement (gst_annual_return_id) WHERE gst_annual_return_id IS NOT NULL;
CREATE INDEX idx_gst_recon_stmt_fy ON gst.gst_reconciliation_statement (financial_year);
CREATE INDEX idx_gst_recon_stmt_status ON gst.gst_reconciliation_statement (status);

ALTER TABLE gst.gst_reconciliation_statement ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_recon_stmt_org_isolation ON gst.gst_reconciliation_statement FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gst_recon_updated_at
    BEFORE UPDATE ON gst.gst_reconciliation_statement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 4. ADVANCE TAX (itr schema — extend)
-- #############################################################################

-- =============================================================================
-- itr.advance_tax
-- Quarterly advance tax computation and payment tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.advance_tax (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    assessment_year         VARCHAR(10) NOT NULL,                          -- e.g. '2025-26'
    quarter                 VARCHAR(10) NOT NULL
                                CHECK (quarter IN ('Q1_JUN','Q2_SEP','Q3_DEC','Q4_MAR')),
    estimated_income        NUMERIC(18,2),
    estimated_tax           NUMERIC(18,2),
    tax_already_paid        NUMERIC(18,2) DEFAULT 0,
    tax_due                 NUMERIC(18,2),
    challan_number          VARCHAR(100),
    payment_date            TIMESTAMPTZ,
    bsr_code                VARCHAR(20),
    due_date                TIMESTAMPTZ NOT NULL,
    interest_234b           NUMERIC(18,2) DEFAULT 0,
    interest_234c           NUMERIC(18,2) DEFAULT 0,
    pan_number              VARCHAR(10) CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','COMPUTED','PAID','OVERDUE','REVISED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (organization_id, user_id, assessment_year, quarter)
);

CREATE INDEX idx_adv_tax_org_id ON itr.advance_tax (organization_id);
CREATE INDEX idx_adv_tax_user_id ON itr.advance_tax (user_id);
CREATE INDEX idx_adv_tax_ay ON itr.advance_tax (assessment_year);
CREATE INDEX idx_adv_tax_status ON itr.advance_tax (status);
CREATE INDEX idx_adv_tax_due_date ON itr.advance_tax (due_date);

ALTER TABLE itr.advance_tax ENABLE ROW LEVEL SECURITY;
CREATE POLICY adv_tax_org_isolation ON itr.advance_tax FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_adv_tax_updated_at
    BEFORE UPDATE ON itr.advance_tax
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 5. LUT FILING (gst schema — extend)
-- #############################################################################

-- =============================================================================
-- gst.lut_filing
-- Letter of Undertaking for exporters (annual filing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.lut_filing (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    financial_year          VARCHAR(10) NOT NULL,
    gstin                   VARCHAR(15) NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    lut_reference_number    VARCHAR(100),
    filing_date             TIMESTAMPTZ,
    valid_from              TIMESTAMPTZ,
    valid_to                TIMESTAMPTZ,
    arn_number              VARCHAR(100),
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN (
                                    'DRAFT','FILED','ACTIVE','EXPIRED','REVOKED','CANCELLED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (organization_id, financial_year, gstin)
);

CREATE INDEX idx_lut_org_id ON gst.lut_filing (organization_id);
CREATE INDEX idx_lut_user_id ON gst.lut_filing (user_id);
CREATE INDEX idx_lut_fy ON gst.lut_filing (financial_year);
CREATE INDEX idx_lut_gstin ON gst.lut_filing (gstin);
CREATE INDEX idx_lut_status ON gst.lut_filing (status);

ALTER TABLE gst.lut_filing ENABLE ROW LEVEL SECURITY;
CREATE POLICY lut_org_isolation ON gst.lut_filing FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_lut_updated_at
    BEFORE UPDATE ON gst.lut_filing
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 6. VALUATION SERVICES (valuation schema — NEW)
-- #############################################################################

-- =============================================================================
-- valuation.valuation_engagement
-- Business/share valuation engagements
-- =============================================================================
CREATE TABLE IF NOT EXISTS valuation.valuation_engagement (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    valuation_type          VARCHAR(50) NOT NULL
                                CHECK (valuation_type IN (
                                    'SHARE_VALUATION_11UA','BUSINESS_VALUATION',
                                    'MERGER_VALUATION','SLUMP_SALE','FAIR_VALUE',
                                    'BRAND_VALUATION','INTANGIBLE_ASSET','OTHER'
                                )),
    entity_name             VARCHAR(500) NOT NULL,
    purpose                 TEXT,
    valuation_method        VARCHAR(40) NOT NULL
                                CHECK (valuation_method IN (
                                    'DCF','NAV','MARKET_COMPARABLE',
                                    'INCOME_APPROACH','ASSET_APPROACH','COMBINATION'
                                )),
    valuation_date          TIMESTAMPTZ NOT NULL,
    report_date             TIMESTAMPTZ,
    valuation_amount        NUMERIC(18,2),
    ca_name                 VARCHAR(300),
    ca_membership_number    VARCHAR(50),
    udin                    VARCHAR(50),
    status                  VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                                CHECK (status IN (
                                    'INITIATED','DATA_COLLECTION','IN_PROGRESS',
                                    'REVIEW','COMPLETED','CANCELLED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_val_eng_org_id ON valuation.valuation_engagement (organization_id);
CREATE INDEX idx_val_eng_user_id ON valuation.valuation_engagement (user_id);
CREATE INDEX idx_val_eng_type ON valuation.valuation_engagement (valuation_type);
CREATE INDEX idx_val_eng_status ON valuation.valuation_engagement (status);
CREATE INDEX idx_val_eng_date ON valuation.valuation_engagement (valuation_date);

ALTER TABLE valuation.valuation_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY val_eng_org_isolation ON valuation.valuation_engagement FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_val_eng_updated_at
    BEFORE UPDATE ON valuation.valuation_engagement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- valuation.share_valuation
-- Rule 11UA share valuation details
-- =============================================================================
CREATE TABLE IF NOT EXISTS valuation.share_valuation (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id           UUID NOT NULL REFERENCES valuation.valuation_engagement (id),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    share_class             VARCHAR(50) NOT NULL,                          -- e.g. 'EQUITY','PREFERENCE','COMPULSORILY_CONVERTIBLE'
    face_value              NUMERIC(18,2) NOT NULL,
    book_value_per_share    NUMERIC(18,4),
    fair_value_per_share    NUMERIC(18,4),
    premium_per_share       NUMERIC(18,4),
    total_shares            BIGINT,
    total_valuation         NUMERIC(18,2),
    methodology_details     JSONB,                                        -- detailed calc inputs
    ca_certificate_number   VARCHAR(100),
    section_reference       VARCHAR(50),                                   -- e.g. 'Rule 11UA(2)(a)'
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_share_val_eng_id ON valuation.share_valuation (engagement_id);
CREATE INDEX idx_share_val_org_id ON valuation.share_valuation (organization_id);

ALTER TABLE valuation.share_valuation ENABLE ROW LEVEL SECURITY;
CREATE POLICY share_val_org_isolation ON valuation.share_valuation FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_share_val_updated_at
    BEFORE UPDATE ON valuation.share_valuation
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 7. SECTION 206AB COMPLIANCE (itr schema — extend)
-- #############################################################################

-- =============================================================================
-- itr.specified_person_check
-- Section 206AB/206CCA compliance verification
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.specified_person_check (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    pan_number              VARCHAR(10) NOT NULL CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    check_date              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_specified_person     BOOLEAN NOT NULL DEFAULT false,
    non_filer_years         JSONB,                                        -- e.g. ['2022-23','2023-24']
    applicable_tds_rate     NUMERIC(5,2),
    section_applicable      VARCHAR(20) DEFAULT '206AB'
                                CHECK (section_applicable IN ('206AB','206CCA','BOTH')),
    portal_response         JSONB,
    checked_by              UUID REFERENCES auth."user" (id),
    financial_year          VARCHAR(10),
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_spec_person_org_id ON itr.specified_person_check (organization_id);
CREATE INDEX idx_spec_person_user_id ON itr.specified_person_check (user_id);
CREATE INDEX idx_spec_person_pan ON itr.specified_person_check (pan_number);
CREATE INDEX idx_spec_person_date ON itr.specified_person_check (check_date);
CREATE INDEX idx_spec_person_is_specified ON itr.specified_person_check (is_specified_person) WHERE is_specified_person = true;

ALTER TABLE itr.specified_person_check ENABLE ROW LEVEL SECURITY;
CREATE POLICY spec_person_org_isolation ON itr.specified_person_check FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_spec_person_updated_at
    BEFORE UPDATE ON itr.specified_person_check
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 8. LOWER TDS CERTIFICATE (itr schema — extend)
-- #############################################################################

-- =============================================================================
-- itr.lower_tds_certificate
-- Section 197 / 195(2) lower TDS certificate tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.lower_tds_certificate (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES auth.organization (id),
    user_id                     UUID NOT NULL REFERENCES auth."user" (id),
    pan_number                  VARCHAR(10) NOT NULL CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    assessment_year             VARCHAR(10) NOT NULL,
    certificate_number          VARCHAR(100),
    section                     VARCHAR(20) NOT NULL
                                    CHECK (section IN ('197','195_2')),
    applicable_rate             NUMERIC(5,2),
    normal_rate                 NUMERIC(5,2),
    valid_from                  TIMESTAMPTZ,
    valid_to                    TIMESTAMPTZ,
    max_amount                  NUMERIC(18,2),
    utilized_amount             NUMERIC(18,2) DEFAULT 0,
    status                      VARCHAR(30) NOT NULL DEFAULT 'APPLIED'
                                    CHECK (status IN (
                                        'APPLIED','APPROVED','REJECTED','EXPIRED','REVOKED'
                                    )),
    traces_application_number   VARCHAR(100),
    deductor_tan               VARCHAR(10),
    remarks                     TEXT,
    assigned_to                 UUID REFERENCES auth."user" (id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX idx_lower_tds_org_id ON itr.lower_tds_certificate (organization_id);
CREATE INDEX idx_lower_tds_user_id ON itr.lower_tds_certificate (user_id);
CREATE INDEX idx_lower_tds_pan ON itr.lower_tds_certificate (pan_number);
CREATE INDEX idx_lower_tds_ay ON itr.lower_tds_certificate (assessment_year);
CREATE INDEX idx_lower_tds_status ON itr.lower_tds_certificate (status);
CREATE INDEX idx_lower_tds_valid ON itr.lower_tds_certificate (valid_from, valid_to);

ALTER TABLE itr.lower_tds_certificate ENABLE ROW LEVEL SECURITY;
CREATE POLICY lower_tds_org_isolation ON itr.lower_tds_certificate FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_lower_tds_updated_at
    BEFORE UPDATE ON itr.lower_tds_certificate
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 9. VIRTUAL CFO / MIS (vcfo schema — NEW)
-- #############################################################################

-- =============================================================================
-- vcfo.vcfo_engagement
-- Virtual CFO service engagement
-- =============================================================================
CREATE TABLE IF NOT EXISTS vcfo.vcfo_engagement (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    engagement_type         VARCHAR(40) NOT NULL
                                CHECK (engagement_type IN (
                                    'MONTHLY_MIS','QUARTERLY_REVIEW','ANNUAL_PLANNING',
                                    'INVESTOR_REPORTING','FUNDRAISE_SUPPORT','FULL_CFO','OTHER'
                                )),
    frequency               VARCHAR(20) NOT NULL
                                CHECK (frequency IN ('MONTHLY','QUARTERLY','ANNUAL','AD_HOC')),
    start_date              TIMESTAMPTZ NOT NULL,
    end_date                TIMESTAMPTZ,
    retainer_amount         NUMERIC(18,2),
    status                  VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
                                CHECK (status IN (
                                    'PROPOSED','ACTIVE','PAUSED','COMPLETED','CANCELLED'
                                )),
    scope_of_work           TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_vcfo_eng_org_id ON vcfo.vcfo_engagement (organization_id);
CREATE INDEX idx_vcfo_eng_user_id ON vcfo.vcfo_engagement (user_id);
CREATE INDEX idx_vcfo_eng_type ON vcfo.vcfo_engagement (engagement_type);
CREATE INDEX idx_vcfo_eng_status ON vcfo.vcfo_engagement (status);

ALTER TABLE vcfo.vcfo_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY vcfo_eng_org_isolation ON vcfo.vcfo_engagement FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_vcfo_eng_updated_at
    BEFORE UPDATE ON vcfo.vcfo_engagement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- vcfo.mis_report
-- MIS report generation and delivery
-- =============================================================================
CREATE TABLE IF NOT EXISTS vcfo.mis_report (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    vcfo_engagement_id      UUID REFERENCES vcfo.vcfo_engagement (id),
    report_type             VARCHAR(40) NOT NULL
                                CHECK (report_type IN (
                                    'CASH_FLOW_FORECAST','BUDGET_VS_ACTUAL','RATIO_ANALYSIS',
                                    'WORKING_CAPITAL','FUND_FLOW','BREAK_EVEN',
                                    'AGEING_ANALYSIS','PROFITABILITY','VARIANCE','CUSTOM'
                                )),
    period_from             TIMESTAMPTZ NOT NULL,
    period_to               TIMESTAMPTZ NOT NULL,
    generated_at            TIMESTAMPTZ,
    report_data             JSONB,
    report_file_url         TEXT,
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN (
                                    'DRAFT','GENERATING','REVIEW','DELIVERED','ARCHIVED'
                                )),
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_mis_report_org_id ON vcfo.mis_report (organization_id);
CREATE INDEX idx_mis_report_user_id ON vcfo.mis_report (user_id);
CREATE INDEX idx_mis_report_eng_id ON vcfo.mis_report (vcfo_engagement_id) WHERE vcfo_engagement_id IS NOT NULL;
CREATE INDEX idx_mis_report_type ON vcfo.mis_report (report_type);
CREATE INDEX idx_mis_report_period ON vcfo.mis_report (period_from, period_to);

ALTER TABLE vcfo.mis_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY mis_report_org_isolation ON vcfo.mis_report FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_mis_report_updated_at
    BEFORE UPDATE ON vcfo.mis_report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- vcfo.budget
-- Budgeting and budget tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS vcfo.budget (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    vcfo_engagement_id      UUID REFERENCES vcfo.vcfo_engagement (id),
    financial_year          VARCHAR(10) NOT NULL,
    budget_type             VARCHAR(30) NOT NULL
                                CHECK (budget_type IN (
                                    'ANNUAL','QUARTERLY','DEPARTMENTAL','PROJECT','CASH_FLOW'
                                )),
    total_income            NUMERIC(18,2),
    total_expense           NUMERIC(18,2),
    net_budget              NUMERIC(18,2),
    line_items              JSONB,                                        -- detailed budget lines
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN (
                                    'DRAFT','APPROVED','REVISED','CLOSED'
                                )),
    approved_by             UUID REFERENCES auth."user" (id),
    approved_at             TIMESTAMPTZ,
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_budget_org_id ON vcfo.budget (organization_id);
CREATE INDEX idx_budget_user_id ON vcfo.budget (user_id);
CREATE INDEX idx_budget_eng_id ON vcfo.budget (vcfo_engagement_id) WHERE vcfo_engagement_id IS NOT NULL;
CREATE INDEX idx_budget_fy ON vcfo.budget (financial_year);
CREATE INDEX idx_budget_status ON vcfo.budget (status);

ALTER TABLE vcfo.budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_org_isolation ON vcfo.budget FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_budget_updated_at
    BEFORE UPDATE ON vcfo.budget
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- vcfo.kpi_metric
-- Business KPI tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS vcfo.kpi_metric (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    vcfo_engagement_id      UUID REFERENCES vcfo.vcfo_engagement (id),
    metric_name             VARCHAR(200) NOT NULL,
    metric_value            NUMERIC(18,4),
    metric_unit             VARCHAR(30),                                  -- e.g. 'INR','%','DAYS','RATIO'
    metric_date             TIMESTAMPTZ NOT NULL,
    metric_category         VARCHAR(30) NOT NULL
                                CHECK (metric_category IN (
                                    'REVENUE','PROFITABILITY','LIQUIDITY',
                                    'EFFICIENCY','GROWTH','SOLVENCY','OTHER'
                                )),
    target_value            NUMERIC(18,4),
    variance_pct            NUMERIC(8,2),
    trend                   VARCHAR(10) CHECK (trend IN ('UP','DOWN','STABLE')),
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_kpi_org_id ON vcfo.kpi_metric (organization_id);
CREATE INDEX idx_kpi_user_id ON vcfo.kpi_metric (user_id);
CREATE INDEX idx_kpi_eng_id ON vcfo.kpi_metric (vcfo_engagement_id) WHERE vcfo_engagement_id IS NOT NULL;
CREATE INDEX idx_kpi_name ON vcfo.kpi_metric (metric_name);
CREATE INDEX idx_kpi_date ON vcfo.kpi_metric (metric_date);
CREATE INDEX idx_kpi_category ON vcfo.kpi_metric (metric_category);

ALTER TABLE vcfo.kpi_metric ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_org_isolation ON vcfo.kpi_metric FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_kpi_updated_at
    BEFORE UPDATE ON vcfo.kpi_metric
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 10. UNIFIED COMPLIANCE CALENDAR (compliance schema — extend)
-- #############################################################################

-- =============================================================================
-- compliance.compliance_master
-- Master list of all compliance items
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.compliance_master (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compliance_type         VARCHAR(30) NOT NULL
                                CHECK (compliance_type IN (
                                    'GST','ITR','ROC','PT','PF','ESI','TDS',
                                    'ADVANCE_TAX','LUT','DIR3KYC','DPT3','AOC4',
                                    'MGT7','GSTR9','AUDIT','FEMA','CSR','XBRL',
                                    'SHOP_EST','OTHER'
                                )),
    title                   VARCHAR(500) NOT NULL,
    description             TEXT,
    applicable_to           VARCHAR(30) NOT NULL DEFAULT 'ALL'
                                CHECK (applicable_to IN (
                                    'COMPANY','LLP','FIRM','INDIVIDUAL','TRUST',
                                    'SOCIETY','HUF','ALL'
                                )),
    frequency               VARCHAR(20) NOT NULL
                                CHECK (frequency IN (
                                    'MONTHLY','QUARTERLY','HALF_YEARLY',
                                    'ANNUALLY','ONE_TIME','EVENT_BASED'
                                )),
    default_due_day         SMALLINT CHECK (default_due_day BETWEEN 1 AND 31),
    default_due_month       SMALLINT CHECK (default_due_month BETWEEN 1 AND 12),
    penalty_for_delay       TEXT,
    authority               VARCHAR(30) NOT NULL
                                CHECK (authority IN (
                                    'MCA','INCOME_TAX','GST','EPF','ESIC',
                                    'STATE_GOVT','RBI','SEBI','OTHER'
                                )),
    portal_url              TEXT,
    section_reference       VARCHAR(100),                                 -- legal section reference
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_comp_master_type ON compliance.compliance_master (compliance_type);
CREATE INDEX idx_comp_master_applicable ON compliance.compliance_master (applicable_to);
CREATE INDEX idx_comp_master_frequency ON compliance.compliance_master (frequency);
CREATE INDEX idx_comp_master_authority ON compliance.compliance_master (authority);
CREATE INDEX idx_comp_master_active ON compliance.compliance_master (is_active) WHERE is_active = true;

-- compliance_master is reference data, no RLS needed (read by all)

CREATE TRIGGER trg_comp_master_updated_at
    BEFORE UPDATE ON compliance.compliance_master
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- compliance.compliance_tracker
-- Per-organization compliance tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.compliance_tracker (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    compliance_master_id    UUID NOT NULL REFERENCES compliance.compliance_master (id),
    financial_year          VARCHAR(10) NOT NULL,
    period                  VARCHAR(30),                                   -- e.g. 'JAN','Q1','H1','ANNUAL'
    due_date                TIMESTAMPTZ NOT NULL,
    completion_date         TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'UPCOMING'
                                CHECK (status IN (
                                    'UPCOMING','IN_PROGRESS','COMPLETED',
                                    'OVERDUE','NOT_APPLICABLE','WAIVED'
                                )),
    assigned_to             UUID REFERENCES auth."user" (id),
    reminder_sent           BOOLEAN DEFAULT false,
    last_reminder_at        TIMESTAMPTZ,
    filing_reference        VARCHAR(200),                                 -- ARN, SRN, challan no
    notes                   TEXT,
    priority                VARCHAR(10) DEFAULT 'NORMAL'
                                CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_comp_tracker_org_id ON compliance.compliance_tracker (organization_id);
CREATE INDEX idx_comp_tracker_user_id ON compliance.compliance_tracker (user_id);
CREATE INDEX idx_comp_tracker_master_id ON compliance.compliance_tracker (compliance_master_id);
CREATE INDEX idx_comp_tracker_fy ON compliance.compliance_tracker (financial_year);
CREATE INDEX idx_comp_tracker_due_date ON compliance.compliance_tracker (due_date);
CREATE INDEX idx_comp_tracker_status ON compliance.compliance_tracker (status);
CREATE INDEX idx_comp_tracker_overdue ON compliance.compliance_tracker (status, due_date) WHERE status = 'OVERDUE';
CREATE INDEX idx_comp_tracker_assigned ON compliance.compliance_tracker (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE compliance.compliance_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY comp_tracker_org_isolation ON compliance.compliance_tracker FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_comp_tracker_updated_at
    BEFORE UPDATE ON compliance.compliance_tracker
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE payroll.professional_tax_registration IS 'State-level Professional Tax employer registration';
COMMENT ON TABLE payroll.professional_tax_return IS 'Monthly/half-yearly/annual PT return filing and payment';
COMMENT ON TABLE gst.gst_refund IS 'GST refund application tracking (IGST export, ITC accumulation, etc.)';
COMMENT ON TABLE gst.gst_refund_document IS 'Supporting documents for GST refund applications';
COMMENT ON TABLE gst.gst_annual_return IS 'GSTR-9 annual return';
COMMENT ON TABLE gst.gst_reconciliation_statement IS 'GSTR-9C reconciliation statement (turnover and ITC reconciliation)';
COMMENT ON TABLE itr.advance_tax IS 'Quarterly advance tax computation and payment (Sec 234B/234C)';
COMMENT ON TABLE gst.lut_filing IS 'Letter of Undertaking for exporters (annual filing under GST)';
COMMENT ON TABLE valuation.valuation_engagement IS 'Business/share/brand valuation engagements';
COMMENT ON TABLE valuation.share_valuation IS 'Rule 11UA share valuation details and fair value computation';
COMMENT ON TABLE itr.specified_person_check IS 'Section 206AB/206CCA specified person (non-filer) compliance check';
COMMENT ON TABLE itr.lower_tds_certificate IS 'Section 197/195(2) lower/nil TDS deduction certificate tracking';
COMMENT ON TABLE vcfo.vcfo_engagement IS 'Virtual CFO service engagement and retainer';
COMMENT ON TABLE vcfo.mis_report IS 'MIS report generation (cash flow, ratio analysis, ageing, etc.)';
COMMENT ON TABLE vcfo.budget IS 'Annual/quarterly/departmental budget planning';
COMMENT ON TABLE vcfo.kpi_metric IS 'Business KPI tracking (revenue, profitability, liquidity, efficiency)';
COMMENT ON TABLE compliance.compliance_master IS 'Master list of all compliance items (reference data)';
COMMENT ON TABLE compliance.compliance_tracker IS 'Per-organization compliance deadline tracking and reminders';

COMMIT;
