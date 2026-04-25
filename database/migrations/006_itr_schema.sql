-- =============================================================================
-- 006_itr_schema.sql
-- ITR Service — Tax Computation, Filing, TDS, E-Verification, Notices
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS itr;

-- =============================================================================
-- itr.tax_regime
-- Reference: OLD_REGIME / NEW_REGIME
-- =============================================================================
CREATE TABLE itr.tax_regime (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(30) NOT NULL UNIQUE,     -- 'OLD_REGIME', 'NEW_REGIME'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_tax_regime_code ON itr.tax_regime (code);

CREATE TRIGGER trg_tax_regime_updated_at
    BEFORE UPDATE ON itr.tax_regime
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.tax_slab  (TEMPORAL TABLE — valid_from / valid_to)
-- Tax slabs change annually with each Union Budget.
-- =============================================================================
CREATE TABLE itr.tax_slab (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_regime_id   UUID NOT NULL REFERENCES itr.tax_regime (id),
    financial_year  VARCHAR(10) NOT NULL,             -- e.g. '2024-25'
    slab_order      SMALLINT NOT NULL,                -- Ordering of slab (1, 2, 3...)
    income_from     NUMERIC(20,2) NOT NULL,
    income_to       NUMERIC(20,2),                    -- NULL = no upper limit (top slab)
    tax_rate_pct    NUMERIC(5,2) NOT NULL,
    surcharge_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    cess_pct        NUMERIC(5,2) NOT NULL DEFAULT 4,  -- Health & Education Cess
    rebate_u87a     NUMERIC(20,2) NOT NULL DEFAULT 0, -- Section 87A rebate limit
    valid_from      DATE NOT NULL,
    valid_to        DATE,                             -- NULL = currently active
    notes           TEXT,                             -- e.g. 'FY 2024-25 New Regime post-Budget 2024'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    CONSTRAINT chk_tax_slab_valid_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX idx_tax_slab_regime_id ON itr.tax_slab (tax_regime_id);
CREATE INDEX idx_tax_slab_fy ON itr.tax_slab (financial_year);
CREATE INDEX idx_tax_slab_valid_from ON itr.tax_slab (valid_from);

CREATE TRIGGER trg_tax_slab_updated_at
    BEFORE UPDATE ON itr.tax_slab
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_return
-- Core ITR filing record per user per financial year
-- =============================================================================
CREATE TABLE itr.itr_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    financial_year      VARCHAR(10) NOT NULL,
    assessment_year     VARCHAR(10) NOT NULL,         -- FY+1, e.g. '2025-26'
    itr_form_type       VARCHAR(20),                  -- ITR-1, ITR-2, ITR-4, etc.
    tax_regime_id       UUID REFERENCES itr.tax_regime (id),
    status              VARCHAR(60) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT','PENDING_APPROVAL','USER_APPROVED',
                                'FILING_IN_PROGRESS','FILED','E_VERIFIED','COMPLETED',
                                'DEFECTIVE','REVISED'
                            )),
    -- Income heads
    salary_income       NUMERIC(20,2) NOT NULL DEFAULT 0,
    house_property_income NUMERIC(20,2) NOT NULL DEFAULT 0,
    capital_gains_income NUMERIC(20,2) NOT NULL DEFAULT 0,
    other_income        NUMERIC(20,2) NOT NULL DEFAULT 0,
    gross_total_income  NUMERIC(20,2),
    total_deductions    NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_taxable_income NUMERIC(20,2),
    tax_liability       NUMERIC(20,2),
    tds_deducted        NUMERIC(20,2) NOT NULL DEFAULT 0,
    advance_tax_paid    NUMERIC(20,2) NOT NULL DEFAULT 0,
    self_assessment_tax NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_tax_payable     NUMERIC(20,2),               -- Positive = payable, negative = refund
    refund_amount       NUMERIC(20,2),
    -- Filing
    acknowledgement_number VARCHAR(100),
    filed_at            TIMESTAMPTZ,
    filed_by            UUID,
    e_verified_at       TIMESTAMPTZ,
    e_verification_method VARCHAR(50),
    -- Approval
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (user_id, financial_year)
);

CREATE INDEX idx_itr_return_user_id ON itr.itr_return (user_id);
CREATE INDEX idx_itr_return_fy ON itr.itr_return (financial_year);
CREATE INDEX idx_itr_return_status ON itr.itr_return (status);
CREATE INDEX idx_itr_return_ack ON itr.itr_return (acknowledgement_number) WHERE acknowledgement_number IS NOT NULL;

