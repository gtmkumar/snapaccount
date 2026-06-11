-- =============================================================================
-- 074_gst_ims_gstr1a_schema_and_permissions.sql
-- Phase 7 — GSTN IMS (Invoice Management System) + GSTR-1A backend landing.
--
-- Background: GSTN's Invoice Management System (IMS) becomes the mandatory ITC
-- flow from April 2026. The GstService backend shipped three entities that need
-- their backing tables (the EF configs carry a "requires db-engineer DDL handoff"
-- note). This migration creates them, plus the RBAC permissions guarding the new
-- endpoints.
--
-- AUTHORITATIVE SOURCE: the EF entity configurations were used as the canonical
-- shape (orchestrator instruction — reconstruct from EF if the message DDL is
-- absent), verified column-for-column against:
--   GstService.Infrastructure/Persistence/Configurations/ImsInvoiceConfiguration.cs
--   GstService.Infrastructure/Persistence/Configurations/ImsActionLogConfiguration.cs
--   GstService.Infrastructure/Persistence/Configurations/Gstr1aAmendmentConfiguration.cs
--
-- RLS HOUSE STYLE (orchestrator: prefer house style over the handoff sketch):
--   The handoff sketched `org_id = current_setting('app.current_org_id', true)`.
--   But EVERY live gst.* table (and the EF mapping) uses column `organization_id`
--   with the org-MEMBERSHIP subquery keyed on `app.current_user_id` — there is no
--   `app.current_org_id` GUC anywhere in the codebase. So these tables follow the
--   established gst.* pattern: `organization_id IN (member-of subquery on
--   current_setting('app.current_user_id', TRUE))`. RLS is defence-in-depth (the
--   app connects as schema owner); primary control is app-layer RBAC + IDOR.
--
-- Conventions per 060–073: snake_case, UUID PK, audit cols, idempotent
-- (IF NOT EXISTS / guarded DO blocks), additive. No existing object altered.
--
-- Depends on: 004_gst_schema.sql, 036_auth_rbac_permission_catalog_seed.sql,
--             044_auth_resource_action_types.sql, 000_init.sql (shared.set_updated_at)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- gst.ims_invoices
-- Inbound supplier invoices surfaced by GSTN IMS for accept/reject/pending.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.ims_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,                          -- auth.organization.id
    supplier_gstin      VARCHAR(15) NOT NULL,
    supplier_name       VARCHAR(200) NOT NULL,
    invoice_number      VARCHAR(50) NOT NULL,
    invoice_date        DATE NOT NULL,
    invoice_value       NUMERIC(18,2) NOT NULL,
    taxable_value       NUMERIC(18,2) NOT NULL,
    igst_amount         NUMERIC(18,2) NOT NULL,
    cgst_amount         NUMERIC(18,2) NOT NULL,
    sgst_amount         NUMERIC(18,2) NOT NULL,
    cess_amount         NUMERIC(18,2) NOT NULL,
    period              VARCHAR(6) NOT NULL,                    -- 'MMYYYY'
    source              VARCHAR(20) NOT NULL,                   -- e.g. GSTN/MANUAL
    status              VARCHAR(20) NOT NULL,                   -- PENDING/ACCEPTED/REJECTED/...
    actioned_at         TIMESTAMPTZ,
    actioned_by         UUID,
    deemed_accepted     BOOLEAN NOT NULL DEFAULT FALSE,
    rejection_reason    VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          VARCHAR(128),
    updated_by          VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS ix_ims_invoices_org_period
    ON gst.ims_invoices (organization_id, period);
CREATE INDEX IF NOT EXISTS ix_ims_invoices_org_status
    ON gst.ims_invoices (organization_id, status);
-- One row per (org, supplier_gstin, invoice_number, period). Unique partial index
-- so soft-deleted rows don't block re-ingest of a recreated invoice.
CREATE UNIQUE INDEX IF NOT EXISTS uix_ims_invoices_org_supplier_invoice_period
    ON gst.ims_invoices (organization_id, supplier_gstin, invoice_number, period)
    WHERE deleted_at IS NULL;

