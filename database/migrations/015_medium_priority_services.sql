-- =============================================================================
-- 015_medium_priority_services.sql
-- Medium Priority Services — FEMA/RBI Compliance, Transfer Pricing, DIR-3 KYC,
-- DPT-3 Return, XBRL Filing, CSR Compliance, Shop & Establishment,
-- Due Diligence, Internal Audit, Equalisation Levy
-- Depends on: 000_init.sql, 001_auth_schema.sql, 003_accounting_schema.sql,
--             006_itr_schema.sql, 013_additional_services_schema.sql,
--             014_high_priority_services.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- NEW SCHEMAS
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS fema;


-- #############################################################################
-- 11. FEMA / RBI COMPLIANCE (fema schema — NEW)
-- #############################################################################

-- =============================================================================
-- fema.fema_registration
-- FDI/ODI/ECB registration with RBI
-- =============================================================================
CREATE TABLE IF NOT EXISTS fema.fema_registration (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    registration_type       VARCHAR(30) NOT NULL
                                CHECK (registration_type IN (
                                    'FC_GPR','FC_TRS','ODI','ECB','SOFTEX','LRS','FLAIR','OTHER'
                                )),
    entity_name             VARCHAR(500) NOT NULL,
    rbi_registration_number VARCHAR(100),
    urn_number              VARCHAR(100),                                 -- Unique Registration Number
    ad_bank_name            VARCHAR(300),
    ad_code                 VARCHAR(20),
    registration_date       TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                                CHECK (status IN (
                                    'INITIATED','FILED','APPROVED','REJECTED',
                                    'ACTIVE','EXPIRED','CANCELLED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_fema_reg_org_id ON fema.fema_registration (organization_id);
CREATE INDEX idx_fema_reg_user_id ON fema.fema_registration (user_id);
CREATE INDEX idx_fema_reg_type ON fema.fema_registration (registration_type);
CREATE INDEX idx_fema_reg_status ON fema.fema_registration (status);
CREATE INDEX idx_fema_reg_rbi_no ON fema.fema_registration (rbi_registration_number) WHERE rbi_registration_number IS NOT NULL;

ALTER TABLE fema.fema_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY fema_reg_org_isolation ON fema.fema_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_fema_reg_updated_at
    BEFORE UPDATE ON fema.fema_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- fema.fla_return
-- Annual FLA (Foreign Liabilities and Assets) return to RBI
-- =============================================================================
CREATE TABLE IF NOT EXISTS fema.fla_return (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES auth.organization (id),
    user_id                     UUID NOT NULL REFERENCES auth."user" (id),
    financial_year              VARCHAR(10) NOT NULL,                      -- e.g. '2024-25'
    total_foreign_liabilities   NUMERIC(18,2),
    total_foreign_assets        NUMERIC(18,2),
    fdi_inflow                  NUMERIC(18,2),
    fdi_outflow                 NUMERIC(18,2),
    filing_date                 TIMESTAMPTZ,
    due_date                    TIMESTAMPTZ NOT NULL,                      -- typically July 15
    rbi_acknowledgement         VARCHAR(100),
    status                      VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN (
                                        'PENDING','IN_PROGRESS','FILED','REVISED',
                                        'OVERDUE','CANCELLED'
                                    )),
    remarks                     TEXT,
    assigned_to                 UUID REFERENCES auth."user" (id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID,
    UNIQUE (organization_id, financial_year)
);

CREATE INDEX idx_fla_return_org_id ON fema.fla_return (organization_id);
CREATE INDEX idx_fla_return_user_id ON fema.fla_return (user_id);
CREATE INDEX idx_fla_return_fy ON fema.fla_return (financial_year);
CREATE INDEX idx_fla_return_status ON fema.fla_return (status);
CREATE INDEX idx_fla_return_due_date ON fema.fla_return (due_date);

ALTER TABLE fema.fla_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY fla_return_org_isolation ON fema.fla_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_fla_return_updated_at
    BEFORE UPDATE ON fema.fla_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- fema.fema_transaction
-- Individual FEMA transactions (inward/outward remittances)
-- =============================================================================
CREATE TABLE IF NOT EXISTS fema.fema_transaction (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    fema_registration_id    UUID REFERENCES fema.fema_registration (id),
    transaction_type        VARCHAR(30) NOT NULL
                                CHECK (transaction_type IN (
                                    'INWARD_REMITTANCE','OUTWARD_REMITTANCE',
                                    'SHARE_ALLOTMENT','SHARE_TRANSFER',
                                    'ECB_DRAWDOWN','ECB_REPAYMENT','LRS','OTHER'
                                )),
    amount                  NUMERIC(18,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'USD',
    inr_equivalent          NUMERIC(18,2),
    exchange_rate           NUMERIC(12,6),
    counterparty_name       VARCHAR(500),
    counterparty_country    VARCHAR(3),                                    -- ISO 3166-1 alpha-3
    purpose_code            VARCHAR(20),                                   -- RBI purpose code
    ad_bank_name            VARCHAR(300),
    ad_code                 VARCHAR(20),
    reporting_date          TIMESTAMPTZ,
    transaction_date        TIMESTAMPTZ NOT NULL,
    firc_number             VARCHAR(100),                                  -- Foreign Inward Remittance Certificate
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','REPORTED','ACKNOWLEDGED','QUERY','CLOSED'
                                )),
    remarks                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_fema_txn_org_id ON fema.fema_transaction (organization_id);
CREATE INDEX idx_fema_txn_user_id ON fema.fema_transaction (user_id);
CREATE INDEX idx_fema_txn_reg_id ON fema.fema_transaction (fema_registration_id) WHERE fema_registration_id IS NOT NULL;
CREATE INDEX idx_fema_txn_type ON fema.fema_transaction (transaction_type);
CREATE INDEX idx_fema_txn_date ON fema.fema_transaction (transaction_date);
CREATE INDEX idx_fema_txn_status ON fema.fema_transaction (status);
CREATE INDEX idx_fema_txn_currency ON fema.fema_transaction (currency);

ALTER TABLE fema.fema_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY fema_txn_org_isolation ON fema.fema_transaction FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_fema_txn_updated_at
    BEFORE UPDATE ON fema.fema_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 12. TRANSFER PRICING (itr schema — extend)
-- #############################################################################

-- =============================================================================
-- itr.transfer_pricing_report
-- Form 3CEB — Transfer Pricing report
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.transfer_pricing_report (
    id                                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id                         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                                 UUID NOT NULL REFERENCES auth."user" (id),
    assessment_year                         VARCHAR(10) NOT NULL,
    entity_name                             VARCHAR(500) NOT NULL,
    pan                                     VARCHAR(10) NOT NULL CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    total_international_transactions        NUMERIC(18,2),
    total_specified_domestic_transactions    NUMERIC(18,2),
    associated_enterprises_count            SMALLINT,
    report_date                             TIMESTAMPTZ,
    ca_name                                 VARCHAR(300),
    ca_membership_number                    VARCHAR(50),
    udin                                    VARCHAR(50),
    filing_date                             TIMESTAMPTZ,
    due_date                                TIMESTAMPTZ NOT NULL,
    form_number                             VARCHAR(10) DEFAULT '3CEB',
    status                                  VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                                                CHECK (status IN (
                                                    'INITIATED','DATA_COLLECTION','IN_PROGRESS',
                                                    'REVIEW','FILED','CANCELLED'
                                                )),
    remarks                                 TEXT,
    assigned_to                             UUID REFERENCES auth."user" (id),
    created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                              TIMESTAMPTZ,
    created_by                              UUID,
    updated_by                              UUID,
    UNIQUE (organization_id, assessment_year)
);

CREATE INDEX idx_tp_report_org_id ON itr.transfer_pricing_report (organization_id);
CREATE INDEX idx_tp_report_user_id ON itr.transfer_pricing_report (user_id);
CREATE INDEX idx_tp_report_ay ON itr.transfer_pricing_report (assessment_year);
CREATE INDEX idx_tp_report_pan ON itr.transfer_pricing_report (pan);
CREATE INDEX idx_tp_report_status ON itr.transfer_pricing_report (status);

ALTER TABLE itr.transfer_pricing_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY tp_report_org_isolation ON itr.transfer_pricing_report FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_tp_report_updated_at
    BEFORE UPDATE ON itr.transfer_pricing_report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 13. DIR-3 KYC (compliance schema — extend)
-- #############################################################################

-- =============================================================================
-- compliance.director_kyc
-- Annual DIR-3 KYC filing for directors
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.director_kyc (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    din_number              VARCHAR(8) NOT NULL,                           -- Director Identification Number
    director_name           VARCHAR(300) NOT NULL,
    financial_year          VARCHAR(10) NOT NULL,
    due_date                TIMESTAMPTZ NOT NULL,                          -- typically Sept 30
    filing_date             TIMESTAMPTZ,
    srn_number              VARCHAR(100),                                  -- MCA SRN
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','IN_PROGRESS','FILED','OVERDUE','CANCELLED'
                                )),
    kyc_type                VARCHAR(20) NOT NULL DEFAULT 'ANNUAL'
                                CHECK (kyc_type IN ('ANNUAL','FIRST_TIME')),
    late_fee                NUMERIC(18,2) DEFAULT 0,
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (organization_id, din_number, financial_year)
);

CREATE INDEX idx_dir_kyc_org_id ON compliance.director_kyc (organization_id);
CREATE INDEX idx_dir_kyc_user_id ON compliance.director_kyc (user_id);
CREATE INDEX idx_dir_kyc_din ON compliance.director_kyc (din_number);
CREATE INDEX idx_dir_kyc_fy ON compliance.director_kyc (financial_year);
CREATE INDEX idx_dir_kyc_status ON compliance.director_kyc (status);
CREATE INDEX idx_dir_kyc_due_date ON compliance.director_kyc (due_date);

ALTER TABLE compliance.director_kyc ENABLE ROW LEVEL SECURITY;
CREATE POLICY dir_kyc_org_isolation ON compliance.director_kyc FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_dir_kyc_updated_at
    BEFORE UPDATE ON compliance.director_kyc
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 14. DPT-3 RETURN (compliance schema — extend)
-- #############################################################################

-- =============================================================================
-- compliance.dpt3_return
-- Return of deposits / exempted deposits (DPT-3)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.dpt3_return (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    financial_year          VARCHAR(10) NOT NULL,
    total_deposits          NUMERIC(18,2),
    total_outstanding       NUMERIC(18,2),
    deposits_accepted       NUMERIC(18,2),
    deposits_repaid         NUMERIC(18,2),
    filing_date             TIMESTAMPTZ,
    due_date                TIMESTAMPTZ NOT NULL,                          -- typically June 30
    srn_number              VARCHAR(100),
    form_type               VARCHAR(10) DEFAULT 'DPT3'
                                CHECK (form_type IN ('DPT3','DPT4')),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','IN_PROGRESS','FILED','OVERDUE','CANCELLED'
                                )),
    late_fee                NUMERIC(18,2) DEFAULT 0,
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (organization_id, financial_year)
);