ALTER TABLE itr.itr_return ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_return_updated_at
    BEFORE UPDATE ON itr.itr_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_document
-- Documents associated with an ITR return (Form 16, 26AS, etc.)
-- =============================================================================
CREATE TABLE itr.itr_document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itr_return_id   UUID NOT NULL REFERENCES itr.itr_return (id) ON DELETE CASCADE,
    document_type   VARCHAR(100) NOT NULL,
                    -- FORM_16A, FORM_16B, FORM_16A_TDS, FORM_26AS, AIS, DEDUCTION_PROOF_80C, etc.
    document_id     UUID,                            -- document.document.id
    file_name       VARCHAR(500),
    status          VARCHAR(50) NOT NULL DEFAULT 'UPLOADED'
                        CHECK (status IN ('UPLOADED','VERIFIED','REJECTED','PENDING')),
    verified_by     UUID,
    verified_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    financial_year  VARCHAR(10),
    employer_name   VARCHAR(500),
    pan_match       BOOLEAN,
    name_match      BOOLEAN,
    amount_verified BOOLEAN,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_itr_document_return_id ON itr.itr_document (itr_return_id);
CREATE INDEX idx_itr_document_type ON itr.itr_document (document_type);
CREATE INDEX idx_itr_document_status ON itr.itr_document (status);

ALTER TABLE itr.itr_document ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_document_updated_at
    BEFORE UPDATE ON itr.itr_document
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_checklist
-- AI-generated personalized checklist per ITR return
-- =============================================================================
CREATE TABLE itr.itr_checklist (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itr_return_id   UUID NOT NULL REFERENCES itr.itr_return (id) ON DELETE CASCADE,
    generated_by    VARCHAR(30) NOT NULL DEFAULT 'AI' CHECK (generated_by IN ('AI','MANUAL','SYSTEM')),
    is_finalized    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (itr_return_id)
);

CREATE INDEX idx_itr_checklist_return_id ON itr.itr_checklist (itr_return_id);

ALTER TABLE itr.itr_checklist ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_checklist_updated_at
    BEFORE UPDATE ON itr.itr_checklist
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_checklist_item
-- Individual items in the ITR checklist
-- =============================================================================
CREATE TABLE itr.itr_checklist_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id    UUID NOT NULL REFERENCES itr.itr_checklist (id) ON DELETE CASCADE,
    item_code       VARCHAR(100) NOT NULL,
    item_name       VARCHAR(500) NOT NULL,
    description     TEXT,
    is_mandatory    BOOLEAN NOT NULL DEFAULT FALSE,
    is_applicable   BOOLEAN NOT NULL DEFAULT TRUE,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','UPLOADED','VERIFIED','NOT_APPLICABLE','WAIVED')),
    itr_document_id UUID REFERENCES itr.itr_document (id),
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_itr_checklist_item_checklist_id ON itr.itr_checklist_item (checklist_id);
CREATE INDEX idx_itr_checklist_item_status ON itr.itr_checklist_item (status);

