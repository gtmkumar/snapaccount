-- =============================================================================
-- 009_report_schema.sql
-- Report Service — Financial Reports, PDF Generation, Analytics, BI
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS report;

-- =============================================================================
-- report.report_template
-- Reusable templates for reports (Trial Balance, P&L, etc.)
-- =============================================================================
CREATE TABLE report.report_template (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(100) NOT NULL UNIQUE,
    name            VARCHAR(300) NOT NULL,
    report_type     VARCHAR(100) NOT NULL,            -- TRIAL_BALANCE, PNL, BALANCE_SHEET, etc.
    description     TEXT,
    template_config JSONB,                           -- Layout, columns, formatting config
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_report_template_code ON report.report_template (code);
CREATE INDEX idx_report_template_type ON report.report_template (report_type);

CREATE TRIGGER trg_report_template_updated_at
    BEFORE UPDATE ON report.report_template
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- report.report
-- Generated report instances
-- =============================================================================
CREATE TABLE report.report (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID REFERENCES report.report_template (id),
    organization_id     UUID,                        -- NULL for platform-level reports
    user_id             UUID,                        -- Requesting user
    report_type         VARCHAR(100) NOT NULL,
    title               VARCHAR(500) NOT NULL,
    parameters          JSONB,                       -- Date range, financial year, filters, etc.
    financial_year      VARCHAR(10),
    period_start        DATE,
    period_end          DATE,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','GENERATING','COMPLETED','FAILED')),
    storage_path        TEXT,                        -- GCS path to generated PDF
    file_size_bytes     BIGINT,
    page_count          SMALLINT,
    generated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,                 -- Signed URL expiry
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_report_org_id ON report.report (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_report_user_id ON report.report (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_report_type ON report.report (report_type);
CREATE INDEX idx_report_status ON report.report (status);
CREATE INDEX idx_report_template_id ON report.report (template_id) WHERE template_id IS NOT NULL;

ALTER TABLE report.report ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_report_updated_at
    BEFORE UPDATE ON report.report
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- report.report_schedule
-- Scheduled/recurring report generation
-- =============================================================================
CREATE TABLE report.report_schedule (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID NOT NULL REFERENCES report.report_template (id),
    organization_id     UUID,
    user_id             UUID NOT NULL,
    schedule_name       VARCHAR(300) NOT NULL,
    cron_expression     VARCHAR(100) NOT NULL,        -- e.g. '0 9 1 * *' (9am on 1st of each month)
    parameters          JSONB,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at         TIMESTAMPTZ,
    next_run_at         TIMESTAMPTZ,
    last_report_id      UUID REFERENCES report.report (id),
    delivery_channels   TEXT[],                       -- ['EMAIL','WHATSAPP']
    delivery_recipients JSONB,                        -- Email addresses etc.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_report_schedule_user_id ON report.report_schedule (user_id);
CREATE INDEX idx_report_schedule_next_run ON report.report_schedule (next_run_at) WHERE is_active = TRUE;

ALTER TABLE report.report_schedule ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_report_schedule_updated_at
    BEFORE UPDATE ON report.report_schedule
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- report.export_job
-- Background export jobs (Tally XML, CSV, etc.)
-- =============================================================================
CREATE TABLE report.export_job (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    organization_id UUID,
    export_type     VARCHAR(50) NOT NULL
                        CHECK (export_type IN ('PDF','CSV','EXCEL','TALLY_XML','JSON')),
    entity_type     VARCHAR(100) NOT NULL,           -- 'JOURNAL_ENTRIES', 'GST_RETURNS', etc.
    parameters      JSONB,
    status          VARCHAR(30) NOT NULL DEFAULT 'QUEUED'
                        CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','EXPIRED')),
    storage_path    TEXT,
    file_size_bytes BIGINT,
    download_count  INTEGER NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_export_job_user_id ON report.export_job (user_id);
CREATE INDEX idx_export_job_status ON report.export_job (status);
CREATE INDEX idx_export_job_org_id ON report.export_job (organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE report.export_job ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_export_job_updated_at
    BEFORE UPDATE ON report.export_job
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY report_org_isolation ON report.report
    USING (
        (organization_id IS NOT NULL AND organization_id IN (
            SELECT om.organization_id FROM auth.organization_member om
            WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
            UNION
            SELECT o.id FROM auth.organization o
            WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
        ))
        OR user_id = current_setting('app.current_user_id', TRUE)::UUID
    );

CREATE POLICY report_schedule_isolation ON report.report_schedule
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY export_job_isolation ON report.export_job
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
