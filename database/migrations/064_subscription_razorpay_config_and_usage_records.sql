-- =============================================================================
-- 064_subscription_razorpay_config_and_usage_records.sql
-- SubscriptionService — Phase 7 Wave 2 (backend B9: admin-managed Razorpay
-- credentials + feature usage metering). ADDITIVE migration. Extends
-- 010_subscription_schema.sql. Does NOT rename/drop any column. Idempotent.
--
-- Context
-- -------
-- backend-agent merged the RazorpayConfig and UsageRecord EF entities/configs with
-- NO backing SQL. SubscriptionService has EF entity configs that are canonical here.
--
-- Two new tables:
--   1. subscription.razorpay_config
--      EF: RazorpayConfigConfiguration → RazorpayConfig (AES-256-GCM encrypted secrets)
--   2. subscription.usage_records   (PLURAL — distinct from the pre-existing
--      subscription.usage_record SINGULAR table from migration 010, which is a
--      per-period rollup. The new table is an append-only per-event metering ledger.)
--      EF: UsageRecordConfiguration → UsageRecord
--
-- EF parity invariants: both entities inherit BaseAuditableEntity → require
-- created_at/updated_at/deleted_at/created_by/updated_by; created_by/updated_by
-- are uuid columns (BaseDbContext string<->uuid converter). Column names/types
-- mirror the EF configs exactly.
--
-- Depends on: 000_init.sql, 010_subscription_schema.sql.
-- =============================================================================


-- =============================================================================
-- 1. subscription.razorpay_config — admin-configured Razorpay credentials
--    EF: RazorpayConfigConfiguration → RazorpayConfig : BaseAuditableEntity
--
-- Single row per deployment (upsert in the command handler). key_id is plaintext;
-- the secret + webhook secret are AES-256-GCM encrypted at rest by the app layer.
-- Not org-owned — a global platform integration config gated by RBAC. No RLS.
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscription.razorpay_config (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Razorpay API key id (rzp_live_* / rzp_test_*), plaintext. (max 100)
    key_id                      VARCHAR(100)  NOT NULL,
    -- AES-256-GCM encrypted Razorpay API key secret. (max 1000)
    encrypted_key_secret        VARCHAR(1000) NOT NULL,
    -- AES-256-GCM encrypted webhook secret (nullable). (max 1000)
    encrypted_webhook_secret    VARCHAR(1000),
    -- When true, uses the Razorpay test API (no real charges). Entity default true.
    test_mode                   BOOLEAN       NOT NULL DEFAULT TRUE,
    -- When false, the Razorpay integration is disabled. Entity default false.
    is_enabled                  BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

DROP TRIGGER IF EXISTS trg_razorpay_config_updated_at ON subscription.razorpay_config;
CREATE TRIGGER trg_razorpay_config_updated_at
    BEFORE UPDATE ON subscription.razorpay_config
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE subscription.razorpay_config IS
    'Admin-configured Razorpay credentials (single row). Secrets AES-256-GCM encrypted at rest. Global platform config gated by RBAC (no RLS).';


-- =============================================================================
-- 2. subscription.usage_records — append-only feature metering ledger
--    EF: UsageRecordConfiguration → UsageRecord : BaseAuditableEntity
--
-- One row per metered event (document upload, AI call, etc.) per org per period.
-- High write volume. Org-scoped → RLS by org_id (mirrors migration 010 policies).
--
-- Partitioning note: this ledger is expected to grow large. A future migration may
-- RANGE-partition it by period_start (monthly) for retention/pruning. Kept as a
-- single table for now to match the EF model and avoid premature complexity;
-- partitioning would be a transparent, additive optimisation later.
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscription.usage_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Organisation that incurred the usage (auth.organization.id).
    org_id              UUID         NOT NULL,
    -- Feature category code, e.g. "document.upload", "ai.call". (max 100)
    feature_code        VARCHAR(100) NOT NULL,
    -- Units consumed (entity default 1).
    units               INTEGER      NOT NULL DEFAULT 1,
    -- Billing period start (first day of month, UTC midnight).
    period_start        TIMESTAMPTZ  NOT NULL,
    -- Billing period end (last day of month, UTC end of day).
    period_end          TIMESTAMPTZ  NOT NULL,
    -- Optional correlation id (e.g. document_id, chat_session_id). (max 200)
    correlation_id      VARCHAR(200),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

-- EF: composite aggregation index + single org index (exact HasDatabaseName).
CREATE INDEX IF NOT EXISTS ix_usage_records_org_feature_period
    ON subscription.usage_records (org_id, feature_code, period_start);
CREATE INDEX IF NOT EXISTS ix_usage_records_org_id
    ON subscription.usage_records (org_id);

DROP TRIGGER IF EXISTS trg_usage_records_updated_at ON subscription.usage_records;
CREATE TRIGGER trg_usage_records_updated_at
    BEFORE UPDATE ON subscription.usage_records
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE subscription.usage_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_records_org_isolation ON subscription.usage_records;
CREATE POLICY usage_records_org_isolation ON subscription.usage_records
    USING (org_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

COMMENT ON TABLE subscription.usage_records IS
    'Append-only per-event feature metering ledger (plural). Distinct from the singular subscription.usage_record per-period rollup in migration 010.';

-- =============================================================================
-- End 064_subscription_razorpay_config_and_usage_records.sql
-- =============================================================================