CREATE TRIGGER trg_itr_checklist_item_updated_at
    BEFORE UPDATE ON itr.itr_checklist_item
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.tax_computation
-- Detailed tax computation breakdown for both regimes
-- =============================================================================
CREATE TABLE itr.tax_computation (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itr_return_id               UUID NOT NULL REFERENCES itr.itr_return (id) ON DELETE CASCADE,
    tax_regime_id               UUID NOT NULL REFERENCES itr.tax_regime (id),
    -- Income breakdown
    gross_salary                NUMERIC(20,2) NOT NULL DEFAULT 0,
    standard_deduction          NUMERIC(20,2) NOT NULL DEFAULT 0,
    house_rent_allowance        NUMERIC(20,2) NOT NULL DEFAULT 0,
    leave_travel_allowance      NUMERIC(20,2) NOT NULL DEFAULT 0,
    other_allowances            NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_salary                  NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Chapter VI-A deductions (Old Regime only)
    deduction_80c               NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_80d               NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_80e               NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_80g               NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_nps_80ccd         NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_hra               NUMERIC(20,2) NOT NULL DEFAULT 0,
    deduction_home_loan         NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_deductions            NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Taxable income
    taxable_income              NUMERIC(20,2) NOT NULL DEFAULT 0,
    tax_before_rebate           NUMERIC(20,2) NOT NULL DEFAULT 0,
    rebate_87a                  NUMERIC(20,2) NOT NULL DEFAULT 0,
    tax_after_rebate            NUMERIC(20,2) NOT NULL DEFAULT 0,
    surcharge                   NUMERIC(20,2) NOT NULL DEFAULT 0,
    cess                        NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_tax_liability         NUMERIC(20,2) NOT NULL DEFAULT 0,
    -- Credits
    tds_deducted                NUMERIC(20,2) NOT NULL DEFAULT 0,
    advance_tax                 NUMERIC(20,2) NOT NULL DEFAULT 0,
    self_assessment_tax         NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_payable_or_refund       NUMERIC(20,2) NOT NULL DEFAULT 0,
    is_recommended              BOOLEAN NOT NULL DEFAULT FALSE,  -- AI/engine recommendation
    recommendation_reason       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX idx_tax_computation_return_id ON itr.tax_computation (itr_return_id);
CREATE INDEX idx_tax_computation_regime_id ON itr.tax_computation (tax_regime_id);

ALTER TABLE itr.tax_computation ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tax_computation_updated_at
    BEFORE UPDATE ON itr.tax_computation
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.e_verification
-- E-verification records for filed ITR
-- =============================================================================
CREATE TABLE itr.e_verification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itr_return_id       UUID NOT NULL REFERENCES itr.itr_return (id) ON DELETE CASCADE,
    method              VARCHAR(50) NOT NULL
                            CHECK (method IN (
                                'AADHAAR_OTP','NET_BANKING','BANK_EVC',
                                'DEMAT_EVC','DIGITAL_SIGNATURE'
                            )),
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
    initiated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    transaction_id      VARCHAR(200),
    acknowledgement     VARCHAR(200),
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_e_verification_return_id ON itr.e_verification (itr_return_id);
CREATE INDEX idx_e_verification_status ON itr.e_verification (status);

ALTER TABLE itr.e_verification ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_e_verification_updated_at
    BEFORE UPDATE ON itr.e_verification
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_callback
-- Human-touch callbacks for ITR (6 trigger types)
-- =============================================================================
CREATE TABLE itr.itr_callback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    itr_return_id       UUID REFERENCES itr.itr_return (id),
    trigger_type        VARCHAR(100) NOT NULL
                            CHECK (trigger_type IN (
                                'MISSING_DOCS','REJECTED_DOCS','CLARIFICATION',
                                'MULTIPLE_EMPLOYERS','COMPLEX_SITUATION','USER_REQUESTED'
                            )),
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','ASSIGNED','IN_PROGRESS',
                                'COMPLETED','MISSED','CANCELLED'
                            )),
    assigned_to         UUID,
    priority            VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                            CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    scheduled_at        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    duration_minutes    SMALLINT,
    fcr_achieved        BOOLEAN,
    satisfaction_rating NUMERIC(3,2),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_itr_callback_user_id ON itr.itr_callback (user_id);
