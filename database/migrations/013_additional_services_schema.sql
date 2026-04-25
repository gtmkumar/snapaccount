-- =============================================================================
-- 013_additional_services_schema.sql
-- Additional Services — Tax Audit, Business Registration, ROC Compliance,
-- Trademark/IP, PF/ESI/Payroll, Financial Advisory, Project Report,
-- Import-Export, Appeals/Tribunal, GEM, Legal, NGO/Trust, Startup/MSME,
-- Certification
-- Depends on: 000_init.sql, 001_auth_schema.sql, 003_accounting_schema.sql,
--             004_gst_schema.sql, 006_itr_schema.sql, 009_report_schema.sql,
--             012_shared_schema.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- NEW SCHEMAS
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS registration;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS payroll;
CREATE SCHEMA IF NOT EXISTS advisory;


-- #############################################################################
-- 1. TAX AUDIT (accounting schema — extend)
-- #############################################################################

-- =============================================================================
-- accounting.tax_audit
-- Tax audit engagements under Section 44AB and company audits
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounting.tax_audit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),     -- client user
    assessment_year     VARCHAR(10) NOT NULL,                          -- e.g. '2025-26'
    financial_year      VARCHAR(10) NOT NULL,                          -- e.g. '2024-25'
    audit_type          VARCHAR(40) NOT NULL
                            CHECK (audit_type IN (
                                'TAX_AUDIT_44AB','COMPANY_AUDIT','TRUST_AUDIT',
                                'COOPERATIVE_AUDIT','CONCURRENT_AUDIT','INTERNAL_AUDIT',
                                'STATUTORY_AUDIT','GST_AUDIT','OTHER'
                            )),
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','IN_PROGRESS','REVIEW','COMPLETED',
                                'FILED','CANCELLED'
                            )),
    auditor_name        VARCHAR(300),
    auditor_membership_no VARCHAR(50),                                 -- ICAI membership number
    firm_registration_no  VARCHAR(50),                                 -- CA firm FRN
    due_date            TIMESTAMPTZ NOT NULL,
    filing_date         TIMESTAMPTZ,
    turnover            NUMERIC(18,2),                                 -- gross turnover / receipts
    form_number         VARCHAR(20),                                   -- e.g. 3CA/3CB/3CD
    udin              VARCHAR(50),                                   -- Unique Document Identification Number
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),              -- CA staff assigned
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_tax_audit_org_id ON accounting.tax_audit (organization_id);
CREATE INDEX idx_tax_audit_user_id ON accounting.tax_audit (user_id);
CREATE INDEX idx_tax_audit_ay ON accounting.tax_audit (assessment_year);
CREATE INDEX idx_tax_audit_status ON accounting.tax_audit (status);
CREATE INDEX idx_tax_audit_due_date ON accounting.tax_audit (due_date);

ALTER TABLE accounting.tax_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_audit_org_isolation ON accounting.tax_audit FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_tax_audit_updated_at
    BEFORE UPDATE ON accounting.tax_audit
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.tax_audit_finding
-- Observations and findings from tax audits
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounting.tax_audit_finding (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_audit_id        UUID NOT NULL REFERENCES accounting.tax_audit (id),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    finding_number      SMALLINT NOT NULL,                             -- sequential within audit
    category            VARCHAR(60),                                   -- e.g. 'REVENUE_RECOGNITION','DEPRECIATION','TDS_COMPLIANCE'
    clause_reference    VARCHAR(50),                                   -- e.g. 'Clause 21(b)' of Form 3CD
    observation         TEXT NOT NULL,
    impact_amount       NUMERIC(18,2),
    severity            VARCHAR(20) NOT NULL DEFAULT 'LOW'
                            CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    management_response TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','WAIVED')),
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (tax_audit_id, finding_number)
);

CREATE INDEX idx_tax_audit_finding_audit_id ON accounting.tax_audit_finding (tax_audit_id);
CREATE INDEX idx_tax_audit_finding_org_id ON accounting.tax_audit_finding (organization_id);
CREATE INDEX idx_tax_audit_finding_status ON accounting.tax_audit_finding (status);

ALTER TABLE accounting.tax_audit_finding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_audit_finding_org_isolation ON accounting.tax_audit_finding FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_tax_audit_finding_updated_at
    BEFORE UPDATE ON accounting.tax_audit_finding
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 2. BUSINESS REGISTRATION (registration schema — NEW)
-- #############################################################################

