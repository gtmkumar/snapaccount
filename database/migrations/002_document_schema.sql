-- =============================================================================
-- 002_document_schema.sql
-- Document Service — Document Capture, OCR, Storage, Processing Queue
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS document;

-- =============================================================================
-- document.document_category
-- Reference table for document categories (seeded)
-- =============================================================================
CREATE TABLE document.document_category (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,  -- SALES_BILL, PURCHASE_BILL, EXPENSE_RECEIPT, etc.
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID
);

CREATE INDEX idx_doc_category_code ON document.document_category (code);

CREATE TRIGGER trg_document_category_updated_at
    BEFORE UPDATE ON document.document_category
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.document  (PARTITIONED BY MONTH on uploaded_at)
-- Master document record — each upload is one document (potentially multi-page)
-- Partitioned for 7-year retention management
-- =============================================================================
CREATE TABLE document.document (
    id                  UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,               -- auth.user.id (cross-schema ref by value)
    organization_id     UUID,                        -- auth.organization.id
    category_id         UUID REFERENCES document.document_category (id),
    file_name           VARCHAR(500) NOT NULL,
    original_file_name  VARCHAR(500),
    mime_type           VARCHAR(100) NOT NULL,
    file_size_bytes     BIGINT,
    storage_bucket      VARCHAR(200),
    storage_path        TEXT NOT NULL,               -- GCS object path
    storage_url         TEXT,                        -- Signed URL (refreshed on demand)
    page_count          SMALLINT NOT NULL DEFAULT 1,
    document_date       DATE,                        -- Date on the document (bill date, etc.)
    vendor_name         VARCHAR(500),
    amount              NUMERIC(15,2),
    status              VARCHAR(50) NOT NULL DEFAULT 'UPLOADED'
                            CHECK (status IN (
                                'UPLOADED','OCR_IN_PROGRESS','OCR_COMPLETE',
                                'IN_REVIEW','PROCESSED','REJECTED','ARCHIVED'
                            )),
    is_encrypted        BOOLEAN NOT NULL DEFAULT TRUE,
    encryption_key_id   VARCHAR(200),               -- GCP KMS key reference
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ,
    archived_at         TIMESTAMPTZ,
    retention_until     TIMESTAMPTZ,                 -- 7 years from uploaded_at (set by trigger)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    PRIMARY KEY (id, uploaded_at)
) PARTITION BY RANGE (uploaded_at);

-- Create initial monthly partitions (current month + next 12 months as example)
-- In production, new partitions are created by a scheduled job
CREATE TABLE document.document_2026_01 PARTITION OF document.document
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE document.document_2026_02 PARTITION OF document.document
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE document.document_2026_03 PARTITION OF document.document
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE document.document_2026_04 PARTITION OF document.document
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE document.document_2026_05 PARTITION OF document.document
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE document.document_2026_06 PARTITION OF document.document
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE document.document_2026_07 PARTITION OF document.document
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE document.document_2026_08 PARTITION OF document.document
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE document.document_2026_09 PARTITION OF document.document
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE document.document_2026_10 PARTITION OF document.document
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE document.document_2026_11 PARTITION OF document.document
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE document.document_2026_12 PARTITION OF document.document
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition for overflow (catch-all for future months)
CREATE TABLE document.document_default PARTITION OF document.document DEFAULT;

CREATE INDEX idx_document_user_id ON document.document (user_id, uploaded_at);
CREATE INDEX idx_document_org_id ON document.document (organization_id, uploaded_at) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_document_category_id ON document.document (category_id, uploaded_at);
CREATE INDEX idx_document_status ON document.document (status, uploaded_at);
CREATE INDEX idx_document_document_date ON document.document (document_date) WHERE document_date IS NOT NULL;
CREATE INDEX idx_document_vendor_name ON document.document USING gin (vendor_name gin_trgm_ops) WHERE vendor_name IS NOT NULL;

ALTER TABLE document.document ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-set retention_until = uploaded_at + 7 years
CREATE OR REPLACE FUNCTION document.set_retention_until()
RETURNS TRIGGER AS $$
BEGIN
    NEW.retention_until := NEW.uploaded_at + INTERVAL '7 years';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_document_retention_until
    BEFORE INSERT OR UPDATE ON document.document
    FOR EACH ROW
    EXECUTE FUNCTION document.set_retention_until();

