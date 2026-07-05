-- =============================================================================
-- 102_gst_org_profile.sql
-- DG-GST-05: GST organisation profile table for e-invoice threshold checks.
--
-- Stores per-org annual turnover (in Crore) so that the e-invoice mandate can
-- be enforced without a cross-service HTTP call to auth.organization.
-- The threshold (> 5 Crore) is config-driven (GstService:EInvoiceThresholdCrore).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS gst.gst_org_profile (
    id                      uuid            NOT NULL DEFAULT gen_random_uuid(),
    organization_id         uuid            NOT NULL UNIQUE,
    annual_turnover_cr      numeric(18,2),          -- Annual turnover in Crore (INR). NULL = not set.
    einvoice_enabled        boolean         NOT NULL DEFAULT false,
                                                    -- TRUE = org is above threshold or admin-forced.
    effective_from_fy       varchar(10),            -- e.g. '2024-25' — FY this turnover applies to.
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    deleted_at              timestamptz,
    created_by              uuid,
    updated_by              uuid,

    CONSTRAINT pk_gst_org_profile PRIMARY KEY (id)
);

COMMENT ON TABLE gst.gst_org_profile IS
    'DG-GST-05: Per-org GST profile. Stores annual turnover used for e-invoice '
    'threshold check (mandatory for turnover > 5 Crore). Config-driven threshold '
    'via GstService:EInvoiceThresholdCrore in appsettings / Secret Manager.';

COMMENT ON COLUMN gst.gst_org_profile.annual_turnover_cr IS
    'Annual turnover in Indian Rupees Crore. Used to gate e-invoice mandate. '
    'NULL means not set — the system defaults to not enforcing e-invoice.';

COMMENT ON COLUMN gst.gst_org_profile.einvoice_enabled IS
    'If true, e-invoice generation is always enabled (admin override) '
    'regardless of turnover value.';

CREATE UNIQUE INDEX IF NOT EXISTS ix_gst_org_profile_org_id
    ON gst.gst_org_profile (organization_id);

CREATE INDEX IF NOT EXISTS ix_gst_org_profile_einvoice_enabled
    ON gst.gst_org_profile (einvoice_enabled) WHERE einvoice_enabled = true;

ALTER TABLE gst.gst_org_profile ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'gst_org_profile' AND schemaname = 'gst'
          AND policyname = 'gst_org_profile_all'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY gst_org_profile_all ON gst.gst_org_profile
                USING (true)
        $policy$;
    END IF;
END;
$$;

CREATE TRIGGER trg_gst_org_profile_updated_at
    BEFORE UPDATE ON gst.gst_org_profile
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMIT;