-- =============================================================================
-- registration.business_registration
-- Company/LLP/OPC/Partnership/Trust/Society registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.business_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    entity_type         VARCHAR(40) NOT NULL
                            CHECK (entity_type IN (
                                'PRIVATE_LIMITED','PUBLIC_LIMITED','LLP','OPC',
                                'PARTNERSHIP','SOLE_PROPRIETORSHIP','TRUST',
                                'SOCIETY','SECTION_8','HUF','OTHER'
                            )),
    registration_type   VARCHAR(30) NOT NULL DEFAULT 'NEW'
                            CHECK (registration_type IN (
                                'NEW','CONVERSION','AMENDMENT','STRIKE_OFF','REVIVAL'
                            )),
    entity_name         VARCHAR(500) NOT NULL,
    cin_llpin           VARCHAR(50),                                   -- CIN or LLPIN from MCA
    registration_number VARCHAR(100),
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','NAME_RESERVED','DOCUMENTS_PENDING',
                                'FILED','APPROVED','REJECTED','COMPLETED','CANCELLED'
                            )),
    mca_filing_date     TIMESTAMPTZ,
    incorporation_date  TIMESTAMPTZ,
    registered_address  TEXT,
    authorized_capital  NUMERIC(18,2),                                 -- for companies
    paid_up_capital     NUMERIC(18,2),
    pan_number          VARCHAR(10) CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    gstin               VARCHAR(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    assigned_to         UUID REFERENCES auth."user" (id),
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_biz_reg_org_id ON registration.business_registration (organization_id);
CREATE INDEX idx_biz_reg_user_id ON registration.business_registration (user_id);
CREATE INDEX idx_biz_reg_entity_type ON registration.business_registration (entity_type);
CREATE INDEX idx_biz_reg_status ON registration.business_registration (status);
CREATE INDEX idx_biz_reg_cin ON registration.business_registration (cin_llpin) WHERE cin_llpin IS NOT NULL;

ALTER TABLE registration.business_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY biz_reg_org_isolation ON registration.business_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_biz_reg_updated_at
    BEFORE UPDATE ON registration.business_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- registration.registration_document
-- Documents attached to a registration engagement
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.registration_document (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_registration_id UUID NOT NULL REFERENCES registration.business_registration (id),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    document_name       VARCHAR(300) NOT NULL,
    document_type       VARCHAR(60) NOT NULL,                          -- e.g. 'MOA','AOA','PAN_CARD','ADDRESS_PROOF','DIRECTOR_ID'
    storage_path        TEXT NOT NULL,                                 -- GCS path
    file_size_bytes     BIGINT,
    mime_type           VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'UPLOADED'
                            CHECK (status IN ('UPLOADED','VERIFIED','REJECTED','ARCHIVED')),
    verified_by         UUID REFERENCES auth."user" (id),
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_reg_doc_biz_reg_id ON registration.registration_document (business_registration_id);
CREATE INDEX idx_reg_doc_org_id ON registration.registration_document (organization_id);

ALTER TABLE registration.registration_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY reg_doc_org_isolation ON registration.registration_document FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_reg_doc_updated_at
    BEFORE UPDATE ON registration.registration_document
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 3. ROC COMPLIANCE (compliance schema — NEW)
-- #############################################################################

-- =============================================================================
-- compliance.roc_filing
-- MCA/ROC annual returns and form filings
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.roc_filing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    form_type           VARCHAR(30) NOT NULL
                            CHECK (form_type IN (
                                'AOC-4','AOC-4-XBRL','MGT-7','MGT-7A','DIR-3-KYC',
                                'DIR-3-KYC-WEB','ADT-1','INC-20A','INC-22A','MSME-1',
                                'DPT-3','GNL-3','MGT-14','SH-7','CHG-1','CHG-4',
                                'BEN-2','FC-4','OTHER'
                            )),
    cin_llpin           VARCHAR(50),
    financial_year      VARCHAR(10) NOT NULL,
    filing_status       VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (filing_status IN (
                                'PENDING','IN_PROGRESS','FILED','APPROVED',
                                'REJECTED','RESUBMITTED','OVERDUE'
                            )),
    due_date            TIMESTAMPTZ NOT NULL,
    filing_date         TIMESTAMPTZ,
    acknowledgement_number VARCHAR(50),
    srn_number          VARCHAR(50),                                   -- Service Request Number
    additional_fee      NUMERIC(18,2) DEFAULT 0,                       -- late filing penalty
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_roc_filing_org_id ON compliance.roc_filing (organization_id);
CREATE INDEX idx_roc_filing_user_id ON compliance.roc_filing (user_id);
CREATE INDEX idx_roc_filing_form_type ON compliance.roc_filing (form_type);
CREATE INDEX idx_roc_filing_status ON compliance.roc_filing (filing_status);
CREATE INDEX idx_roc_filing_due_date ON compliance.roc_filing (due_date);
CREATE INDEX idx_roc_filing_fy ON compliance.roc_filing (financial_year);

ALTER TABLE compliance.roc_filing ENABLE ROW LEVEL SECURITY;
CREATE POLICY roc_filing_org_isolation ON compliance.roc_filing FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_roc_filing_updated_at
    BEFORE UPDATE ON compliance.roc_filing
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- compliance.compliance_calendar
-- Auto-generated compliance deadlines per entity
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.compliance_calendar (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    compliance_type     VARCHAR(60) NOT NULL,                          -- e.g. 'ROC','GST','TDS','PF','ESI','IT'
    form_or_return      VARCHAR(50) NOT NULL,                          -- e.g. 'GSTR-3B','AOC-4','TDS Q1'
    financial_year      VARCHAR(10) NOT NULL,
    period              VARCHAR(30),                                   -- e.g. 'Q1','APRIL','H1','ANNUAL'
    due_date            TIMESTAMPTZ NOT NULL,
    extended_due_date   TIMESTAMPTZ,                                   -- government extensions
    status              VARCHAR(20) NOT NULL DEFAULT 'UPCOMING'
                            CHECK (status IN ('UPCOMING','DUE_SOON','OVERDUE','COMPLETED','NOT_APPLICABLE')),
    completed_at        TIMESTAMPTZ,
    reference_id        UUID,                                          -- FK to actual filing record (polymorphic)
    reference_type      VARCHAR(60),                                   -- e.g. 'roc_filing','gst_return','pf_return'
    reminder_sent       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_comp_cal_org_id ON compliance.compliance_calendar (organization_id);
CREATE INDEX idx_comp_cal_type ON compliance.compliance_calendar (compliance_type);
CREATE INDEX idx_comp_cal_due_date ON compliance.compliance_calendar (due_date);
CREATE INDEX idx_comp_cal_status ON compliance.compliance_calendar (status);
CREATE INDEX idx_comp_cal_fy ON compliance.compliance_calendar (financial_year);

ALTER TABLE compliance.compliance_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY comp_cal_org_isolation ON compliance.compliance_calendar FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_comp_cal_updated_at
    BEFORE UPDATE ON compliance.compliance_calendar
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 4. TRADEMARK / IP (registration schema)
-- #############################################################################

-- =============================================================================
-- registration.trademark_application
-- Trademark/IP registration tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.trademark_application (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    application_number  VARCHAR(50),
    trademark_name      VARCHAR(500) NOT NULL,
    class_of_goods      SMALLINT NOT NULL CHECK (class_of_goods BETWEEN 1 AND 45), -- Nice Classification 1-45
    mark_type           VARCHAR(20) NOT NULL
                            CHECK (mark_type IN ('WORD','DEVICE','COMBINED','SOUND','3D','COLOR')),
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','SEARCH_DONE','FILED','EXAMINED',
                                'OBJECTED','ADVERTISED','OPPOSED','REGISTERED',
                                'REFUSED','ABANDONED','RENEWED'
                            )),
    journal_number      VARCHAR(50),                                   -- TM Journal publication number
    filing_date         TIMESTAMPTZ,
    registration_date   TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,                                   -- 10 years from registration
    applicant_name      VARCHAR(300) NOT NULL,
    applicant_type      VARCHAR(30) CHECK (applicant_type IN ('INDIVIDUAL','COMPANY','LLP','PARTNERSHIP','TRUST','OTHER')),
    attorney_name       VARCHAR(300),
    logo_storage_path   TEXT,                                          -- GCS path for device/combined marks
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_tm_app_org_id ON registration.trademark_application (organization_id);
CREATE INDEX idx_tm_app_user_id ON registration.trademark_application (user_id);
CREATE INDEX idx_tm_app_status ON registration.trademark_application (status);
CREATE INDEX idx_tm_app_app_number ON registration.trademark_application (application_number) WHERE application_number IS NOT NULL;
CREATE INDEX idx_tm_app_class ON registration.trademark_application (class_of_goods);

ALTER TABLE registration.trademark_application ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_app_org_isolation ON registration.trademark_application FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_tm_app_updated_at
    BEFORE UPDATE ON registration.trademark_application
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 5. PF ESI / PAYROLL COMPLIANCE (payroll schema — NEW)
-- #############################################################################

-- =============================================================================
-- payroll.employee
-- Employee master for PF/ESI payroll compliance
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.employee (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    employee_code       VARCHAR(50),
    name                VARCHAR(300) NOT NULL,
    father_husband_name VARCHAR(300),
    date_of_birth       DATE,
    date_of_joining     DATE NOT NULL,
    date_of_exit        DATE,
    gender              VARCHAR(10) CHECK (gender IN ('MALE','FEMALE','OTHER')),
    uan_number          VARCHAR(12),                                   -- Universal Account Number (PF)
    esic_ip_number      VARCHAR(20),                                   -- ESIC Insurance Person number
    pan_number          VARCHAR(10) CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    aadhaar_last_four   VARCHAR(4) CHECK (aadhaar_last_four ~ '^[0-9]{4}$'),
    bank_account_number VARCHAR(30),
    ifsc_code           VARCHAR(11) CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    basic_salary        NUMERIC(18,2) NOT NULL DEFAULT 0,
    da_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,              -- Dearness Allowance
    gross_salary        NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_pf_applicable    BOOLEAN NOT NULL DEFAULT TRUE,
    is_esic_applicable  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_payroll_emp_org_id ON payroll.employee (organization_id);
CREATE INDEX idx_payroll_emp_uan ON payroll.employee (uan_number) WHERE uan_number IS NOT NULL;
CREATE INDEX idx_payroll_emp_esic ON payroll.employee (esic_ip_number) WHERE esic_ip_number IS NOT NULL;
CREATE INDEX idx_payroll_emp_active ON payroll.employee (organization_id, is_active);

ALTER TABLE payroll.employee ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_emp_org_isolation ON payroll.employee FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_payroll_emp_updated_at
    BEFORE UPDATE ON payroll.employee
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- payroll.epf_registration
-- EPF establishment registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.epf_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    establishment_code  VARCHAR(50),                                   -- EPFO establishment code
    establishment_name  VARCHAR(500) NOT NULL,
    date_of_setup       DATE,
    employer_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,    -- typically 12%
    employee_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    admin_charges_rate  NUMERIC(5,2) NOT NULL DEFAULT 0.50,
    edli_rate           NUMERIC(5,2) NOT NULL DEFAULT 0.50,
    total_employees     INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED','PENDING')),
    registration_date   DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_epf_reg_org_id ON payroll.epf_registration (organization_id);
CREATE INDEX idx_epf_reg_estab_code ON payroll.epf_registration (establishment_code) WHERE establishment_code IS NOT NULL;

ALTER TABLE payroll.epf_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY epf_reg_org_isolation ON payroll.epf_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_epf_reg_updated_at
    BEFORE UPDATE ON payroll.epf_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- payroll.esic_registration
-- ESIC establishment registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.esic_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    esic_code           VARCHAR(50),                                   -- 17-digit ESIC code
    establishment_name  VARCHAR(500) NOT NULL,
    employer_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 3.25,     -- employer share
    employee_contribution_rate NUMERIC(5,2) NOT NULL DEFAULT 0.75,     -- employee share
    wage_ceiling        NUMERIC(18,2) NOT NULL DEFAULT 21000,          -- current ESI wage ceiling
    total_employees     INTEGER NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED','PENDING')),
    registration_date   DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_esic_reg_org_id ON payroll.esic_registration (organization_id);
CREATE INDEX idx_esic_reg_code ON payroll.esic_registration (esic_code) WHERE esic_code IS NOT NULL;

ALTER TABLE payroll.esic_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY esic_reg_org_isolation ON payroll.esic_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_esic_reg_updated_at
    BEFORE UPDATE ON payroll.esic_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- payroll.pf_return
-- Monthly PF return filing (ECR)
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.pf_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    epf_registration_id UUID NOT NULL REFERENCES payroll.epf_registration (id),
    month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    wage_month          VARCHAR(20) NOT NULL,                          -- e.g. 'April 2025'
    total_employees     INTEGER NOT NULL DEFAULT 0,
    total_epf_wages     NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_eps_wages     NUMERIC(18,2) NOT NULL DEFAULT 0,
    employer_share      NUMERIC(18,2) NOT NULL DEFAULT 0,
    employee_share      NUMERIC(18,2) NOT NULL DEFAULT 0,
    admin_charges       NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_challan       NUMERIC(18,2) NOT NULL DEFAULT 0,
    ecr_file_path       TEXT,                                          -- uploaded ECR file GCS path
    challan_number      VARCHAR(50),
    challan_date        DATE,
    trrn_number         VARCHAR(50),                                   -- Transaction Reference Number
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','ECR_GENERATED','CHALLAN_PAID','FILED','LATE_FILED','FAILED'
                            )),
    due_date            TIMESTAMPTZ NOT NULL,                          -- 15th of following month
    filing_date         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (epf_registration_id, month, year)
);