ALTER TABLE gst.ims_invoices ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_ims_invoices_updated_at ON gst.ims_invoices;
CREATE TRIGGER trg_ims_invoices_updated_at
    BEFORE UPDATE ON gst.ims_invoices
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='gst' AND tablename='ims_invoices'
          AND policyname='gst_ims_invoices_org_isolation'
    ) THEN
        CREATE POLICY gst_ims_invoices_org_isolation ON gst.ims_invoices
            USING (organization_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- gst.ims_action_logs
-- APPEND-ONLY audit of every IMS accept/reject/pending/reset action.
-- No updated_at / deleted_at — rows are permanent audit records (7-year
-- retention). Immutable at the DB level (REVOKE UPDATE/DELETE), mirroring the
-- accounting.edit_log (071) statutory-audit pattern.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.ims_action_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ims_invoice_id      UUID NOT NULL,                          -- gst.ims_invoices.id (no FK: avoid cascade risk on append log)
    organization_id     UUID NOT NULL,
    action              VARCHAR(30) NOT NULL,                   -- ACCEPT/REJECT/PENDING/RESET/...
    previous_status     VARCHAR(20) NOT NULL,
    new_status          VARCHAR(20) NOT NULL,
    acted_at            TIMESTAMPTZ NOT NULL,
    acted_by            UUID,
    reason              VARCHAR(500),
    is_bulk             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ims_action_logs_invoice_id
    ON gst.ims_action_logs (ims_invoice_id);
CREATE INDEX IF NOT EXISTS ix_ims_action_logs_org_acted_at
    ON gst.ims_action_logs (organization_id, acted_at);

ALTER TABLE gst.ims_action_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='gst' AND tablename='ims_action_logs'
          AND policyname='gst_ims_action_logs_org_isolation'
    ) THEN
        CREATE POLICY gst_ims_action_logs_org_isolation ON gst.ims_action_logs
            USING (organization_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

-- Append-only enforcement: reject UPDATE / DELETE / TRUNCATE for ALL roles incl.
-- the table owner (a trigger is not bypassed by ownership). Reuses the
-- accounting.edit_log (071) statutory-audit immutability approach.
CREATE OR REPLACE FUNCTION gst.reject_ims_action_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'gst.ims_action_logs is append-only (IMS action audit, 7-year retention). '
        '% is not permitted.', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_ims_action_logs_no_update ON gst.ims_action_logs;
CREATE TRIGGER trg_ims_action_logs_no_update
    BEFORE UPDATE ON gst.ims_action_logs
    FOR EACH ROW EXECUTE FUNCTION gst.reject_ims_action_log_mutation();

DROP TRIGGER IF EXISTS trg_ims_action_logs_no_delete ON gst.ims_action_logs;
CREATE TRIGGER trg_ims_action_logs_no_delete
    BEFORE DELETE ON gst.ims_action_logs
    FOR EACH ROW EXECUTE FUNCTION gst.reject_ims_action_log_mutation();

DROP TRIGGER IF EXISTS trg_ims_action_logs_no_truncate ON gst.ims_action_logs;
CREATE TRIGGER trg_ims_action_logs_no_truncate
    BEFORE TRUNCATE ON gst.ims_action_logs
    FOR EACH STATEMENT EXECUTE FUNCTION gst.reject_ims_action_log_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON gst.ims_action_logs FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snapaccount_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON gst.ims_action_logs FROM snapaccount_app;
        GRANT  SELECT, INSERT ON gst.ims_action_logs TO snapaccount_app;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- gst.gstr1a_amendments
-- Supplier-side GSTR-1A amendments to invoices already reported in GSTR-1.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gst.gstr1a_amendments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL,
    original_ims_invoice_id UUID,                               -- gst.ims_invoices.id (nullable per EF)
    original_invoice_number VARCHAR(50) NOT NULL,
    original_supplier_gstin VARCHAR(15) NOT NULL,
    amendment_type          VARCHAR(30) NOT NULL,
    amendment_payload_json  JSONB NOT NULL,
    period                  VARCHAR(6) NOT NULL,
    status                  VARCHAR(20) NOT NULL,
    arn_number              VARCHAR(50),
    filed_at                TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              VARCHAR(128),
    updated_by              VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS ix_gstr1a_amendments_org_period
    ON gst.gstr1a_amendments (organization_id, period);
CREATE INDEX IF NOT EXISTS ix_gstr1a_amendments_org_status
    ON gst.gstr1a_amendments (organization_id, status);
CREATE INDEX IF NOT EXISTS ix_gstr1a_amendments_original_ims_invoice
    ON gst.gstr1a_amendments (original_ims_invoice_id);

ALTER TABLE gst.gstr1a_amendments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_gstr1a_amendments_updated_at ON gst.gstr1a_amendments;
CREATE TRIGGER trg_gstr1a_amendments_updated_at
    BEFORE UPDATE ON gst.gstr1a_amendments
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='gst' AND tablename='gstr1a_amendments'
          AND policyname='gst_gstr1a_amendments_org_isolation'
    ) THEN
        CREATE POLICY gst_gstr1a_amendments_org_isolation ON gst.gstr1a_amendments
            USING (organization_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

COMMENT ON TABLE gst.ims_invoices IS 'GSTN IMS inbound supplier invoices (accept/reject/pending workflow). Mandatory ITC flow from Apr-2026.';
COMMENT ON TABLE gst.ims_action_logs IS 'APPEND-ONLY audit of IMS actions. Immutable (UPDATE/DELETE/TRUNCATE rejected). 7-year retention.';
COMMENT ON TABLE gst.gstr1a_amendments IS 'GSTR-1A amendments to invoices already reported in GSTR-1.';

-- =============================================================================
-- (4) RBAC PERMISSIONS — 5 new permissions guarding the IMS / GSTR-1A endpoints.
-- Pattern follows 070 (seed by name; backfill resource_type_id by key;
-- action_type_id left NULL where no action_type key matches; grant by mirroring
-- the live audience of the closest existing gst.* permission, resolved by join).
--
-- GRANT-MIRROR MAPPING (see audience flag at end):
--   READ perms  (gst.ims.read, gst.gstr1a.read)  -> mirror gst.itc.reconcile
--       (IMS is the ITC-matching system; itc.reconcile is the closest read/analyze
--        audience). Live audience: CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN.
--   WRITE perms (gst.ims.action, gst.ims.sync, gst.gstr1a.create) -> mirror
--       gst.returns.file (closest GST submit/write audience). Live audience:
--       CA, DEV_LIMITED_MANAGER, ORG_ADMIN, SUPER_ADMIN.
-- =============================================================================

INSERT INTO auth.permission (id, name, resource, action, description)
SELECT gen_random_uuid(), p.name,
       split_part(p.name, '.', 1),                          -- 'gst'
       substring(p.name FROM position('.' IN p.name) + 1),  -- e.g. 'ims.read'
       p.description
FROM (VALUES
    ('gst.ims.read',      'View GSTN IMS inbound invoices'),
    ('gst.ims.action',    'Accept / reject / mark-pending IMS invoices'),
    ('gst.ims.sync',      'Trigger a GSTN IMS sync / fetch'),
    ('gst.gstr1a.read',   'View GSTR-1A amendments'),
    ('gst.gstr1a.create', 'Create / file a GSTR-1A amendment')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- Backfill resource_type_id (key='gst') for all 5 (matches 044/070).
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name IN ('gst.ims.read','gst.ims.action','gst.ims.sync','gst.gstr1a.read','gst.gstr1a.create')
  AND  rt.key = p.resource           -- 'gst'
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;
-- action_type_id intentionally left NULL: no action_type key matches
-- 'ims.read'/'ims.action'/'ims.sync'/'gstr1a.read'/'gstr1a.create' (consistent
-- with 070 — we do not invent action_type rows here).

-- Grant READ perms by mirroring gst.itc.reconcile's live audience.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), src.role_id, tgt.id
FROM (
    SELECT rp.role_id
    FROM   auth.role_permission rp
    JOIN   auth.permission ep ON ep.id = rp.permission_id
    WHERE  ep.name = 'gst.itc.reconcile'
      AND  rp.deleted_at IS NULL
      AND  COALESCE(rp.is_allowed, TRUE) = TRUE
) AS src
JOIN auth.permission tgt ON tgt.name IN ('gst.ims.read','gst.gstr1a.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant WRITE perms by mirroring gst.returns.file's live audience.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), src.role_id, tgt.id
FROM (
    SELECT rp.role_id
    FROM   auth.role_permission rp
    JOIN   auth.permission ep ON ep.id = rp.permission_id
    WHERE  ep.name = 'gst.returns.file'
      AND  rp.deleted_at IS NULL
      AND  COALESCE(rp.is_allowed, TRUE) = TRUE
) AS src
JOIN auth.permission tgt ON tgt.name IN ('gst.ims.action','gst.ims.sync','gst.gstr1a.create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- AUDIENCE NOTE (flagged for orchestrator / RBAC owner — NOT invented/widened):
--   The orchestrator's example perm 'gst.returns.read' does NOT exist in
--   auth.permission. The closest existing analogues were used:
--     reads  -> gst.itc.reconcile  (CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN)
--     writes -> gst.returns.file   (CA, DEV_LIMITED_MANAGER, ORG_ADMIN, SUPER_ADMIN)
--   If product intent differs (e.g. IMS read should reach a broader staff
--   audience, or 'gst.ims.sync' should be admin-only rather than the full write
--   audience), that is a separate RBAC decision and a follow-up grant.

-- =============================================================================
-- End 074_gst_ims_gstr1a_schema_and_permissions.sql
-- =============================================================================
