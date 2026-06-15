-- =============================================================================
-- 062_auth_dpdp_consent_export_correction_and_platform_config.sql
-- AuthService — Phase 7 Wave 2 (backend B11 DPDP self-service + B12 SEC-056
-- ghost-route backing tables). ADDITIVE migration. Extends 001_auth_schema.sql.
-- Does NOT rename, drop, or alter any existing column. Idempotent / re-runnable.
--
-- Context
-- -------
-- backend-agent merged the following EF Core entities/configurations with NO
-- backing SQL (AuthService has no EF migrations — these SQL files are canonical):
--
--   • UserConsent            → auth.user_consent           (DPDP purpose-coded consent)
--   • DataExportRequest      → auth.data_export_request    (DPDP data portability)
--   • DataCorrectionRequest  → auth.data_correction_request(DPDP right to correction)
--   • FeatureFlag            → auth.feature_flag           (SEC-056 ghost route)
--   • PlatformConfig         → auth.platform_config        (SEC-056 ghost route)
--
-- EF parity invariants (verified against the EF configs + BaseDbContext):
--   1. Every entity inherits BaseAuditableEntity → BaseDbContext applies a GLOBAL
--      soft-delete query filter (deleted_at IS NULL) and binds created_by/updated_by
--      on every write. Therefore EVERY table here MUST carry:
--         created_at, updated_at, deleted_at, created_by, updated_by.
--      Note: FeatureFlagConfiguration / PlatformConfigConfiguration only map the
--      three timestamp columns explicitly, but created_by/updated_by are inherited
--      and auto-mapped to snake_case by BaseDbContext (with a string<->uuid value
--      converter). They are therefore real uuid columns and MUST exist here too —
--      omitting them would break EF inserts.
--   2. created_by / updated_by are `uuid` columns (BaseDbContext.GuidStringConverter
--      binds a uuid-typed parameter, not text), matching every other table in the DB.
--   3. Column names/types/lengths mirror the EF property HasColumnName/HasMaxLength
--      exactly (see per-column comments).
--
-- Compliance: DPDP Act 2023 / DPDP Rules 2025.
--   • auth.user_consent is APPEND-ONLY (immutable audit trail). A no-DELETE trigger
--     blocks hard deletes (mirrors loan.consents / migration 027). Soft-delete via
--     UPDATE deleted_at remains the erasure mechanism, consistent with migration 061.
--
-- Depends on: 000_init.sql (extensions, schemas, shared.set_updated_at),
--             001_auth_schema.sql (auth.user).
-- =============================================================================


-- =============================================================================
-- 1. auth.user_consent — DPDP purpose-coded consent records (APPEND-ONLY)
--    EF: UserConsentConfiguration → AuthService.Domain.Entities.UserConsent
--
-- The table is an immutable, append-only audit trail. To determine the current
-- consent state for a (user_id, purpose) pair, read the row with the latest
-- action_at and check status = 'granted'. Grant and withdrawal each insert a new
-- row; rows are never updated by the application layer.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.user_consent (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK to the user who granted/withdrew this consent. No ON DELETE CASCADE:
    -- consent rows are retained for the DPDP audit trail (the no-DELETE trigger
    -- below would block a cascade anyway). Users are anonymised, not hard-deleted.
    user_id                 UUID NOT NULL REFERENCES auth.user (id),
    -- Processing purpose code, e.g. "marketing.sms", "loan.creditbureau". (max 200)
    purpose                 VARCHAR(200)  NOT NULL,
    -- Human-readable description of the processing purpose. (max 1000)
    purpose_description     VARCHAR(1000) NOT NULL,
    -- Version of the privacy notice shown to the user. (max 50)
    notice_version          VARCHAR(50)   NOT NULL,
    -- "granted" | "withdrawn". (max 20)
    status                  VARCHAR(20)   NOT NULL,
    -- Timestamp of the original grant/withdrawal action (set once at creation).
    action_at               TIMESTAMPTZ   NOT NULL,
    -- IP address of the requesting device at action time (IPv6-capable). (max 45)
    ip_address              VARCHAR(45),
    -- User-Agent of the requesting device at action time. (max 500)
    user_agent              VARCHAR(500),
    -- BCP-47 locale in which the notice was shown. (max 20)
    locale                  VARCHAR(20)   NOT NULL,
    -- Timestamp when withdrawn; NULL while still granted.
    withdrawn_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,                 -- EF global soft-delete filter
    created_by              UUID,
    updated_by              UUID
);

