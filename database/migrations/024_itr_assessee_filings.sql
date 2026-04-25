-- =============================================================================
-- 024_itr_assessee_filings.sql
-- Phase 6D — ITR Engine (additive)
-- Adds per-AY assessee profile snapshots, the canonical filings table, and
-- a Form 16 extraction record table.
-- Depends on: 000_init.sql, 002_document_schema.sql, 006_itr_schema.sql,
--             023_itr_tax_slabs_deductions.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- itr.assessee_profiles
-- Snapshot of a user's tax-relevant profile per AY.
--
-- IMPORTANT — PAN encryption (SEC-013):
--   The `pan` column stores AES-256-CBC ciphertext produced by the application
--   layer (IPanEncryptionService). It is intentionally typed `TEXT` (not
--   varchar(10)) to leave headroom for ciphertext + IV + base64 envelope.
--   Never store plaintext PAN in this column.
--   Per-AY versioning: a user's profile may differ across AYs (e.g. residency,
--   employment, deductions). Insert a new row per (user_id, ay).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.assessee_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL,
    ay                      TEXT NOT NULL,                       -- e.g. 'AY2025-26'
    pan                     TEXT,                                 -- AES-256-CBC ciphertext (app-layer); plaintext NEVER stored
    pan_last4               VARCHAR(4),                           -- Convenience for UI lookup; first 4 of last 4 chars masked client-side as needed
    dob                     DATE,                                 -- Used by engine to determine senior/super-senior basic exemption
    gender                  VARCHAR(10),
    residential_status      VARCHAR(40) NOT NULL DEFAULT 'RESIDENT'
                                CHECK (residential_status IN ('RESIDENT','RNOR','NON_RESIDENT')),
    occupation              VARCHAR(100),                         -- 'SALARIED','BUSINESS','PROFESSIONAL','PENSIONER', etc.
    salary_details_jsonb    JSONB,                                -- employer name, gross salary, hra, lta, employer NPS, etc.
    business_details_jsonb  JSONB,                                -- gross receipts, net profit, presumptive (44AD/44ADA) flags, GSTIN
    house_property_jsonb    JSONB,                                -- self-occupied / let-out, rental income, interest paid
    capital_gains_jsonb     JSONB,                                -- STCG/LTCG buckets
    other_income_jsonb      JSONB,                                -- interest, dividend, etc.
    deductions_jsonb        JSONB,                                -- claimed amounts keyed by section
    bank_account_for_refund_jsonb JSONB,                          -- masked account no, ifsc, holder name
    address_jsonb           JSONB,
    is_disability_claim     BOOLEAN NOT NULL DEFAULT FALSE,
    consent_given_at        TIMESTAMPTZ,
    consent_withdrawn_at    TIMESTAMPTZ,
    retention_until         DATE,                                 -- Min 7yr from AY end for IT records
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT uq_assessee_profiles_user_ay UNIQUE (user_id, ay)
);

CREATE INDEX IF NOT EXISTS idx_assessee_profiles_user_id   ON itr.assessee_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_assessee_profiles_ay        ON itr.assessee_profiles (ay);
CREATE INDEX IF NOT EXISTS idx_assessee_profiles_user_ay   ON itr.assessee_profiles (user_id, ay);
CREATE INDEX IF NOT EXISTS idx_assessee_profiles_pan_last4 ON itr.assessee_profiles (pan_last4) WHERE pan_last4 IS NOT NULL;

ALTER TABLE itr.assessee_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessee_profiles_user_isolation ON itr.assessee_profiles;
CREATE POLICY assessee_profiles_user_isolation ON itr.assessee_profiles
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

DROP TRIGGER IF EXISTS trg_assessee_profiles_updated_at ON itr.assessee_profiles;
CREATE TRIGGER trg_assessee_profiles_updated_at
    BEFORE UPDATE ON itr.assessee_profiles
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON COLUMN itr.assessee_profiles.pan IS
    'AES-256-CBC ciphertext (IPanEncryptionService). NEVER plaintext. Type TEXT to fit ciphertext+IV envelope.';

