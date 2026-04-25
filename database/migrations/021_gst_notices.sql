-- =============================================================================
-- 021_gst_notices.sql
-- Phase 6B — GST Completion
--
-- Adds `gst.notices` (plural) — Phase-6B-aligned notice tracker with
-- attachments_jsonb (GCS URI metadata only — NEVER raw bytes), response_text,
-- and a tighter 4-state lifecycle: RECEIVED -> UNDER_REVIEW -> RESPONDED -> CLOSED.
--
-- Distinct from legacy `gst.gst_notice` (singular) in 004_gst_schema.sql, which
-- is kept untouched (additive). The new table is the canonical Phase-6B-onwards
-- store; legacy data migration is an ops task (NOT in this file).
--
-- DPDP cascade:
--   - body_text and response_text are PII-sensitive (notice content references
--     individuals/businesses).
--   - Right-to-erasure must soft-delete via deleted_at and NULL out the text
--     fields. Enforced at application layer; columns include `anonymized_at`
--     for that workflow.
--
-- Audit:
--   - Status transitions are written to `shared.audit_log` with
--     entity_type='gst.notices' and action='UPDATE'. The trigger here only
--     stamps updated_at; backend writes the audit row (consistent with rest
--     of the codebase — see 016_accounting_posting_pipeline.sql).
--
-- RLS: org_id-scoped via auth.organization_member.
-- Idempotent. Depends on: 000_init.sql, 001_auth_schema.sql, 004_gst_schema.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gst.notices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,                        -- auth.organization.id
    gstin                   VARCHAR(15) NOT NULL
                                CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    notice_number           VARCHAR(100) NOT NULL,
    notice_date             DATE NOT NULL,
    notice_type             VARCHAR(60) NOT NULL,                 -- ASMT-10, DRC-01, GSTR-3A, SCN, etc.
    issued_by               VARCHAR(300),                         -- Officer / authority
    due_date                DATE,
    -- Notice content (PII)
    subject                 VARCHAR(500),
    body_text               TEXT,
    -- Attachments: ARRAY OF JSON OBJECTS — each element of shape:
    --   {
    --     "gcs_uri":     "gs://snapaccount-prod/gst-notices/{org}/{notice}/{file}.pdf",
    --     "filename":    "ASMT-10-page-1.pdf",
    --     "content_type":"application/pdf",
    --     "size_bytes":  123456,
    --     "uploaded_at": "2026-04-25T10:00:00Z",
    --     "uploaded_by": "<uuid>"
    --   }
    -- BACKEND CONTRACT: ONLY signed-URI metadata is stored here. Raw file bytes
    -- belong in GCS (referenced by gcs_uri). Any code path that writes raw
    -- base64 / binary blobs into this column is a bug.
    attachments_jsonb       JSONB NOT NULL DEFAULT '[]'::jsonb
                                CHECK (jsonb_typeof(attachments_jsonb) = 'array'),
    -- Lifecycle state
    status                  VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
                                CHECK (status IN ('RECEIVED','UNDER_REVIEW','RESPONDED','CLOSED')),
    assigned_to             UUID,                                 -- auth.user.id of CA/ops agent
    assigned_at             TIMESTAMPTZ,
    -- Response (PII)
    response_text           TEXT,
    response_attachments_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb
                                CHECK (jsonb_typeof(response_attachments_jsonb) = 'array'),
    responded_at            TIMESTAMPTZ,
    responded_by            UUID,
    closed_at               TIMESTAMPTZ,
    closed_by               UUID,
    -- DPDP anonymization scaffolding (right-to-erasure)
    anonymized_at           TIMESTAMPTZ,
    anonymized_by           UUID,
    -- Linkage
    callback_id             UUID,                                 -- callback.callbacks.id (notice -> CA assignment)
    source_document_id      UUID,                                 -- document.document.id of original PDF
    -- Compliance retention (CBIC requires retention for 6 years from due date)
    retention_until         DATE,
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    UNIQUE (org_id, gstin, notice_number)
);

CREATE INDEX IF NOT EXISTS idx_gst_notices_org_id        ON gst.notices (org_id);
CREATE INDEX IF NOT EXISTS idx_gst_notices_gstin         ON gst.notices (gstin);
CREATE INDEX IF NOT EXISTS idx_gst_notices_status        ON gst.notices (status, org_id);
CREATE INDEX IF NOT EXISTS idx_gst_notices_due_date      ON gst.notices (due_date) WHERE status NOT IN ('RESPONDED','CLOSED');
CREATE INDEX IF NOT EXISTS idx_gst_notices_assigned_to   ON gst.notices (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gst_notices_notice_date   ON gst.notices (notice_date);
CREATE INDEX IF NOT EXISTS idx_gst_notices_callback_id   ON gst.notices (callback_id) WHERE callback_id IS NOT NULL;

ALTER TABLE gst.notices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gst' AND tablename='notices' AND policyname='gst_notices_org_isolation') THEN
        CREATE POLICY gst_notices_org_isolation ON gst.notices
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gst_notices_updated_at') THEN
        CREATE TRIGGER trg_gst_notices_updated_at
            BEFORE UPDATE ON gst.notices
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- =============================================================================
-- End of 021_gst_notices.sql
-- =============================================================================