CREATE INDEX idx_pf_return_org_id ON payroll.pf_return (organization_id);
CREATE INDEX idx_pf_return_epf_reg_id ON payroll.pf_return (epf_registration_id);
CREATE INDEX idx_pf_return_period ON payroll.pf_return (year, month);
CREATE INDEX idx_pf_return_status ON payroll.pf_return (status);
CREATE INDEX idx_pf_return_due_date ON payroll.pf_return (due_date);

ALTER TABLE payroll.pf_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY pf_return_org_isolation ON payroll.pf_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_pf_return_updated_at
    BEFORE UPDATE ON payroll.pf_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- payroll.esi_return
-- Half-yearly ESI return filing
-- =============================================================================
CREATE TABLE IF NOT EXISTS payroll.esi_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    esic_registration_id UUID NOT NULL REFERENCES payroll.esic_registration (id),
    contribution_period VARCHAR(20) NOT NULL,                          -- e.g. 'OCT-MAR', 'APR-SEP'
    year                SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    total_employees     INTEGER NOT NULL DEFAULT 0,
    total_ip_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_employer_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_contribution  NUMERIC(18,2) NOT NULL DEFAULT 0,
    challan_number      VARCHAR(50),
    challan_date        DATE,
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','IN_PROGRESS','CHALLAN_PAID','FILED','LATE_FILED','FAILED'
                            )),
    due_date            TIMESTAMPTZ NOT NULL,
    filing_date         TIMESTAMPTZ,
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (esic_registration_id, contribution_period, year)
);