-- EF-declared index names (HasDatabaseName) — created here so the runtime DB matches.
CREATE INDEX IF NOT EXISTS ix_user_consent_user_id
    ON auth.user_consent (user_id);
CREATE INDEX IF NOT EXISTS ix_user_consent_user_purpose_time
    ON auth.user_consent (user_id, purpose, action_at);

-- updated_at maintenance (fires only on the rare UPDATE, e.g. soft-delete).
DROP TRIGGER IF EXISTS trg_user_consent_updated_at ON auth.user_consent;
CREATE TRIGGER trg_user_consent_updated_at
    BEFORE UPDATE ON auth.user_consent
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Block hard-deletes (DPDP append-only audit trail). Soft-delete (UPDATE
-- deleted_at) is still permitted and is what EF emits for erasure. Mirrors the
-- loan.consents no-DELETE guard from migration 027.
CREATE OR REPLACE FUNCTION auth.prevent_user_consent_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'auth.user_consent records cannot be hard-deleted (DPDP append-only audit trail). Use soft-delete (deleted_at) for erasure.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_consent_no_delete ON auth.user_consent;
CREATE TRIGGER trg_user_consent_no_delete
    BEFORE DELETE ON auth.user_consent
    FOR EACH ROW EXECUTE FUNCTION auth.prevent_user_consent_delete();

-- RLS: a user may only see/modify their own consent rows (mirrors 050/052).
-- App connects as the schema owner (bypasses RLS); this is defence-in-depth.
ALTER TABLE auth.user_consent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_consent_isolation ON auth.user_consent;
CREATE POLICY user_consent_isolation ON auth.user_consent
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

COMMENT ON TABLE auth.user_consent IS
    'DPDP Act 2023 purpose-coded consent records. Append-only audit trail (no hard delete); latest action_at per (user_id, purpose) is the current state.';


