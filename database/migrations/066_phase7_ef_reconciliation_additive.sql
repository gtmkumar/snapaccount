-- =============================================================================
-- 066_phase7_ef_reconciliation_additive.sql
-- Cross-service — Phase 7 EF <-> DB reconciliation handoff from backend-agent
-- (2026-06-11). ADDITIVE migration. Does NOT rename, drop, or alter the type of
-- any existing column. Idempotent / re-runnable (IF NOT EXISTS everywhere).
--
-- Source of truth: backend-agent left "DDL HANDOFF (db-engineer)" comments in the
-- affected EF Core entity configuration files. Every item below was verified
-- against the live local DB (psql snapaccount) before writing the DDL — actual
-- (singular vs plural) table names were checked and the live column set diffed.
--
-- ----------------------------------------------------------------------------
-- REPLAY GAPS DISCOVERED (loud flag — see schema-overview.md and final report)
-- ----------------------------------------------------------------------------
--   * Migration 060 DECLARED the notification.notification_event table and the
--     notification.notification_log dispatch columns (user_id, event_code,
--     channel, language, rendered_body, dedupe_key) — but the LIVE DB has
--     NEITHER. 060 was never (fully) applied here. Items 12 + 13 below re-apply
--     them idempotently; since IF NOT EXISTS is used, environments where 060 DID
--     run are unaffected.
--   * Migration 061 DECLARED loan.consents.consent_locale — but the LIVE DB
--     loan.consents has NO consent_locale column. Same replay gap. Item 4 below
--     re-applies it idempotently.
--
-- ----------------------------------------------------------------------------
-- TABLE-NAME RECONCILIATIONS (singular vs plural — verified against live DB)
-- ----------------------------------------------------------------------------
--   * loan applications: the EF-mapped / active table is loan.applications
--     (columns org_id, loan_product_id, ...). A legacy loan.loan_application also
--     exists but is NOT the EF target. assigned_bank_id is added to .applications.
--   * loan partner banks: the active/EF-mapped table is loan.partner_banks
--     (PK id). FK target confirmed. A legacy loan.partner_bank also exists.
--   * loan consents: the active/EF-mapped table is loan.consents (a legacy
--     loan.loan_consent also exists). consent_locale goes on .consents.
--   * subscription usage: EF UsageRecord maps to the SINGULAR
--     subscription.usage_record (UsageRecordConfiguration.ToTable("usage_record")
--     currently Ignore()s FeatureCode/Units/CorrelationId). A separate plural
--     subscription.usage_records (from migration 064) already carries these but is
--     a different table. Per the handoff, the columns are added to the SINGULAR
--     usage_record so EF can stop Ignoring them.
--   * itr: the EF-mapped tables are itr.assessee_profiles and itr.filings
--     (both plural). Confirmed.
--
-- Depends on: 000_init.sql and the per-service base schemas; shared.set_updated_at().
-- =============================================================================


-- #############################################################################
-- ITR SERVICE
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 1. itr.assessee_profiles.organization_id  (SECURITY-RELEVANT)
-- -----------------------------------------------------------------------------
-- Added NULLABLE: existing rows cannot satisfy NOT NULL until a backfill runs.
-- Org isolation currently relies on RLS only; this column is the first step
-- toward an explicit organization scope on the assessee profile.
-- FOLLOW-UP (separate migration): backfill organization_id, then SET NOT NULL,
-- then backend re-enables the EF property/NOT NULL mapping.
ALTER TABLE itr.assessee_profiles
    ADD COLUMN IF NOT EXISTS organization_id UUID;

COMMENT ON COLUMN itr.assessee_profiles.organization_id IS
    'Owning organization (auth.organization, referenced by value). NULLABLE for now — existing rows predate this column. Backfill + NOT NULL + EF re-enable is a Phase-7 follow-up. SECURITY: org isolation currently relies on RLS only. Added in migration 066.';

CREATE INDEX IF NOT EXISTS idx_assessee_profiles_organization_id
    ON itr.assessee_profiles (organization_id);

-- -----------------------------------------------------------------------------
-- Item 15. itr.filings — computation hash + income-head breakdown
-- -----------------------------------------------------------------------------
ALTER TABLE itr.filings
    ADD COLUMN IF NOT EXISTS computation_hash      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS salary_income         NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS house_property_income NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS business_income       NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS capital_gains         NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS other_income          NUMERIC(20,2);