CREATE INDEX idx_esi_return_org_id ON payroll.esi_return (organization_id);
CREATE INDEX idx_esi_return_esic_reg_id ON payroll.esi_return (esic_registration_id);
CREATE INDEX idx_esi_return_period ON payroll.esi_return (year, contribution_period);
CREATE INDEX idx_esi_return_status ON payroll.esi_return (status);

ALTER TABLE payroll.esi_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY esi_return_org_isolation ON payroll.esi_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_esi_return_updated_at
    BEFORE UPDATE ON payroll.esi_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 6. FINANCIAL ADVISORY (advisory schema — NEW)
-- #############################################################################

-- =============================================================================
-- advisory.advisory_engagement
-- Financial/investment advisory engagements
-- =============================================================================
CREATE TABLE IF NOT EXISTS advisory.advisory_engagement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    engagement_type     VARCHAR(40) NOT NULL
                            CHECK (engagement_type IN (
                                'INVESTMENT_ADVISORY','TAX_PLANNING','BUSINESS_VALUATION',
                                'DUE_DILIGENCE','FINANCIAL_RESTRUCTURING','SUCCESSION_PLANNING',
                                'WEALTH_MANAGEMENT','RETIREMENT_PLANNING','OTHER'
                            )),
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','IN_PROGRESS','REVIEW','DELIVERED','CLOSED','CANCELLED'
                            )),
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    fee_amount          NUMERIC(18,2),
    fee_type            VARCHAR(20) CHECK (fee_type IN ('FIXED','HOURLY','PERCENTAGE','RETAINER')),
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_adv_eng_org_id ON advisory.advisory_engagement (organization_id);
CREATE INDEX idx_adv_eng_user_id ON advisory.advisory_engagement (user_id);
CREATE INDEX idx_adv_eng_type ON advisory.advisory_engagement (engagement_type);
CREATE INDEX idx_adv_eng_status ON advisory.advisory_engagement (status);

ALTER TABLE advisory.advisory_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY adv_eng_org_isolation ON advisory.advisory_engagement FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_adv_eng_updated_at
    BEFORE UPDATE ON advisory.advisory_engagement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- advisory.investment_portfolio
