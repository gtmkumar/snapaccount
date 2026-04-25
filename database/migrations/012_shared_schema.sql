-- =============================================================================
-- 012_shared_schema.sql
-- Shared / Cross-Cutting — Audit Log, System Config, Feature Flags, Rate Limits
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS shared;

-- =============================================================================
-- shared.audit_log  (PARTITIONED BY MONTH on created_at)
-- Immutable audit trail for all financial modifications and user actions.
-- Satisfies CA compliance and DPDP Act requirements.
-- =============================================================================
CREATE TABLE shared.audit_log (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    event_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    service         VARCHAR(100) NOT NULL,            -- 'auth', 'accounting', 'gst', etc.
    entity_type     VARCHAR(100) NOT NULL,            -- Table/entity name
    entity_id       UUID NOT NULL,
    action          VARCHAR(50) NOT NULL
                        CHECK (action IN (
                            'CREATE','READ','UPDATE','DELETE',
                            'LOGIN','LOGOUT','EXPORT','SHARE',
                            'FILE','APPROVE','REJECT','VERIFY'
                        )),
    actor_user_id   UUID,                            -- Who did it (NULL = system)
    actor_type      VARCHAR(30) NOT NULL DEFAULT 'USER'
                        CHECK (actor_type IN ('USER','SYSTEM','API','ADMIN')),
    organization_id UUID,
    ip_address      INET,
    user_agent      TEXT,
    old_values      JSONB,                           -- Previous state (for UPDATE/DELETE)
    new_values      JSONB,                           -- New state (for CREATE/UPDATE)
    changed_fields  TEXT[],                          -- List of field names that changed
    request_id      VARCHAR(200),                    -- Correlation ID from API gateway
    session_id      VARCHAR(200),
    is_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,  -- PII or financial data involved
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for audit_log
CREATE TABLE shared.audit_log_2026_01 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE shared.audit_log_2026_02 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE shared.audit_log_2026_03 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE shared.audit_log_2026_04 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE shared.audit_log_2026_05 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE shared.audit_log_2026_06 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE shared.audit_log_2026_07 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE shared.audit_log_2026_08 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE shared.audit_log_2026_09 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE shared.audit_log_2026_10 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE shared.audit_log_2026_11 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE shared.audit_log_2026_12 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE shared.audit_log_default PARTITION OF shared.audit_log DEFAULT;

CREATE INDEX idx_audit_log_actor_user_id ON shared.audit_log (actor_user_id, event_time) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_entity ON shared.audit_log (entity_type, entity_id, event_time);
CREATE INDEX idx_audit_log_service ON shared.audit_log (service, event_time);
CREATE INDEX idx_audit_log_org_id ON shared.audit_log (organization_id, event_time) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_audit_log_action ON shared.audit_log (action, event_time);

-- Audit log is APPEND-ONLY — no RLS update/delete needed but reads restricted
ALTER TABLE shared.audit_log ENABLE ROW LEVEL SECURITY;

-- System admins and support can read all; users can only read their own
CREATE POLICY audit_log_isolation ON shared.audit_log
    USING (actor_user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR organization_id IN (
               SELECT om.organization_id FROM auth.organization_member om
               WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
           ));

-- =============================================================================
-- shared.system_configuration
-- Platform-wide settings managed by admin (no code deployments needed)
-- =============================================================================
CREATE TABLE shared.system_configuration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(100) NOT NULL,            -- 'PAYMENT_GATEWAY', 'AI_MODEL', etc.
    key             VARCHAR(200) NOT NULL,
    value           TEXT,
    value_type      VARCHAR(30) NOT NULL DEFAULT 'STRING'
                        CHECK (value_type IN ('STRING','INTEGER','BOOLEAN','JSON','SECRET_REF')),
    description     TEXT,
    is_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,  -- If TRUE, value is a Secret Manager ref
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (category, key)
);

CREATE INDEX idx_system_config_category ON shared.system_configuration (category);
CREATE INDEX idx_system_config_key ON shared.system_configuration (key);