-- =============================================================================
-- 2. auth.data_export_request — DPDP data portability (async export job)
--    EF: DataExportRequestConfiguration → DataExportRequest
--
-- Created as status='pending'; a Hangfire job produces a JSON bundle in GCS and
-- updates the row to 'ready' with a signed download URL, or 'failed' on error.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.data_export_request (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    -- "pending" | "processing" | "ready" | "failed". (max 20)
    status                      VARCHAR(20)   NOT NULL,
    -- GCS object path of the produced JSON bundle (set when ready). (max 500)
    gcs_object_path             VARCHAR(500),
    -- Signed download URL (set when ready). (max 2000)
    download_url                VARCHAR(2000),
    -- UTC expiry of the signed URL.
    download_url_expires_at     TIMESTAMPTZ,
    -- Diagnostic message when status='failed'. (max 1000)
    error_message               VARCHAR(1000),
    -- Hangfire job id for traceability. (max 100)
    hangfire_job_id             VARCHAR(100),
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX IF NOT EXISTS ix_data_export_request_user_id
    ON auth.data_export_request (user_id);
CREATE INDEX IF NOT EXISTS ix_data_export_request_user_status
    ON auth.data_export_request (user_id, status);

DROP TRIGGER IF EXISTS trg_data_export_request_updated_at ON auth.data_export_request;
CREATE TRIGGER trg_data_export_request_updated_at
    BEFORE UPDATE ON auth.data_export_request
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.data_export_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_export_request_isolation ON auth.data_export_request;
CREATE POLICY data_export_request_isolation ON auth.data_export_request
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

COMMENT ON TABLE auth.data_export_request IS
    'DPDP Act 2023 data-portability export jobs. Status transitions pending → processing → ready|failed, driven by a Hangfire background job.';


-- =============================================================================
-- 3. auth.data_correction_request — DPDP right to correction
--    EF: DataCorrectionRequestConfiguration → DataCorrectionRequest
--
-- Status lifecycle: "submitted" → "under_review" → "completed" | "rejected".
-- Must be addressed by a human reviewer within the statutory timeline.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.data_correction_request (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    -- Field/category to correct, e.g. "name", "pan_number". (max 100)
    data_category           VARCHAR(100)  NOT NULL,
    -- User-supplied description of the inaccuracy + requested correction. (max 2000)
    description             VARCHAR(2000) NOT NULL,
    -- "submitted" | "under_review" | "completed" | "rejected". (max 30)
    status                  VARCHAR(30)   NOT NULL,
    -- Optional staff-only reviewer note. (max 2000)
    reviewer_note           VARCHAR(2000),
    -- Staff user id who processed the request (NULL until under review).
    reviewed_by_user_id     UUID REFERENCES auth.user (id) ON DELETE SET NULL,
    -- When the request was resolved (completed or rejected).
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS ix_data_correction_request_user_id
    ON auth.data_correction_request (user_id);
CREATE INDEX IF NOT EXISTS ix_data_correction_request_user_status
    ON auth.data_correction_request (user_id, status);

DROP TRIGGER IF EXISTS trg_data_correction_request_updated_at ON auth.data_correction_request;
CREATE TRIGGER trg_data_correction_request_updated_at
    BEFORE UPDATE ON auth.data_correction_request
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE auth.data_correction_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_correction_request_isolation ON auth.data_correction_request;
CREATE POLICY data_correction_request_isolation ON auth.data_correction_request
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

COMMENT ON TABLE auth.data_correction_request IS
    'DPDP Act 2023 data-correction requests. Human-reviewed lifecycle submitted → under_review → completed|rejected.';


-- =============================================================================
-- 4. auth.feature_flag — SEC-056 runtime feature flags (platform-wide, admin)
--    EF: FeatureFlagConfiguration → FeatureFlag
--
-- Not user-owned: a single global registry toggled by platform admins. Access is
-- gated by RBAC at the application layer (SEC-056 ghost-route → admin permission),
-- so no RLS policy is applied (consistent with other global admin config tables).
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.feature_flag (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Lowercase dot-separated key, e.g. "ai.ocr", "loan.digital-lending". (max 100)
    flag_key        VARCHAR(100) NOT NULL,
    is_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Optional human-readable description. (max 500)
    description     VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,                                -- inherited (BaseAuditableEntity)
    updated_by      UUID                                 -- inherited (BaseAuditableEntity)
);

-- EF: builder.HasIndex(flag_key).IsUnique() → ix_feature_flag_flag_key
CREATE UNIQUE INDEX IF NOT EXISTS ix_feature_flag_flag_key
    ON auth.feature_flag (flag_key);

DROP TRIGGER IF EXISTS trg_feature_flag_updated_at ON auth.feature_flag;
CREATE TRIGGER trg_feature_flag_updated_at
    BEFORE UPDATE ON auth.feature_flag
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE auth.feature_flag IS
    'SEC-056 runtime feature flags. Global admin-managed registry; access gated by RBAC (no RLS).';


-- =============================================================================
-- 5. auth.platform_config — SEC-056 generic JSONB key-value config (admin)
--    EF: PlatformConfigConfiguration → PlatformConfig
--
-- Stores JSON blobs keyed by config_key (e.g. "language", "whatsapp"). Like
-- feature_flag, this is a global admin store gated by RBAC — no RLS.
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth.platform_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Unique config key, e.g. "language", "whatsapp". (max 100)
    config_key      VARCHAR(100) NOT NULL,
    -- JSON blob value. EF maps ConfigValueJson → config_value, type jsonb.
    config_value    JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,                                -- inherited (BaseAuditableEntity)
    updated_by      UUID                                 -- inherited (BaseAuditableEntity)
);

-- EF: builder.HasIndex(config_key).IsUnique() → ix_platform_config_config_key
CREATE UNIQUE INDEX IF NOT EXISTS ix_platform_config_config_key
    ON auth.platform_config (config_key);

DROP TRIGGER IF EXISTS trg_platform_config_updated_at ON auth.platform_config;
CREATE TRIGGER trg_platform_config_updated_at
    BEFORE UPDATE ON auth.platform_config
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE auth.platform_config IS
    'SEC-056 generic JSONB platform config (language, whatsapp, etc.). Global admin-managed; access gated by RBAC (no RLS).';

-- =============================================================================
-- End 062_auth_dpdp_consent_export_correction_and_platform_config.sql
-- =============================================================================