-- Client investment tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS advisory.investment_portfolio (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    engagement_id       UUID REFERENCES advisory.advisory_engagement (id),
    instrument_type     VARCHAR(40) NOT NULL
                            CHECK (instrument_type IN (
                                'EQUITY','MUTUAL_FUND','FD','PPF','NPS','ELSS',
                                'BONDS','REAL_ESTATE','GOLD','INSURANCE','OTHER'
                            )),
    instrument_name     VARCHAR(500) NOT NULL,
    folio_or_account    VARCHAR(100),                                  -- folio number / demat account
    units_or_quantity   NUMERIC(18,4),
    purchase_price      NUMERIC(18,2),
    current_value       NUMERIC(18,2),
    purchase_date       DATE,
    maturity_date       DATE,
    annual_return_pct   NUMERIC(8,4),
    tax_section         VARCHAR(20),                                   -- e.g. '80C','80CCD','54EC'
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_inv_port_org_id ON advisory.investment_portfolio (organization_id);
CREATE INDEX idx_inv_port_user_id ON advisory.investment_portfolio (user_id);
CREATE INDEX idx_inv_port_eng_id ON advisory.investment_portfolio (engagement_id) WHERE engagement_id IS NOT NULL;
CREATE INDEX idx_inv_port_type ON advisory.investment_portfolio (instrument_type);

ALTER TABLE advisory.investment_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_port_org_isolation ON advisory.investment_portfolio FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_inv_port_updated_at
    BEFORE UPDATE ON advisory.investment_portfolio
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- advisory.advisory_report
-- Generated advisory reports
-- =============================================================================
CREATE TABLE IF NOT EXISTS advisory.advisory_report (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    engagement_id       UUID NOT NULL REFERENCES advisory.advisory_engagement (id),
    report_type         VARCHAR(40) NOT NULL
                            CHECK (report_type IN (
                                'INVESTMENT_SUMMARY','TAX_PLAN','VALUATION_REPORT',
                                'DUE_DILIGENCE_REPORT','FINANCIAL_HEALTH','PORTFOLIO_REVIEW','OTHER'
                            )),
    title               VARCHAR(500) NOT NULL,
    storage_path        TEXT,                                          -- GCS path
    version             SMALLINT NOT NULL DEFAULT 1,
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','REVIEW','APPROVED','DELIVERED','ARCHIVED')),
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_adv_report_org_id ON advisory.advisory_report (organization_id);
CREATE INDEX idx_adv_report_eng_id ON advisory.advisory_report (engagement_id);
CREATE INDEX idx_adv_report_status ON advisory.advisory_report (status);

ALTER TABLE advisory.advisory_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY adv_report_org_isolation ON advisory.advisory_report FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_adv_report_updated_at
    BEFORE UPDATE ON advisory.advisory_report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 7. PROJECT REPORT (report schema — extend)
-- #############################################################################

-- =============================================================================
-- report.project_report
-- DPR / business plan generation for bank loans
-- =============================================================================
CREATE TABLE IF NOT EXISTS report.project_report (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    project_name        VARCHAR(500) NOT NULL,
    project_description TEXT,
    industry_sector     VARCHAR(200),
    total_project_cost  NUMERIC(18,2) NOT NULL,
    loan_amount         NUMERIC(18,2) NOT NULL,
    promoter_contribution NUMERIC(18,2) NOT NULL,
    subsidy_amount      NUMERIC(18,2) DEFAULT 0,                       -- government subsidy if any
    debt_equity_ratio   NUMERIC(8,4),
    irr_percentage      NUMERIC(8,4),                                  -- Internal Rate of Return
    dscr                NUMERIC(8,4),                                  -- Debt Service Coverage Ratio
    payback_period_months SMALLINT,
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','IN_PROGRESS','REVIEW','APPROVED',
                                'SUBMITTED_TO_BANK','SANCTIONED','REJECTED','ARCHIVED'
                            )),
    bank_name           VARCHAR(300),
    loan_application_id UUID,                                          -- FK to loan.loan_application if applicable
    storage_path        TEXT,                                          -- generated PDF/doc GCS path
    version             SMALLINT NOT NULL DEFAULT 1,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_proj_report_org_id ON report.project_report (organization_id);
CREATE INDEX idx_proj_report_user_id ON report.project_report (user_id);
CREATE INDEX idx_proj_report_status ON report.project_report (status);

ALTER TABLE report.project_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY proj_report_org_isolation ON report.project_report FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_proj_report_updated_at
    BEFORE UPDATE ON report.project_report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 8. IMPORT-EXPORT (compliance schema)
-- #############################################################################

-- =============================================================================
-- compliance.iec_registration
-- Import Export Code registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.iec_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    iec_code            VARCHAR(10),                                   -- 10-digit IEC
    entity_name         VARCHAR(500) NOT NULL,
    pan_number          VARCHAR(10) CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    dgft_status         VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (dgft_status IN (
                                'PENDING','APPLIED','APPROVED','REJECTED','SUSPENDED','CANCELLED'
                            )),
    issue_date          DATE,
    last_updated_on_dgft DATE,                                         -- last update on DGFT portal
    branches            JSONB,                                         -- branch addresses as JSON array
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_iec_reg_org_id ON compliance.iec_registration (organization_id);
CREATE INDEX idx_iec_reg_user_id ON compliance.iec_registration (user_id);
CREATE INDEX idx_iec_reg_code ON compliance.iec_registration (iec_code) WHERE iec_code IS NOT NULL;
CREATE INDEX idx_iec_reg_status ON compliance.iec_registration (dgft_status);

ALTER TABLE compliance.iec_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY iec_reg_org_isolation ON compliance.iec_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_iec_reg_updated_at
    BEFORE UPDATE ON compliance.iec_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- compliance.foreign_trade_transaction
-- Import/Export transaction tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.foreign_trade_transaction (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    iec_registration_id UUID NOT NULL REFERENCES compliance.iec_registration (id),
    transaction_type    VARCHAR(10) NOT NULL CHECK (transaction_type IN ('IMPORT','EXPORT')),
    invoice_number      VARCHAR(100) NOT NULL,
    invoice_date        DATE NOT NULL,
    port_code           VARCHAR(10),                                   -- customs port code
    shipping_bill_number VARCHAR(50),                                  -- for exports
    bill_of_entry_number VARCHAR(50),                                  -- for imports
    hsn_code            VARCHAR(12),
    product_description TEXT,
    quantity            NUMERIC(18,4),
    unit                VARCHAR(20),
    currency            VARCHAR(10) NOT NULL DEFAULT 'USD',
    fob_value           NUMERIC(18,2),                                 -- FOB value in foreign currency
    inr_value           NUMERIC(18,2) NOT NULL,                        -- INR equivalent
    exchange_rate       NUMERIC(12,6),
    duty_amount         NUMERIC(18,2) DEFAULT 0,
    igst_amount         NUMERIC(18,2) DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','CLEARED','HELD','CANCELLED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ftt_org_id ON compliance.foreign_trade_transaction (organization_id);
CREATE INDEX idx_ftt_iec_reg_id ON compliance.foreign_trade_transaction (iec_registration_id);
CREATE INDEX idx_ftt_type ON compliance.foreign_trade_transaction (transaction_type);
CREATE INDEX idx_ftt_invoice_date ON compliance.foreign_trade_transaction (invoice_date);

ALTER TABLE compliance.foreign_trade_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY ftt_org_isolation ON compliance.foreign_trade_transaction FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_ftt_updated_at
    BEFORE UPDATE ON compliance.foreign_trade_transaction
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 9. APPEAL / TRIBUNAL (itr + gst schemas — extend)
-- #############################################################################

-- =============================================================================
-- itr.tax_appeal
-- Income tax appeal tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS itr.tax_appeal (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    itr_return_id       UUID REFERENCES itr.itr_return (id),           -- related ITR if any
    appeal_type         VARCHAR(30) NOT NULL
                            CHECK (appeal_type IN (
                                'CIT_APPEAL','ITAT','HIGH_COURT','SUPREME_COURT',
                                'REVISION_264','RECTIFICATION_154'
                            )),
    assessment_year     VARCHAR(10) NOT NULL,
    appeal_number       VARCHAR(100),
    filing_date         TIMESTAMPTZ,
    order_date          TIMESTAMPTZ,
    demand_amount       NUMERIC(18,2),
    disputed_amount     NUMERIC(18,2),
    relief_granted      NUMERIC(18,2),
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','FILED','HEARING_SCHEDULED','ADJOURNED',
                                'ORDER_PASSED','PARTIALLY_ALLOWED','ALLOWED',
                                'DISMISSED','WITHDRAWN','FURTHER_APPEAL'
                            )),
    next_hearing_date   TIMESTAMPTZ,
    officer_name        VARCHAR(300),                                  -- AO / CIT / ITAT bench
    counsel_name        VARCHAR(300),                                  -- representing CA/Advocate
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_tax_appeal_org_id ON itr.tax_appeal (organization_id);
CREATE INDEX idx_tax_appeal_user_id ON itr.tax_appeal (user_id);
CREATE INDEX idx_tax_appeal_itr_id ON itr.tax_appeal (itr_return_id) WHERE itr_return_id IS NOT NULL;
CREATE INDEX idx_tax_appeal_type ON itr.tax_appeal (appeal_type);
CREATE INDEX idx_tax_appeal_status ON itr.tax_appeal (status);
CREATE INDEX idx_tax_appeal_hearing ON itr.tax_appeal (next_hearing_date) WHERE next_hearing_date IS NOT NULL;

ALTER TABLE itr.tax_appeal ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_appeal_org_isolation ON itr.tax_appeal FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_tax_appeal_updated_at
    BEFORE UPDATE ON itr.tax_appeal
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- gst.gst_appeal
-- GST appeal tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS gst.gst_appeal (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    gstin               VARCHAR(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    appeal_type         VARCHAR(40) NOT NULL
                            CHECK (appeal_type IN (
                                'FIRST_APPEAL','APPELLATE_TRIBUNAL','HIGH_COURT',
                                'SUPREME_COURT','REVISION','ADVANCE_RULING'
                            )),
    financial_year      VARCHAR(10) NOT NULL,
    appeal_number       VARCHAR(100),
    order_number        VARCHAR(100),                                  -- original order being appealed
    order_date          TIMESTAMPTZ,
    demand_amount       NUMERIC(18,2),
    disputed_tax        NUMERIC(18,2),
    disputed_penalty    NUMERIC(18,2),
    disputed_interest   NUMERIC(18,2),
    pre_deposit_amount  NUMERIC(18,2),                                 -- mandatory pre-deposit for appeal
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','FILED','HEARING_SCHEDULED','ADJOURNED',
                                'ORDER_PASSED','ALLOWED','PARTIALLY_ALLOWED',
                                'DISMISSED','WITHDRAWN','FURTHER_APPEAL'
                            )),
    next_hearing_date   TIMESTAMPTZ,
    authority_name      VARCHAR(300),
    counsel_name        VARCHAR(300),
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gst_appeal_org_id ON gst.gst_appeal (organization_id);
CREATE INDEX idx_gst_appeal_user_id ON gst.gst_appeal (user_id);
CREATE INDEX idx_gst_appeal_type ON gst.gst_appeal (appeal_type);
CREATE INDEX idx_gst_appeal_status ON gst.gst_appeal (status);
CREATE INDEX idx_gst_appeal_hearing ON gst.gst_appeal (next_hearing_date) WHERE next_hearing_date IS NOT NULL;
CREATE INDEX idx_gst_appeal_gstin ON gst.gst_appeal (gstin) WHERE gstin IS NOT NULL;

ALTER TABLE gst.gst_appeal ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_appeal_org_isolation ON gst.gst_appeal FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gst_appeal_updated_at
    BEFORE UPDATE ON gst.gst_appeal
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 10. GEM — Government e-Marketplace (registration schema)
-- #############################################################################

-- =============================================================================
-- registration.gem_registration
-- GEM seller registration
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.gem_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    gem_seller_id       VARCHAR(50),                                   -- GEM portal seller ID
    entity_name         VARCHAR(500) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','DOCUMENTS_SUBMITTED','UNDER_REVIEW',
                                'APPROVED','REJECTED','SUSPENDED','ACTIVE'
                            )),
    categories          JSONB,                                         -- array of product/service categories
    msme_registered     BOOLEAN NOT NULL DEFAULT FALSE,
    startup_registered  BOOLEAN NOT NULL DEFAULT FALSE,
    registration_date   DATE,
    last_renewal_date   DATE,
    oem_authorization   BOOLEAN NOT NULL DEFAULT FALSE,                -- Original Equipment Manufacturer auth
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gem_reg_org_id ON registration.gem_registration (organization_id);
CREATE INDEX idx_gem_reg_user_id ON registration.gem_registration (user_id);
CREATE INDEX idx_gem_reg_seller_id ON registration.gem_registration (gem_seller_id) WHERE gem_seller_id IS NOT NULL;
CREATE INDEX idx_gem_reg_status ON registration.gem_registration (status);