CREATE INDEX idx_dpt3_org_id ON compliance.dpt3_return (organization_id);
CREATE INDEX idx_dpt3_user_id ON compliance.dpt3_return (user_id);
CREATE INDEX idx_dpt3_fy ON compliance.dpt3_return (financial_year);
CREATE INDEX idx_dpt3_status ON compliance.dpt3_return (status);
CREATE INDEX idx_dpt3_due_date ON compliance.dpt3_return (due_date);

ALTER TABLE compliance.dpt3_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY dpt3_org_isolation ON compliance.dpt3_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_dpt3_updated_at
    BEFORE UPDATE ON compliance.dpt3_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 15. XBRL FILING (compliance schema — extend)
-- #############################################################################

-- =============================================================================
-- compliance.xbrl_filing
-- XBRL financial statement filing with MCA
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.xbrl_filing (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    financial_year          VARCHAR(10) NOT NULL,
    filing_type             VARCHAR(30) NOT NULL
                                CHECK (filing_type IN (
                                    'BALANCE_SHEET','PNL','NOTES','CASH_FLOW',
                                    'CHANGES_IN_EQUITY','COMPLETE'
                                )),
    instance_document_url   TEXT,
    taxonomy_version        VARCHAR(50),                                   -- e.g. 'Ind-AS-2024'
    filing_date             TIMESTAMPTZ,
    due_date                TIMESTAMPTZ,
    srn_number              VARCHAR(100),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','GENERATED','VALIDATED','FILED',
                                    'REJECTED','CANCELLED'
                                )),
    validation_errors       JSONB,                                        -- XBRL validation errors if any
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_xbrl_org_id ON compliance.xbrl_filing (organization_id);
CREATE INDEX idx_xbrl_user_id ON compliance.xbrl_filing (user_id);
CREATE INDEX idx_xbrl_fy ON compliance.xbrl_filing (financial_year);
CREATE INDEX idx_xbrl_type ON compliance.xbrl_filing (filing_type);
CREATE INDEX idx_xbrl_status ON compliance.xbrl_filing (status);