-- -----------------------------------------------------------------------------
-- itr.filings
-- Canonical filing record per (user_id, ay). The legacy itr.itr_return is kept
-- intact for historical compatibility; new code paths target itr.filings.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.filings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    assessee_profile_id UUID REFERENCES itr.assessee_profiles (id),
    ay                  TEXT NOT NULL,                            -- 'AY2025-26'
    itr_form            VARCHAR(10) NOT NULL CHECK (itr_form IN ('ITR-1','ITR-2','ITR-3','ITR-4','ITR-5','ITR-6','ITR-7')),
    regime_chosen       VARCHAR(10) NOT NULL CHECK (regime_chosen IN ('OLD','NEW')),
    tax_slab_version_id UUID REFERENCES itr.tax_slab_versions (id),  -- pinned slab version for audit/replay

    -- Computed totals (snapshot at compute time)
    gross_total_income  NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_income        NUMERIC(20,2) NOT NULL DEFAULT 0,           -- taxable income
    total_tax           NUMERIC(20,2) NOT NULL DEFAULT 0,           -- after rebate + surcharge + cess
    tax_paid            NUMERIC(20,2) NOT NULL DEFAULT 0,           -- TDS + advance + SAT
    refund_due          NUMERIC(20,2) NOT NULL DEFAULT 0,
    payable             NUMERIC(20,2) NOT NULL DEFAULT 0,

    -- Computation breakdown reference (full JSONB snapshot for audit/replay)
    computation_jsonb   JSONB,

    status              VARCHAR(40) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN (
                                'DRAFT',
                                'UNDER_CA_REVIEW',
                                'CA_APPROVED',
                                'CA_REJECTED',
                                'USER_APPROVED',
                                'FILED',
                                'E_VERIFIED',
                                'REFUND_ISSUED',
                                'NOTICE_RECEIVED',
                                'CANCELLED'
                            )),

    -- CA review
    ca_reviewer_id      UUID,
    ca_reviewed_at      TIMESTAMPTZ,
    ca_review_notes     TEXT,

    -- User approval
    user_approved_at    TIMESTAMPTZ,
    user_approval_ip    INET,

    -- Filing
    filed_at            TIMESTAMPTZ,
    filed_by            UUID,
    ack_number          VARCHAR(100),                                -- CPC acknowledgement / e-filing ack
    -- itr_v_uri: short-lived GCS signed URL — DO NOT store long-lived URIs.
    -- App layer regenerates the signed URL on demand (TTL ~ 15 min).
    itr_v_uri           TEXT,
    itr_v_uri_expires_at TIMESTAMPTZ,
    itr_v_object_key    TEXT,                                        -- Underlying GCS object key (stable; signed URL is derived)

    -- E-verification
    e_verified_at       TIMESTAMPTZ,
    e_verification_method VARCHAR(50),

    -- DPDP / retention
    consent_given_at    TIMESTAMPTZ,
    consent_withdrawn_at TIMESTAMPTZ,
    retention_until     DATE,                                        -- Min AY end + 7 yrs

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_filings_user_ay UNIQUE (user_id, ay)
);

CREATE INDEX IF NOT EXISTS idx_filings_user_id        ON itr.filings (user_id);
CREATE INDEX IF NOT EXISTS idx_filings_ay             ON itr.filings (ay);
CREATE INDEX IF NOT EXISTS idx_filings_user_ay        ON itr.filings (user_id, ay);
CREATE INDEX IF NOT EXISTS idx_filings_status         ON itr.filings (status);
CREATE INDEX IF NOT EXISTS idx_filings_ca_reviewer    ON itr.filings (ca_reviewer_id) WHERE ca_reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_filings_ack_number     ON itr.filings (ack_number) WHERE ack_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_filings_filed_at       ON itr.filings (filed_at) WHERE filed_at IS NOT NULL;

ALTER TABLE itr.filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS filings_user_isolation ON itr.filings;
CREATE POLICY filings_user_isolation ON itr.filings
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
        OR ca_reviewer_id = current_setting('app.current_user_id', TRUE)::UUID
    );

DROP TRIGGER IF EXISTS trg_filings_updated_at ON itr.filings;
CREATE TRIGGER trg_filings_updated_at
    BEFORE UPDATE ON itr.filings
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON COLUMN itr.filings.itr_v_uri IS
    'Short-lived GCS signed URL (TTL <= 15 min). App regenerates on demand. Never persist long-lived public URIs.';

-- -----------------------------------------------------------------------------
-- itr.form_16_extracts
-- Form 16 extraction records (parsed JSONB) tied to the document service.
-- DPDP cascade: parsed_json may contain employer TAN/PAN/salary — must be
-- soft-deleted/anonymized when user invokes right-to-erasure.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.form_16_extracts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    filing_id           UUID REFERENCES itr.filings (id) ON DELETE CASCADE,
    document_id         UUID NOT NULL,                              -- FK by value to document.document.id
    ay                  TEXT NOT NULL,                              -- 'AY2025-26'
    employer_name       TEXT,
    employer_tan        VARCHAR(15),                                -- TAN format, plaintext acceptable (employer-level, not personal)
    employee_pan_cipher TEXT,                                        -- AES-256-CBC ciphertext (app-layer)
    gross_salary        NUMERIC(20,2),
    standard_deduction  NUMERIC(20,2),
    professional_tax    NUMERIC(20,2),
    tds_deducted        NUMERIC(20,2),
    parsed_json         JSONB,                                       -- Full extracted payload (Document AI / parser)
    parser_version      VARCHAR(40),
    parse_confidence    NUMERIC(5,2),                                -- 0..100
    parsed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by         UUID,
    verified_at         TIMESTAMPTZ,

    -- DPDP cascade
    anonymized_at       TIMESTAMPTZ,
    anonymization_reason TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_form_16_extracts_user_id     ON itr.form_16_extracts (user_id);
CREATE INDEX IF NOT EXISTS idx_form_16_extracts_filing_id   ON itr.form_16_extracts (filing_id) WHERE filing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_16_extracts_document_id ON itr.form_16_extracts (document_id);
CREATE INDEX IF NOT EXISTS idx_form_16_extracts_ay          ON itr.form_16_extracts (ay);
CREATE INDEX IF NOT EXISTS idx_form_16_extracts_tan         ON itr.form_16_extracts (employer_tan) WHERE employer_tan IS NOT NULL;

ALTER TABLE itr.form_16_extracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_16_extracts_user_isolation ON itr.form_16_extracts;
CREATE POLICY form_16_extracts_user_isolation ON itr.form_16_extracts
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

DROP TRIGGER IF EXISTS trg_form_16_extracts_updated_at ON itr.form_16_extracts;
CREATE TRIGGER trg_form_16_extracts_updated_at
    BEFORE UPDATE ON itr.form_16_extracts
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.form_16_extracts IS
    'Parsed Form 16 payload. parsed_json contains employer TAN/PAN/salary — DPDP cascade required on user erasure.';

-- =============================================================================
-- End 024_itr_assessee_filings.sql
-- =============================================================================