CREATE INDEX idx_itr_callback_return_id ON itr.itr_callback (itr_return_id) WHERE itr_return_id IS NOT NULL;
CREATE INDEX idx_itr_callback_status ON itr.itr_callback (status);
CREATE INDEX idx_itr_callback_assigned_to ON itr.itr_callback (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE itr.itr_callback ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_callback_updated_at
    BEFORE UPDATE ON itr.itr_callback
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_notice
-- Income Tax notices (Section 143(1), 139(9), 143(2), 156)
-- =============================================================================
CREATE TABLE itr.itr_notice (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    itr_return_id       UUID REFERENCES itr.itr_return (id),
    notice_section      VARCHAR(50) NOT NULL,         -- '143(1)', '139(9)', '143(2)', '156'
    notice_type         VARCHAR(100) NOT NULL,
    issued_date         DATE NOT NULL,
    due_date            DATE,
    demand_amount       NUMERIC(20,2),
    description         TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'RECEIVED'
                            CHECK (status IN (
                                'RECEIVED','ACKNOWLEDGED','IN_PROGRESS',
                                'RESPONSE_FILED','RESOLVED','APPEALED'
                            )),
    document_id         UUID,
    response_document_id UUID,
    responded_at        TIMESTAMPTZ,
    responded_by        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_itr_notice_user_id ON itr.itr_notice (user_id);
CREATE INDEX idx_itr_notice_return_id ON itr.itr_notice (itr_return_id) WHERE itr_return_id IS NOT NULL;
CREATE INDEX idx_itr_notice_status ON itr.itr_notice (status);
CREATE INDEX idx_itr_notice_due_date ON itr.itr_notice (due_date) WHERE status NOT IN ('RESOLVED');

ALTER TABLE itr.itr_notice ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_notice_updated_at
    BEFORE UPDATE ON itr.itr_notice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.itr_refund
-- Refund status tracking
-- =============================================================================
CREATE TABLE itr.itr_refund (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    itr_return_id       UUID NOT NULL REFERENCES itr.itr_return (id),
    refund_amount       NUMERIC(20,2) NOT NULL,
    refund_sequence_number VARCHAR(50),
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN (
                                'PENDING','PROCESSING','ISSUED',
                                'CREDITED','FAILED','ADJUSTED'
                            )),
    issued_date         DATE,
    credited_date       DATE,
    bank_account_number VARCHAR(50),                 -- Masked
    ifsc_code           VARCHAR(20),
    failure_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_itr_refund_user_id ON itr.itr_refund (user_id);
CREATE INDEX idx_itr_refund_return_id ON itr.itr_refund (itr_return_id);
CREATE INDEX idx_itr_refund_status ON itr.itr_refund (status);

ALTER TABLE itr.itr_refund ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_itr_refund_updated_at
    BEFORE UPDATE ON itr.itr_refund
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.tds_entry
-- TDS entries (deducted by employer/deductor)
-- =============================================================================
CREATE TABLE itr.tds_entry (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    itr_return_id       UUID REFERENCES itr.itr_return (id),
    deductor_name       VARCHAR(500) NOT NULL,
    deductor_tan        VARCHAR(15),
    deductor_pan        VARCHAR(10),
    tds_section         VARCHAR(20) NOT NULL,         -- 192, 194A, 194C, etc.
    tds_amount          NUMERIC(20,2) NOT NULL,
    income_amount       NUMERIC(20,2) NOT NULL,
    financial_year      VARCHAR(10) NOT NULL,
    quarter             VARCHAR(5),                   -- Q1, Q2, Q3, Q4
    certificate_number  VARCHAR(100),
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_against    VARCHAR(20) CHECK (verified_against IN ('FORM_26AS','AIS','MANUAL')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_tds_entry_user_id ON itr.tds_entry (user_id);
CREATE INDEX idx_tds_entry_return_id ON itr.tds_entry (itr_return_id) WHERE itr_return_id IS NOT NULL;
CREATE INDEX idx_tds_entry_fy ON itr.tds_entry (financial_year);

ALTER TABLE itr.tds_entry ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tds_entry_updated_at
    BEFORE UPDATE ON itr.tds_entry
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- itr.tds_return
-- TDS returns filed (24Q, 26Q, 27Q) — for businesses deducting TDS
-- =============================================================================
CREATE TABLE itr.tds_return (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    return_form         VARCHAR(10) NOT NULL CHECK (return_form IN ('24Q','26Q','27Q','27EQ')),
    financial_year      VARCHAR(10) NOT NULL,
    quarter             VARCHAR(5) NOT NULL,
    tan_number          VARCHAR(15) NOT NULL,
    total_tds_deducted  NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_tds_deposited NUMERIC(20,2) NOT NULL DEFAULT 0,
    status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','FILED','REVISED','CANCELLED')),
    acknowledgement_number VARCHAR(100),
    filed_at            TIMESTAMPTZ,
    filing_deadline     DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, return_form, financial_year, quarter)
);

CREATE INDEX idx_tds_return_org_id ON itr.tds_return (organization_id);
CREATE INDEX idx_tds_return_fy_quarter ON itr.tds_return (financial_year, quarter);
CREATE INDEX idx_tds_return_status ON itr.tds_return (status);

ALTER TABLE itr.tds_return ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tds_return_updated_at
    BEFORE UPDATE ON itr.tds_return
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY itr_return_user_isolation ON itr.itr_return
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY itr_document_isolation ON itr.itr_document
    USING (itr_return_id IN (
        SELECT id FROM itr.itr_return
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY itr_checklist_isolation ON itr.itr_checklist
    USING (itr_return_id IN (
        SELECT id FROM itr.itr_return
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY tax_computation_isolation ON itr.tax_computation
    USING (itr_return_id IN (
        SELECT id FROM itr.itr_return
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY e_verification_isolation ON itr.e_verification
    USING (itr_return_id IN (
        SELECT id FROM itr.itr_return
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY itr_callback_user_isolation ON itr.itr_callback
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY itr_notice_user_isolation ON itr.itr_notice
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY itr_refund_user_isolation ON itr.itr_refund
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY tds_entry_user_isolation ON itr.tds_entry
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY tds_return_org_isolation ON itr.tds_return
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