COMMENT ON COLUMN itr.filings.computation_hash IS
    'Deterministic hash of the tax-computation inputs/outputs, used to detect drift between the stored computation and a recompute. Added in migration 066.';


-- #############################################################################
-- LOAN SERVICE
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 2. loan.applications.assigned_bank_id  -> loan.partner_banks(id)
-- -----------------------------------------------------------------------------
-- Active EF-mapped applications table is loan.applications (verified). FK target
-- is loan.partner_banks (PK id) — the active partner-bank table.
ALTER TABLE loan.applications
    ADD COLUMN IF NOT EXISTS assigned_bank_id UUID;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_loan_applications_assigned_bank'
    ) THEN
        ALTER TABLE loan.applications
            ADD CONSTRAINT fk_loan_applications_assigned_bank
            FOREIGN KEY (assigned_bank_id) REFERENCES loan.partner_banks (id);
    END IF;
END $$;

COMMENT ON COLUMN loan.applications.assigned_bank_id IS
    'Partner bank (loan.partner_banks.id) the application was routed/assigned to. NULL until assigned. Added in migration 066.';

CREATE INDEX IF NOT EXISTS idx_loan_applications_assigned_bank_id
    ON loan.applications (assigned_bank_id);

-- -----------------------------------------------------------------------------
-- Item 3. loan.webhook_idempotency_keys  — NEW TABLE
-- -----------------------------------------------------------------------------
-- DDL per WebhookIdempotencyKeyConfiguration.cs handoff comment. Used to
-- de-duplicate inbound partner-bank / Razorpay webhooks. bank_id references a
-- partner bank by value (consistent with EF: BankId is an unconstrained UUID).
CREATE TABLE IF NOT EXISTS loan.webhook_idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    bank_id         UUID         NOT NULL,
    received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_webhook_idem_bank_key UNIQUE (bank_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_idem_expires
    ON loan.webhook_idempotency_keys (expires_at);

COMMENT ON TABLE loan.webhook_idempotency_keys IS
    'Idempotency ledger for inbound partner-bank/Razorpay webhooks — (bank_id, idempotency_key) uniqueness dedupes redeliveries; expires_at drives TTL cleanup. Created in migration 066 (DDL handoff from WebhookIdempotencyKeyConfiguration.cs).';

-- -----------------------------------------------------------------------------
-- Item 4. loan.consents.consent_locale  (REPLAY GAP — see header)
-- -----------------------------------------------------------------------------
-- Migration 061 declared this column but the live DB never received it. Re-apply
-- idempotently. Active EF-mapped consent table is loan.consents (verified).
ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS consent_locale VARCHAR(10) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN loan.consents.consent_locale IS
    'BCP-47 / ISO locale the consent text was presented in (Consent.ConsentLocale; default en). Originally declared in migration 061 but absent from the live DB (replay gap); re-applied idempotently in migration 066.';


-- #############################################################################
-- GST SERVICE
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 5. gst.gst_refund — tax_period / filed_at / application_number
-- -----------------------------------------------------------------------------
ALTER TABLE gst.gst_refund
    ADD COLUMN IF NOT EXISTS tax_period         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS filed_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS application_number VARCHAR(100);

COMMENT ON COLUMN gst.gst_refund.tax_period IS
    'Tax period the refund pertains to (e.g. MM-YYYY or a quarter token). Distinct from the existing tax_period_from/tax_period_to range. Added in migration 066.';
COMMENT ON COLUMN gst.gst_refund.application_number IS
    'GST portal refund application number (RFD-01 reference). Added in migration 066.';

-- -----------------------------------------------------------------------------
-- Item 6. gst.lut_filing — export_type / is_auto_renewal
-- -----------------------------------------------------------------------------
ALTER TABLE gst.lut_filing
    ADD COLUMN IF NOT EXISTS export_type     VARCHAR(20)  DEFAULT 'GOODS',
    ADD COLUMN IF NOT EXISTS is_auto_renewal BOOLEAN      DEFAULT FALSE;

COMMENT ON COLUMN gst.lut_filing.export_type IS
    'Nature of zero-rated supply under the LUT — GOODS / SERVICES / BOTH. Default GOODS. Added in migration 066.';
COMMENT ON COLUMN gst.lut_filing.is_auto_renewal IS
    'Whether the LUT should be auto-renewed for the next financial year. Added in migration 066.';

-- -----------------------------------------------------------------------------
-- Item 7. gst.gst_annual_return — GSTR-9 reconciliation fields
-- -----------------------------------------------------------------------------
ALTER TABLE gst.gst_annual_return
    ADD COLUMN IF NOT EXISTS form_type         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS total_turnover    NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS total_tax_paid    NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS total_itc_claimed NUMERIC(20,2),
    ADD COLUMN IF NOT EXISTS notes             TEXT,
    ADD COLUMN IF NOT EXISTS is_reconciled     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reconciled_at     TIMESTAMPTZ;

COMMENT ON COLUMN gst.gst_annual_return.form_type IS
    'Annual return form variant — e.g. GSTR-9 / GSTR-9A / GSTR-9C. Added in migration 066.';
COMMENT ON COLUMN gst.gst_annual_return.is_reconciled IS
    'TRUE once books vs returns reconciliation has been signed off; reconciled_at carries the timestamp. Added in migration 066.';


-- #############################################################################
-- ACCOUNTING SERVICE
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 8. accounting.account — postable flag + template provenance
-- -----------------------------------------------------------------------------
ALTER TABLE accounting.account
    ADD COLUMN IF NOT EXISTS is_postable      BOOLEAN     DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS is_from_template BOOLEAN     DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS template_code    VARCHAR(20);

COMMENT ON COLUMN accounting.account.is_postable IS
    'FALSE for header/roll-up accounts that cannot receive journal lines directly. Default TRUE. Added in migration 066.';
COMMENT ON COLUMN accounting.account.is_from_template IS
    'TRUE if the account was instantiated from a chart-of-accounts template (coa_template); template_code records which row. Added in migration 066.';

-- -----------------------------------------------------------------------------
-- Item 9. accounting.journal_entry.fy_year
-- -----------------------------------------------------------------------------
ALTER TABLE accounting.journal_entry
    ADD COLUMN IF NOT EXISTS fy_year SMALLINT;

COMMENT ON COLUMN accounting.journal_entry.fy_year IS
    'Indian financial year the entry belongs to, stored as the starting calendar year (e.g. 2026 for FY 2026-27). Added in migration 066.';

-- -----------------------------------------------------------------------------
-- Item 10. accounting.internal_audit — report metadata
-- -----------------------------------------------------------------------------
ALTER TABLE accounting.internal_audit
    ADD COLUMN IF NOT EXISTS audit_title       VARCHAR(300),
    ADD COLUMN IF NOT EXISTS financial_year    VARCHAR(10),
    ADD COLUMN IF NOT EXISTS auditor_firm_name VARCHAR(300),
    ADD COLUMN IF NOT EXISTS executive_summary TEXT,
    ADD COLUMN IF NOT EXISTS report_document_id UUID,
    ADD COLUMN IF NOT EXISTS report_issued_at  TIMESTAMPTZ;

COMMENT ON COLUMN accounting.internal_audit.report_document_id IS
    'document.document id (referenced by value) of the generated/uploaded internal-audit report. Added in migration 066.';

CREATE INDEX IF NOT EXISTS idx_internal_audit_report_document_id
    ON accounting.internal_audit (report_document_id);

-- -----------------------------------------------------------------------------
-- Item 11. accounting.internal_audit_finding — title / evidence / resolved_at
-- -----------------------------------------------------------------------------
-- NOTE: evidence_document_id is VARCHAR(100) per the handoff (entity stores it as
-- a string token, not a UUID FK) — matched exactly.
ALTER TABLE accounting.internal_audit_finding
    ADD COLUMN IF NOT EXISTS title                VARCHAR(500),
    ADD COLUMN IF NOT EXISTS evidence_document_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS resolved_at          TIMESTAMPTZ;

COMMENT ON COLUMN accounting.internal_audit_finding.evidence_document_id IS
    'Reference (string token) to supporting evidence for the finding. Stored as VARCHAR per the entity model, not a UUID FK. Added in migration 066.';


-- #############################################################################
-- NOTIFICATION SERVICE  (REPLAY GAP — items 12 & 13, see header)
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 13. notification.notification_event  — NEW TABLE
-- -----------------------------------------------------------------------------
-- DDL per NotificationEventConfiguration.cs handoff comment. Migration 060
-- declared this table but it is absent from the live DB. Re-create idempotently.
CREATE TABLE IF NOT EXISTS notification.notification_event (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code       VARCHAR(200) NOT NULL UNIQUE,           -- e.g. GST_DEADLINE_7_DAYS
    event_name       VARCHAR(300) NOT NULL,
    category         VARCHAR(50)  NOT NULL,                  -- GST/ITR/LOAN/SUBSCRIPTION/...
    default_channels VARCHAR(200) NOT NULL DEFAULT 'Push',   -- comma-separated: Push,Sms,Email
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    created_by       UUID,
    updated_by       UUID
);

CREATE INDEX IF NOT EXISTS idx_notification_event_category
    ON notification.notification_event (category);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_event_updated_at') THEN
        CREATE TRIGGER trg_notification_event_updated_at
            BEFORE UPDATE ON notification.notification_event
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

COMMENT ON TABLE notification.notification_event IS
    'Notification event catalogue (NotificationEvent entity) — the seeder writes the event vocabulary here. Originally declared in migration 060 but absent from the live DB (replay gap); re-created idempotently in migration 066.';

-- -----------------------------------------------------------------------------
-- Item 12. notification.notification_log  — dispatch-record columns
-- -----------------------------------------------------------------------------
-- Migration 060 declared these six columns but the live DB has none of them
-- (replay gap). The full delta is added here. The 008-era table is a
-- provider-delivery log keyed by notification_id; these columns make it also
-- serve the NotificationLogEntry dispatch record.
ALTER TABLE notification.notification_log
    ADD COLUMN IF NOT EXISTS user_id       UUID,
    ADD COLUMN IF NOT EXISTS event_code    VARCHAR(200),
    ADD COLUMN IF NOT EXISTS channel       VARCHAR(30),
    ADD COLUMN IF NOT EXISTS language      VARCHAR(10) NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS rendered_body TEXT,
    ADD COLUMN IF NOT EXISTS dedupe_key    VARCHAR(128);

COMMENT ON COLUMN notification.notification_log.dedupe_key IS
    'Idempotency/dedupe key for the dispatch record (NotificationLogEntry). Originally declared in migration 060 but absent from the live DB (replay gap); added in migration 066.';

CREATE INDEX IF NOT EXISTS idx_notification_log_user_event
    ON notification.notification_log (user_id, event_code);
CREATE INDEX IF NOT EXISTS idx_notification_log_dedupe
    ON notification.notification_log (dedupe_key) WHERE dedupe_key IS NOT NULL;


-- #############################################################################
-- SUBSCRIPTION SERVICE
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Item 14. subscription.usage_record  (SINGULAR — EF target) — per-event ledger
-- -----------------------------------------------------------------------------
-- EF UsageRecord maps to the singular usage_record and currently Ignore()s these
-- three fields because no column exists. Adding them lets backend stop Ignoring.
-- NOTE: a separate plural subscription.usage_records (migration 064) also carries
-- feature_code/units/correlation_id but is a DIFFERENT table; per the handoff the
-- columns are added to the SINGULAR usage_record.
ALTER TABLE subscription.usage_record
    ADD COLUMN IF NOT EXISTS feature_code   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS units          INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(200);

COMMENT ON COLUMN subscription.usage_record.feature_code IS
    'Metered feature code for per-event ledger rows (UsageRecord.FeatureCode). NULL on legacy aggregate rows. Added in migration 066.';
COMMENT ON COLUMN subscription.usage_record.units IS
    'Quantity consumed by a per-event ledger row (UsageRecord.Units). Default 1. Added in migration 066.';
COMMENT ON COLUMN subscription.usage_record.correlation_id IS
    'Caller-supplied correlation id for de-duplicating/tracing a metered event (UsageRecord.CorrelationId). Added in migration 066.';

CREATE INDEX IF NOT EXISTS idx_usage_record_feature_code
    ON subscription.usage_record (feature_code) WHERE feature_code IS NOT NULL;

-- =============================================================================
-- End 066_phase7_ef_reconciliation_additive.sql
-- =============================================================================