ALTER TABLE registration.gem_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY gem_reg_org_isolation ON registration.gem_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gem_reg_updated_at
    BEFORE UPDATE ON registration.gem_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- registration.gem_bid
-- GEM bid/tender tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.gem_bid (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    gem_registration_id UUID NOT NULL REFERENCES registration.gem_registration (id),
    bid_number          VARCHAR(100) NOT NULL,
    bid_type            VARCHAR(30) NOT NULL
                            CHECK (bid_type IN ('DIRECT_PURCHASE','L1_BID','RA','CUSTOM_BID','BOQ')),
    tender_id           VARCHAR(100),                                  -- GEM tender reference
    item_description    TEXT NOT NULL,
    quantity            NUMERIC(18,4),
    unit                VARCHAR(20),
    quoted_price        NUMERIC(18,2) NOT NULL,
    total_value         NUMERIC(18,2) NOT NULL,
    bid_submission_date TIMESTAMPTZ NOT NULL,
    bid_end_date        TIMESTAMPTZ,
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','SUBMITTED','UNDER_EVALUATION','AWARDED',
                                'REJECTED','CANCELLED','EXPIRED','ORDER_PLACED'
                            )),
    order_id            VARCHAR(100),                                  -- GEM order ID if awarded
    order_value         NUMERIC(18,2),
    delivery_date       TIMESTAMPTZ,
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_gem_bid_org_id ON registration.gem_bid (organization_id);
CREATE INDEX idx_gem_bid_reg_id ON registration.gem_bid (gem_registration_id);
CREATE INDEX idx_gem_bid_status ON registration.gem_bid (status);
CREATE INDEX idx_gem_bid_submission ON registration.gem_bid (bid_submission_date);

ALTER TABLE registration.gem_bid ENABLE ROW LEVEL SECURITY;
CREATE POLICY gem_bid_org_isolation ON registration.gem_bid FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_gem_bid_updated_at
    BEFORE UPDATE ON registration.gem_bid
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 11. LEGAL & COMPLIANCE (compliance schema)
-- #############################################################################