CREATE TRIGGER trg_system_configuration_updated_at
    BEFORE UPDATE ON shared.system_configuration
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- shared.feature_flag
-- Feature toggles managed by admin (WhatsApp, Tally export, new features, etc.)
-- =============================================================================
CREATE TABLE shared.feature_flag (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key            VARCHAR(200) NOT NULL UNIQUE,
    name                VARCHAR(300) NOT NULL,
    description         TEXT,
    is_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percentage  SMALLINT NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    enabled_for_roles   TEXT[],                      -- NULL = all roles; otherwise role names
    enabled_for_plan_codes TEXT[],                   -- NULL = all plans; otherwise plan codes
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_feature_flag_key ON shared.feature_flag (flag_key);
CREATE INDEX idx_feature_flag_is_enabled ON shared.feature_flag (is_enabled);

CREATE TRIGGER trg_feature_flag_updated_at
    BEFORE UPDATE ON shared.feature_flag
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- shared.api_rate_limit
-- Per-user/IP rate limiting configuration
-- =============================================================================
CREATE TABLE shared.api_rate_limit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope           VARCHAR(50) NOT NULL CHECK (scope IN ('GLOBAL','PER_USER','PER_IP','PER_ENDPOINT')),
    identifier      VARCHAR(200) NOT NULL,           -- endpoint path, role name, etc.
    max_requests    INTEGER NOT NULL,
    window_seconds  INTEGER NOT NULL,
    burst_limit     INTEGER,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (scope, identifier)
);

CREATE INDEX idx_api_rate_limit_scope ON shared.api_rate_limit (scope, identifier);

CREATE TRIGGER trg_api_rate_limit_updated_at
    BEFORE UPDATE ON shared.api_rate_limit
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- shared.consent_record
-- DPDP Act 2023 — explicit user consents (data processing, data sharing, etc.)
-- =============================================================================
CREATE TABLE shared.consent_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    consent_type        VARCHAR(100) NOT NULL,        -- 'DATA_PROCESSING', 'MARKETING', 'LOAN_SHARING', etc.
    consent_version     VARCHAR(50) NOT NULL,
    consent_text_hash   VARCHAR(128) NOT NULL,        -- Hash of consent text shown
    is_granted          BOOLEAN NOT NULL,
    granted_at          TIMESTAMPTZ,
    ip_address          INET,
    device_id           VARCHAR(256),
    user_agent          TEXT,
    is_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at          TIMESTAMPTZ,
    revocation_reason   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_consent_record_user_id ON shared.consent_record (user_id);
CREATE INDEX idx_consent_record_type ON shared.consent_record (consent_type);
CREATE INDEX idx_consent_record_is_revoked ON shared.consent_record (is_revoked);

ALTER TABLE shared.consent_record ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_record_isolation ON shared.consent_record
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE TRIGGER trg_consent_record_updated_at
    BEFORE UPDATE ON shared.consent_record
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- shared.data_deletion_request
-- DPDP Act — right to erasure requests
-- =============================================================================
CREATE TABLE shared.data_deletion_request (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    request_type        VARCHAR(50) NOT NULL DEFAULT 'FULL_ERASURE'
                            CHECK (request_type IN ('FULL_ERASURE','PARTIAL_ERASURE','EXPORT_THEN_DELETE')),
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','ACKNOWLEDGED','IN_PROGRESS','COMPLETED','REJECTED')),
    rejection_reason    TEXT,
    legal_hold          BOOLEAN NOT NULL DEFAULT FALSE, -- Cannot delete if under legal hold (7-year retention)
    legal_hold_reason   TEXT,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at     TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    processed_by        UUID,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_data_deletion_user_id ON shared.data_deletion_request (user_id);
CREATE INDEX idx_data_deletion_status ON shared.data_deletion_request (status);

ALTER TABLE shared.data_deletion_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_deletion_isolation ON shared.data_deletion_request
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE TRIGGER trg_data_deletion_request_updated_at
    BEFORE UPDATE ON shared.data_deletion_request
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