-- =============================================================================
-- document.document_page
-- Individual pages within a multi-page document
-- =============================================================================
CREATE TABLE document.document_page (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL,
    document_at     TIMESTAMPTZ NOT NULL,            -- partition key of parent
    page_number     SMALLINT NOT NULL,
    storage_path    TEXT NOT NULL,
    thumbnail_path  TEXT,
    width_px        INTEGER,
    height_px       INTEGER,
    file_size_bytes BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_document_page_document_id ON document.document_page (document_id);

CREATE TRIGGER trg_document_page_updated_at
    BEFORE UPDATE ON document.document_page
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.ocr_result
-- Top-level OCR result for a document
-- =============================================================================
CREATE TABLE document.ocr_result (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL,
    document_at         TIMESTAMPTZ NOT NULL,
    ocr_provider        VARCHAR(100) NOT NULL DEFAULT 'GOOGLE_DOCUMENT_AI',
    raw_response        JSONB,                       -- Full provider response
    confidence_score    NUMERIC(5,4),                -- 0.0000 – 1.0000
    confidence_level    VARCHAR(10)                  -- GREEN (>0.8), YELLOW (0.5-0.8), RED (<0.5)
                            GENERATED ALWAYS AS (
                                CASE
                                    WHEN confidence_score >= 0.8 THEN 'GREEN'
                                    WHEN confidence_score >= 0.5 THEN 'YELLOW'
                                    ELSE 'RED'
                                END
                            ) STORED,
    processing_time_ms  INTEGER,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ocr_result_document_id ON document.ocr_result (document_id);
CREATE INDEX idx_ocr_result_confidence_level ON document.ocr_result (confidence_level);

CREATE TRIGGER trg_ocr_result_updated_at
    BEFORE UPDATE ON document.ocr_result
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.ocr_field
-- Individual extracted fields from OCR (key-value pairs)
-- =============================================================================
CREATE TABLE document.ocr_field (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ocr_result_id       UUID NOT NULL REFERENCES document.ocr_result (id) ON DELETE CASCADE,
    field_name          VARCHAR(200) NOT NULL,        -- e.g. 'invoice_number', 'total_amount'
    field_value         TEXT,
    confidence_score    NUMERIC(5,4),
    is_overridden       BOOLEAN NOT NULL DEFAULT FALSE,
    overridden_value    TEXT,
    overridden_by       UUID,                        -- admin user who overrode
    overridden_at       TIMESTAMPTZ,
    bounding_box        JSONB,                       -- pixel coordinates on page
    page_number         SMALLINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ocr_field_ocr_result_id ON document.ocr_field (ocr_result_id);
CREATE INDEX idx_ocr_field_field_name ON document.ocr_field (field_name);

CREATE TRIGGER trg_ocr_field_updated_at
    BEFORE UPDATE ON document.ocr_field
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.ocr_feedback
-- Operators flag OCR errors to improve accuracy over time
-- =============================================================================
CREATE TABLE document.ocr_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ocr_field_id    UUID NOT NULL REFERENCES document.ocr_field (id) ON DELETE CASCADE,
    document_id     UUID NOT NULL,
    reported_by     UUID NOT NULL,                   -- admin/operator user id
    issue_type      VARCHAR(100) NOT NULL
                        CHECK (issue_type IN (
                            'WRONG_VALUE','MISSING_FIELD','WRONG_FIELD',
                            'ILLEGIBLE','FORMATTING_ERROR','OTHER'
                        )),
    notes           TEXT,
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_ocr_feedback_ocr_field_id ON document.ocr_feedback (ocr_field_id);
CREATE INDEX idx_ocr_feedback_document_id ON document.ocr_feedback (document_id);
CREATE INDEX idx_ocr_feedback_is_resolved ON document.ocr_feedback (is_resolved);

CREATE TRIGGER trg_ocr_feedback_updated_at
    BEFORE UPDATE ON document.ocr_feedback
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.document_tag
-- Custom tags on documents for user-defined organization
-- =============================================================================
CREATE TABLE document.document_tag (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    document_at TIMESTAMPTZ NOT NULL,
    tag_name    VARCHAR(100) NOT NULL,
    created_by_user_id UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID
);

CREATE INDEX idx_document_tag_document_id ON document.document_tag (document_id);
CREATE INDEX idx_document_tag_name ON document.document_tag (tag_name);

ALTER TABLE document.document_tag ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_document_tag_updated_at
    BEFORE UPDATE ON document.document_tag
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.document_share
-- Tracks sharing of specific documents with CAs, banks, or other users
-- =============================================================================
CREATE TABLE document.document_share (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL,
    document_at     TIMESTAMPTZ NOT NULL,
    shared_by       UUID NOT NULL,                  -- auth.user.id
    shared_with     UUID,                           -- auth.user.id (if internal share)
    share_type      VARCHAR(50) NOT NULL
                        CHECK (share_type IN ('CA','BANK','USER','EXTERNAL_LINK')),
    external_email  VARCHAR(320),
    access_token    VARCHAR(256),                   -- For external link sharing
    expires_at      TIMESTAMPTZ,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    accessed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_document_share_document_id ON document.document_share (document_id);
CREATE INDEX idx_document_share_shared_by ON document.document_share (shared_by);
CREATE INDEX idx_document_share_shared_with ON document.document_share (shared_with) WHERE shared_with IS NOT NULL;
CREATE INDEX idx_document_share_access_token ON document.document_share (access_token) WHERE access_token IS NOT NULL;

ALTER TABLE document.document_share ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_document_share_updated_at
    BEFORE UPDATE ON document.document_share
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- document.document_archive
-- Archival records for 7-year retention lifecycle management
-- =============================================================================
CREATE TABLE document.document_archive (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL,
    document_at         TIMESTAMPTZ NOT NULL,
    archive_storage_path TEXT NOT NULL,             -- GCS cold storage path
    archived_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    purge_after         TIMESTAMPTZ NOT NULL,        -- 7 years from upload
    is_purged           BOOLEAN NOT NULL DEFAULT FALSE,
    purged_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_document_archive_document_id ON document.document_archive (document_id);
CREATE INDEX idx_document_archive_purge_after ON document.document_archive (purge_after);
CREATE INDEX idx_document_archive_is_purged ON document.document_archive (is_purged);

CREATE TRIGGER trg_document_archive_updated_at
    BEFORE UPDATE ON document.document_archive
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY document_tag_isolation ON document.document_tag
    USING (created_by_user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY document_share_isolation ON document.document_share
    USING (shared_by = current_setting('app.current_user_id', TRUE)::UUID
           OR shared_with = current_setting('app.current_user_id', TRUE)::UUID);

-- Note: document.document RLS policy depends on user_id column.
-- The application sets app.current_user_id for each request.
CREATE POLICY document_user_isolation ON document.document
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