-- =============================================================================
-- compliance.legal_case
-- Legal case tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.legal_case (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    case_number         VARCHAR(100) NOT NULL,
    case_type           VARCHAR(40) NOT NULL
                            CHECK (case_type IN (
                                'CIVIL','CRIMINAL','CONSUMER','LABOUR','ARBITRATION',
                                'NCLT','NCLAT','DEBT_RECOVERY','CHEQUE_BOUNCE','OTHER'
                            )),
    court               VARCHAR(300) NOT NULL,                         -- court/tribunal name
    jurisdiction        VARCHAR(200),
    filing_date         TIMESTAMPTZ,
    parties_petitioner  TEXT,                                           -- petitioner/plaintiff names
    parties_respondent  TEXT,                                           -- respondent/defendant names
    subject_matter      TEXT NOT NULL,
    claim_amount        NUMERIC(18,2),
    status              VARCHAR(30) NOT NULL DEFAULT 'FILED'
                            CHECK (status IN (
                                'FILED','NOTICE_ISSUED','HEARING','ARGUMENTS',
                                'RESERVED','DECIDED','APPEALED','SETTLED',
                                'WITHDRAWN','DISMISSED','CLOSED'
                            )),
    next_hearing_date   TIMESTAMPTZ,
    last_order_summary  TEXT,
    counsel_name        VARCHAR(300),
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_legal_case_org_id ON compliance.legal_case (organization_id);
CREATE INDEX idx_legal_case_user_id ON compliance.legal_case (user_id);
CREATE INDEX idx_legal_case_type ON compliance.legal_case (case_type);
CREATE INDEX idx_legal_case_status ON compliance.legal_case (status);
CREATE INDEX idx_legal_case_hearing ON compliance.legal_case (next_hearing_date) WHERE next_hearing_date IS NOT NULL;
CREATE INDEX idx_legal_case_number ON compliance.legal_case (case_number);

ALTER TABLE compliance.legal_case ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_case_org_isolation ON compliance.legal_case FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_legal_case_updated_at
    BEFORE UPDATE ON compliance.legal_case
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- compliance.compliance_notice
-- Generic compliance notice tracker (IT/GST/ROC/Labour/etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.compliance_notice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    notice_type         VARCHAR(40) NOT NULL
                            CHECK (notice_type IN (
                                'INCOME_TAX','GST','ROC','LABOUR','PF','ESI',
                                'CUSTOMS','FEMA','SEBI','OTHER'
                            )),
    notice_number       VARCHAR(100),
    din_number          VARCHAR(50),                                   -- Document Identification Number
    section_reference   VARCHAR(100),                                  -- e.g. 'Section 143(1)', 'Section 73'
    issuing_authority   VARCHAR(300),
    issue_date          TIMESTAMPTZ NOT NULL,
    receipt_date        TIMESTAMPTZ,
    response_due_date   TIMESTAMPTZ,
    demand_amount       NUMERIC(18,2),
    subject             TEXT NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
                            CHECK (status IN (
                                'RECEIVED','UNDER_REVIEW','RESPONSE_DRAFTED',
                                'RESPONSE_FILED','HEARING_SCHEDULED','RESOLVED',
                                'ESCALATED','CLOSED'
                            )),
    response_date       TIMESTAMPTZ,
    outcome             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_comp_notice_org_id ON compliance.compliance_notice (organization_id);
CREATE INDEX idx_comp_notice_user_id ON compliance.compliance_notice (user_id);
CREATE INDEX idx_comp_notice_type ON compliance.compliance_notice (notice_type);
CREATE INDEX idx_comp_notice_status ON compliance.compliance_notice (status);
CREATE INDEX idx_comp_notice_due ON compliance.compliance_notice (response_due_date) WHERE response_due_date IS NOT NULL;

ALTER TABLE compliance.compliance_notice ENABLE ROW LEVEL SECURITY;
CREATE POLICY comp_notice_org_isolation ON compliance.compliance_notice FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_comp_notice_updated_at
    BEFORE UPDATE ON compliance.compliance_notice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 12. NGO & TRUST COMPLIANCE (compliance schema)
-- #############################################################################

-- =============================================================================
-- compliance.ngo_registration
-- 12A/80G/FCRA registration tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.ngo_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    registration_type   VARCHAR(30) NOT NULL
                            CHECK (registration_type IN (
                                '12A','80G','FCRA','DARPAN','CSR_1','NITI_AAYOG','OTHER'
                            )),
    registration_number VARCHAR(100),
    entity_name         VARCHAR(500) NOT NULL,
    entity_type         VARCHAR(30) CHECK (entity_type IN ('TRUST','SOCIETY','SECTION_8','OTHER')),
    validity_from       DATE,
    validity_to         DATE,
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','APPLIED','UNDER_REVIEW','APPROVED',
                                'REJECTED','EXPIRED','RENEWAL_PENDING','CANCELLED'
                            )),
    approval_order_number VARCHAR(100),
    is_provisional      BOOLEAN NOT NULL DEFAULT TRUE,                 -- provisional vs final registration
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ngo_reg_org_id ON compliance.ngo_registration (organization_id);
CREATE INDEX idx_ngo_reg_user_id ON compliance.ngo_registration (user_id);
CREATE INDEX idx_ngo_reg_type ON compliance.ngo_registration (registration_type);
CREATE INDEX idx_ngo_reg_status ON compliance.ngo_registration (status);
CREATE INDEX idx_ngo_reg_validity ON compliance.ngo_registration (validity_to) WHERE validity_to IS NOT NULL;

ALTER TABLE compliance.ngo_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY ngo_reg_org_isolation ON compliance.ngo_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_ngo_reg_updated_at
    BEFORE UPDATE ON compliance.ngo_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- compliance.ngo_return
-- Annual returns for NGOs/Trusts (ITR-7, FCRA returns, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.ngo_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    ngo_registration_id UUID REFERENCES compliance.ngo_registration (id),
    return_type         VARCHAR(30) NOT NULL
                            CHECK (return_type IN (
                                'ITR_7','FCRA_ANNUAL','FORM_10','FORM_10B','FORM_10BB',
                                'FORM_9A','DARPAN_UPDATE','CSR_ANNUAL','OTHER'
                            )),
    financial_year      VARCHAR(10) NOT NULL,
    due_date            TIMESTAMPTZ NOT NULL,
    filing_date         TIMESTAMPTZ,
    acknowledgement_number VARCHAR(50),
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','IN_PROGRESS','FILED','LATE_FILED','OVERDUE','NOT_APPLICABLE'
                            )),
    total_income        NUMERIC(18,2),
    total_expenditure   NUMERIC(18,2),
    corpus_fund         NUMERIC(18,2),
    foreign_contribution NUMERIC(18,2),                                -- for FCRA returns
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ngo_return_org_id ON compliance.ngo_return (organization_id);
CREATE INDEX idx_ngo_return_reg_id ON compliance.ngo_return (ngo_registration_id) WHERE ngo_registration_id IS NOT NULL;
CREATE INDEX idx_ngo_return_type ON compliance.ngo_return (return_type);
CREATE INDEX idx_ngo_return_fy ON compliance.ngo_return (financial_year);
CREATE INDEX idx_ngo_return_status ON compliance.ngo_return (status);
CREATE INDEX idx_ngo_return_due ON compliance.ngo_return (due_date);

ALTER TABLE compliance.ngo_return ENABLE ROW LEVEL SECURITY;
CREATE POLICY ngo_return_org_isolation ON compliance.ngo_return FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_ngo_return_updated_at
    BEFORE UPDATE ON compliance.ngo_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 13. STARTUP & MSME (registration schema)
-- #############################################################################