ALTER TABLE compliance.xbrl_filing ENABLE ROW LEVEL SECURITY;
CREATE POLICY xbrl_org_isolation ON compliance.xbrl_filing FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_xbrl_updated_at
    BEFORE UPDATE ON compliance.xbrl_filing
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 16. CSR COMPLIANCE (compliance schema — extend)
-- #############################################################################

-- =============================================================================
-- compliance.csr_report
-- CSR-1/CSR-2 annual filing
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.csr_report (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    financial_year          VARCHAR(10) NOT NULL,
    average_net_profit_3yr  NUMERIC(18,2),                                -- avg net profit of last 3 FYs
    csr_budget              NUMERIC(18,2),                                -- 2% of avg net profit
    csr_spent               NUMERIC(18,2),
    unspent_amount          NUMERIC(18,2),
    excess_carried_forward  NUMERIC(18,2),
    csr_committee_members   JSONB,                                        -- [{name, din, designation}]
    projects                JSONB,                                        -- [{project_name, sector, location, amount, mode}]
    form_type               VARCHAR(10) NOT NULL DEFAULT 'CSR2'
                                CHECK (form_type IN ('CSR1','CSR2')),
    filing_date             TIMESTAMPTZ,
    due_date                TIMESTAMPTZ,
    srn_number              VARCHAR(100),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','IN_PROGRESS','FILED','OVERDUE','CANCELLED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (organization_id, financial_year, form_type)
);