-- =============================================================================
-- registration.startup_registration
-- DPIIT recognition, Startup India
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.startup_registration (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    entity_name         VARCHAR(500) NOT NULL,
    dpiit_number        VARCHAR(50),                                   -- DPIIT recognition number
    recognition_date    DATE,
    incorporation_date  DATE,
    sector              VARCHAR(200),                                  -- industry sector
    sub_sector          VARCHAR(200),
    entity_type         VARCHAR(30) CHECK (entity_type IN ('PRIVATE_LIMITED','LLP','PARTNERSHIP','SOLE_PROPRIETORSHIP','OTHER')),
    cin_llpin           VARCHAR(50),
    status              VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN (
                                'INITIATED','APPLIED','UNDER_REVIEW','RECOGNIZED',
                                'REJECTED','EXPIRED','DEREGISTERED'
                            )),
    is_tax_exempt       BOOLEAN NOT NULL DEFAULT FALSE,                -- Section 80-IAC
    tax_exemption_from  DATE,
    tax_exemption_to    DATE,
    funding_stage       VARCHAR(30) CHECK (funding_stage IN ('IDEATION','VALIDATION','EARLY_TRACTION','SCALING','OTHER')),
    annual_turnover     NUMERIC(18,2),
    remarks             TEXT,
    assigned_to         UUID REFERENCES auth."user" (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_startup_reg_org_id ON registration.startup_registration (organization_id);
CREATE INDEX idx_startup_reg_user_id ON registration.startup_registration (user_id);
CREATE INDEX idx_startup_reg_dpiit ON registration.startup_registration (dpiit_number) WHERE dpiit_number IS NOT NULL;
CREATE INDEX idx_startup_reg_status ON registration.startup_registration (status);
CREATE INDEX idx_startup_reg_sector ON registration.startup_registration (sector) WHERE sector IS NOT NULL;

ALTER TABLE registration.startup_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY startup_reg_org_isolation ON registration.startup_registration FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_startup_reg_updated_at
    BEFORE UPDATE ON registration.startup_registration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- registration.msme_udyam
-- Udyam registration (MSME)
-- =============================================================================
CREATE TABLE IF NOT EXISTS registration.msme_udyam (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    entity_name         VARCHAR(500) NOT NULL,
    udyam_number        VARCHAR(30),                                   -- e.g. UDYAM-XX-00-0000000
    enterprise_type     VARCHAR(10) NOT NULL
                            CHECK (enterprise_type IN ('MICRO','SMALL','MEDIUM')),
    classification      VARCHAR(30) NOT NULL DEFAULT 'MANUFACTURING'
                            CHECK (classification IN ('MANUFACTURING','SERVICE','BOTH')),
    nic_code            VARCHAR(10),                                   -- National Industrial Classification code
    date_of_incorporation DATE,
    date_of_registration DATE,
    investment_in_plant NUMERIC(18,2),                                 -- investment in plant & machinery
    annual_turnover     NUMERIC(18,2),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED','PENDING','UPGRADED','DOWNGRADED')),
    pan_number          VARCHAR(10) CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    gstin               VARCHAR(15) CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$'),
    district            VARCHAR(200),
    state               VARCHAR(100),
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_msme_udyam_org_id ON registration.msme_udyam (organization_id);
CREATE INDEX idx_msme_udyam_user_id ON registration.msme_udyam (user_id);
CREATE INDEX idx_msme_udyam_number ON registration.msme_udyam (udyam_number) WHERE udyam_number IS NOT NULL;
CREATE INDEX idx_msme_udyam_type ON registration.msme_udyam (enterprise_type);
CREATE INDEX idx_msme_udyam_status ON registration.msme_udyam (status);

ALTER TABLE registration.msme_udyam ENABLE ROW LEVEL SECURITY;
CREATE POLICY msme_udyam_org_isolation ON registration.msme_udyam FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_msme_udyam_updated_at
    BEFORE UPDATE ON registration.msme_udyam
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- #############################################################################
-- 14. CERTIFICATION (compliance schema)
-- #############################################################################

-- =============================================================================
-- compliance.certification
-- Generic certification issuance by CA firm
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance.certification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES auth.organization (id),
    user_id             UUID NOT NULL REFERENCES auth."user" (id),
    cert_type           VARCHAR(40) NOT NULL
                            CHECK (cert_type IN (
                                'NET_WORTH','TURNOVER','CHARTERED_ENGINEER','STOCK_AUDIT',
                                'BANK_AUDIT','INSURANCE_SURVEY','CAPITAL_CONTRIBUTION',
                                'IMPORT_EXPORT','DSC_ATTESTATION','PROJECT_COMPLETION',
                                'FUND_UTILIZATION','INCOME_CERTIFICATE','OTHER'
                            )),
    certificate_number  VARCHAR(100),
    title               VARCHAR(500) NOT NULL,
    issued_to_name      VARCHAR(300) NOT NULL,
    issued_to_pan       VARCHAR(10) CHECK (issued_to_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    issued_date         TIMESTAMPTZ NOT NULL,
    valid_until         TIMESTAMPTZ,
    purpose             TEXT,
    certified_amount    NUMERIC(18,2),                                 -- e.g. net worth amount, turnover
    financial_year      VARCHAR(10),
    udin                VARCHAR(50),                                   -- Unique Document Identification Number
    storage_path        TEXT,                                          -- generated certificate GCS path
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','ISSUED','REVOKED','EXPIRED','ARCHIVED')),
    revoked_at          TIMESTAMPTZ,
    revocation_reason   TEXT,
    issued_by           UUID REFERENCES auth."user" (id),              -- certifying CA
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_cert_org_id ON compliance.certification (organization_id);
CREATE INDEX idx_cert_user_id ON compliance.certification (user_id);
CREATE INDEX idx_cert_type ON compliance.certification (cert_type);
CREATE INDEX idx_cert_status ON compliance.certification (status);
CREATE INDEX idx_cert_issued_date ON compliance.certification (issued_date);
CREATE INDEX idx_cert_udin ON compliance.certification (udin) WHERE udin IS NOT NULL;

ALTER TABLE compliance.certification ENABLE ROW LEVEL SECURITY;
CREATE POLICY cert_org_isolation ON compliance.certification FOR ALL USING (
    organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', true)::uuid AND om.is_active = true
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', true)::uuid
    )
);

CREATE TRIGGER trg_cert_updated_at
    BEFORE UPDATE ON compliance.certification
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();


-- =============================================================================
-- GRANT USAGE on new schemas to application role (if exists)
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snapaccount_app') THEN
        GRANT USAGE ON SCHEMA registration TO snapaccount_app;
        GRANT USAGE ON SCHEMA compliance TO snapaccount_app;
        GRANT USAGE ON SCHEMA payroll TO snapaccount_app;
        GRANT USAGE ON SCHEMA advisory TO snapaccount_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA registration TO snapaccount_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA compliance TO snapaccount_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA payroll TO snapaccount_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA advisory TO snapaccount_app;
    END IF;
END $$;

COMMIT;