CREATE INDEX idx_csr_org_id ON compliance.csr_report (organization_id);
CREATE INDEX idx_csr_user_id ON compliance.csr_report (user_id);
CREATE INDEX idx_csr_fy ON compliance.csr_report (financial_year);
CREATE INDEX idx_csr_status ON compliance.csr_report (status);

ALTER TABLE compliance.csr_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY csr_org_isolation ON compliance.csr_report FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_csr_updated_at
    BEFORE UPDATE ON compliance.csr_report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 17. SHOP & ESTABLISHMENT (registration schema — extend)
-- #############################################################################

-- =============================================================================
-- registration.shop_establishment
-- Shop & Establishment Act registration (state-level)
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.shop_establishment (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    state_code              VARCHAR(5) NOT NULL,
    registration_number     VARCHAR(100),
    establishment_type      VARCHAR(40) NOT NULL
                                CHECK (establishment_type IN (
                                    'SHOP','COMMERCIAL_ESTABLISHMENT','HOTEL',
                                    'RESTAURANT','THEATRE','OTHER'
                                )),
    employee_count          SMALLINT,
    registration_date       TIMESTAMPTZ,
    renewal_date            TIMESTAMPTZ,
    expiry_date             TIMESTAMPTZ,
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','ACTIVE','EXPIRED','RENEWED',
                                    'SUSPENDED','CANCELLED'
                                )),
    establishment_name      VARCHAR(500),
    establishment_address   TEXT,
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_shop_est_org_id ON registration.shop_establishment (organization_id);
CREATE INDEX idx_shop_est_user_id ON registration.shop_establishment (user_id);
CREATE INDEX idx_shop_est_state ON registration.shop_establishment (state_code);
CREATE INDEX idx_shop_est_status ON registration.shop_establishment (status);
CREATE INDEX idx_shop_est_expiry ON registration.shop_establishment (expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE registration.shop_establishment ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_est_org_isolation ON registration.shop_establishment FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_shop_est_updated_at
    BEFORE UPDATE ON registration.shop_establishment
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 18. DUE DILIGENCE (advisory schema — extend)
-- #############################################################################

-- =============================================================================
-- advisory.due_diligence
-- Financial/tax/legal due diligence engagements
-- =============================================================================
CREATE TABLE IF NOT EXISTS advisory.due_diligence (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    dd_type                 VARCHAR(30) NOT NULL
                                CHECK (dd_type IN (
                                    'FINANCIAL','TAX','LEGAL','COMMERCIAL','HR','TECHNICAL','FULL'
                                )),
    target_entity_name      VARCHAR(500) NOT NULL,
    target_cin              VARCHAR(50),
    purpose                 VARCHAR(30) NOT NULL
                                CHECK (purpose IN (
                                    'ACQUISITION','INVESTMENT','MERGER','LENDING',
                                    'JOINT_VENTURE','IPO','OTHER'
                                )),
    engagement_date         TIMESTAMPTZ NOT NULL,
    report_date             TIMESTAMPTZ,
    key_findings            JSONB,                                        -- [{category, finding, severity, recommendation}]
    red_flags               JSONB,                                        -- [{description, impact, mitigation}]
    deal_value              NUMERIC(18,2),
    scope_period_from       TIMESTAMPTZ,
    scope_period_to         TIMESTAMPTZ,
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

CREATE INDEX idx_dd_org_id ON advisory.due_diligence (organization_id);
CREATE INDEX idx_dd_user_id ON advisory.due_diligence (user_id);
CREATE INDEX idx_dd_type ON advisory.due_diligence (dd_type);
CREATE INDEX idx_dd_purpose ON advisory.due_diligence (purpose);
CREATE INDEX idx_dd_status ON advisory.due_diligence (status);

ALTER TABLE advisory.due_diligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY dd_org_isolation ON advisory.due_diligence FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_dd_updated_at
    BEFORE UPDATE ON advisory.due_diligence
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 19. INTERNAL AUDIT (accounting schema — extend)
-- #############################################################################

-- =============================================================================
-- accounting.internal_audit
-- Internal audit engagements
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounting.internal_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    user_id                 UUID NOT NULL REFERENCES auth."user" (id),
    audit_type              VARCHAR(40) NOT NULL
                                CHECK (audit_type IN (
                                    'PROCESS','STOCK','VENDOR','STATUTORY_COMPLIANCE',
                                    'IT','REVENUE','EXPENDITURE','FIXED_ASSET','OTHER'
                                )),
    audit_period_from       TIMESTAMPTZ NOT NULL,
    audit_period_to         TIMESTAMPTZ NOT NULL,
    scope                   TEXT,
    findings_count          SMALLINT DEFAULT 0,
    critical_findings_count SMALLINT DEFAULT 0,
    report_date             TIMESTAMPTZ,
    auditor_name            VARCHAR(300),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PLANNED'
                                CHECK (status IN (
                                    'PLANNED','IN_PROGRESS','FIELDWORK','REVIEW',
                                    'COMPLETED','CANCELLED'
                                )),
    remarks                 TEXT,
    assigned_to             UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_int_audit_org_id ON accounting.internal_audit (organization_id);
CREATE INDEX idx_int_audit_user_id ON accounting.internal_audit (user_id);
CREATE INDEX idx_int_audit_type ON accounting.internal_audit (audit_type);
CREATE INDEX idx_int_audit_status ON accounting.internal_audit (status);
CREATE INDEX idx_int_audit_period ON accounting.internal_audit (audit_period_from, audit_period_to);

ALTER TABLE accounting.internal_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY int_audit_org_isolation ON accounting.internal_audit FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_int_audit_updated_at
    BEFORE UPDATE ON accounting.internal_audit
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.internal_audit_finding
-- Individual findings from internal audits
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounting.internal_audit_finding (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id                UUID NOT NULL REFERENCES accounting.internal_audit (id),
    organization_id         UUID NOT NULL REFERENCES auth.organization (id),
    finding_number          SMALLINT NOT NULL,
    finding_category        VARCHAR(60),                                   -- e.g. 'REVENUE_LEAKAGE','COMPLIANCE_GAP','PROCESS_WEAKNESS'
    severity                VARCHAR(20) NOT NULL DEFAULT 'LOW'
                                CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    description             TEXT NOT NULL,
    recommendation          TEXT,
    management_response     TEXT,
    status                  VARCHAR(30) NOT NULL DEFAULT 'OPEN'
                                CHECK (status IN (
                                    'OPEN','ACCEPTED','REMEDIATED','CLOSED','RISK_ACCEPTED'
                                )),
    remediation_date        TIMESTAMPTZ,
    remediation_owner       UUID REFERENCES auth."user" (id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (audit_id, finding_number)
);

CREATE INDEX idx_int_finding_audit_id ON accounting.internal_audit_finding (audit_id);
CREATE INDEX idx_int_finding_org_id ON accounting.internal_audit_finding (organization_id);
CREATE INDEX idx_int_finding_severity ON accounting.internal_audit_finding (severity);
CREATE INDEX idx_int_finding_status ON accounting.internal_audit_finding (status);

ALTER TABLE accounting.internal_audit_finding ENABLE ROW LEVEL SECURITY;
CREATE POLICY int_finding_org_isolation ON accounting.internal_audit_finding FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_int_finding_updated_at
    BEFORE UPDATE ON accounting.internal_audit_finding
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 20. EQUALISATION LEVY (itr schema — extend)
-- #############################################################################

-- =============================================================================
-- itr.equalisation_levy
-- Equalisation Levy (Google Tax) compliance — 6% and 2% levy
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.equalisation_levy (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id                 UUID NOT NULL REFERENCES auth.organization (id),
    user_id                         UUID NOT NULL REFERENCES auth."user" (id),
    assessment_year                 VARCHAR(10) NOT NULL,
    period_from                     TIMESTAMPTZ NOT NULL,
    period_to                       TIMESTAMPTZ NOT NULL,
    total_payments_to_nonresidents  NUMERIC(18,2),
    levy_at_6_percent               NUMERIC(18,2) DEFAULT 0,              -- Sec 165 (specified services)
    levy_at_2_percent               NUMERIC(18,2) DEFAULT 0,              -- Sec 165A (e-commerce)
    total_levy                      NUMERIC(18,2),
    challan_number                  VARCHAR(100),
    payment_date                    TIMESTAMPTZ,
    form1_filing_date               TIMESTAMPTZ,                          -- Form No. 1 (annual statement)
    due_date                        TIMESTAMPTZ NOT NULL,
    pan_of_payee                    VARCHAR(10) CHECK (pan_of_payee ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    status                          VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                        CHECK (status IN (
                                            'PENDING','COMPUTED','PAID','FILED',
                                            'OVERDUE','REVISED','CANCELLED'
                                        )),
    remarks                         TEXT,
    assigned_to                     UUID REFERENCES auth."user" (id),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                      TIMESTAMPTZ,
    created_by                      UUID,
    updated_by                      UUID
);

CREATE INDEX idx_eq_levy_org_id ON itr.equalisation_levy (organization_id);
CREATE INDEX idx_eq_levy_user_id ON itr.equalisation_levy (user_id);
CREATE INDEX idx_eq_levy_ay ON itr.equalisation_levy (assessment_year);
CREATE INDEX idx_eq_levy_status ON itr.equalisation_levy (status);
CREATE INDEX idx_eq_levy_due_date ON itr.equalisation_levy (due_date);

ALTER TABLE itr.equalisation_levy ENABLE ROW LEVEL SECURITY;
CREATE POLICY eq_levy_org_isolation ON itr.equalisation_levy FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_eq_levy_updated_at
    BEFORE UPDATE ON itr.equalisation_levy
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE fema.fema_registration IS 'FEMA registration with RBI (FDI/ODI/ECB/SOFTEX/LRS)';
COMMENT ON TABLE fema.fla_return IS 'Annual Foreign Liabilities and Assets (FLA) return to RBI';
COMMENT ON TABLE fema.fema_transaction IS 'Individual FEMA transactions (inward/outward remittances)';
COMMENT ON TABLE itr.transfer_pricing_report IS 'Form 3CEB — Transfer Pricing report for international/domestic transactions';
COMMENT ON TABLE compliance.director_kyc IS 'Annual DIR-3 KYC filing for company directors';
COMMENT ON TABLE compliance.dpt3_return IS 'DPT-3 return of deposits/exempted deposits';
COMMENT ON TABLE compliance.xbrl_filing IS 'XBRL financial statement filing with MCA';
COMMENT ON TABLE compliance.csr_report IS 'CSR-1/CSR-2 annual Corporate Social Responsibility filing';
COMMENT ON TABLE registration.shop_establishment IS 'Shop & Establishment Act registration (state-level)';
COMMENT ON TABLE advisory.due_diligence IS 'Financial/tax/legal due diligence engagements';
COMMENT ON TABLE accounting.internal_audit IS 'Internal audit engagements (process, stock, vendor, IT, etc.)';
COMMENT ON TABLE accounting.internal_audit_finding IS 'Individual findings from internal audits with severity and remediation';
COMMENT ON TABLE itr.equalisation_levy IS 'Equalisation Levy (Google Tax) — 6% and 2% compliance';

COMMIT;
