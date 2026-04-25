-- SnapAccount — PostgreSQL 17 Initialization
-- Runs automatically via docker-entrypoint-initdb.d on first container start.
-- Also run manually on Cloud SQL after instance creation.
--
-- Creates all service schemas and enables required extensions.

-- Enable pgvector for RAG embeddings (AI Service)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_stat_statements for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── Create service schemas ──────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS document;
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS gst;
CREATE SCHEMA IF NOT EXISTS loan;
CREATE SCHEMA IF NOT EXISTS itr;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS report;
CREATE SCHEMA IF NOT EXISTS subscription;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS shared;

-- ── Grant schema privileges to application user ─────────────────────────────
-- In production (Cloud SQL), replace 'postgres' with 'snapaccount-app'

DO $$
DECLARE
    app_user TEXT := 'postgres';  -- override for prod: 'snapaccount-app'
    schemas TEXT[] := ARRAY['auth','document','accounting','gst','loan','itr','chat','notification','report','subscription','ai','shared'];
    s TEXT;
BEGIN
    FOREACH s IN ARRAY schemas LOOP
        EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA %I TO %I', s, app_user);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO %I', s, app_user);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO %I', s, app_user);
    END LOOP;
END $$;

-- ── Shared audit log table (cross-cutting) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.audit_logs (
    id              UUID DEFAULT gen_random_uuid(),
    service_name    VARCHAR(50)  NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,
    action          VARCHAR(50)  NOT NULL,  -- CREATE, READ, UPDATE, DELETE, EXPORT, FILE
    actor_user_id   UUID,
    actor_role      VARCHAR(100),
    organization_id UUID,
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,
    old_values      JSONB,
    new_values      JSONB,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partition (current year + next year)
CREATE TABLE IF NOT EXISTS shared.audit_logs_2026
    PARTITION OF shared.audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS shared.audit_logs_2027
    PARTITION OF shared.audit_logs
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON shared.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON shared.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_service ON shared.audit_logs (service_name, created_at DESC);

-- ── Shared system config table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.system_configurations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key  VARCHAR(200) NOT NULL UNIQUE,
    config_value TEXT,
    value_type  VARCHAR(50) NOT NULL DEFAULT 'string',  -- string, json, boolean, number
    description TEXT,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  UUID
);

-- Seed default config (admin can override via admin panel)
INSERT INTO shared.system_configurations (config_key, config_value, value_type, description) VALUES
    ('features.whatsapp_enabled',     'false',    'boolean', 'Enable WhatsApp Business API notifications'),
    ('features.tally_export_enabled', 'false',    'boolean', 'Enable Tally XML export'),
    ('ai.default_model',              'gemini-1.5-pro', 'string', 'Default AI model ID (Vertex AI)'),
    ('ai.fallback_enabled',           'true',     'boolean', 'Fall back gracefully when AI service is unavailable'),
    ('gst.einvoice_turnover_crore',   '5',        'number',  'E-invoicing mandatory above this turnover (Crore INR)'),
    ('gst.ewaybill_limit',            '50000',    'number',  'E-way bill required above this goods value (INR)'),
    ('app.default_language',          'en',       'string',  'Platform default language code'),
    ('app.supported_languages',       '["en","hi","bn","gu","ta","te","kn","mr","ml","pa","or"]', 'json', 'Supported language codes'),
    ('subscription.trial_days',       '14',       'number',  'Free trial duration in days'),
    ('auth.max_devices_per_user',     '2',        'number',  'Maximum active devices per user account'),
    ('auth.otp_validity_minutes',     '5',        'number',  'OTP validity window in minutes'),
    ('auth.otp_max_attempts',         '3',        'number',  'Max OTP verification attempts before cooldown'),
    ('auth.otp_cooldown_minutes',     '30',       'number',  'Cooldown period after max OTP attempts'),
    ('document.max_file_size_mb',     '5',        'number',  'Maximum document upload size in MB'),
    ('document.retention_years',      '7',        'number',  'Document retention period in years (tax law)')
ON CONFLICT (config_key) DO NOTHING;

-- ── Shared feature flags ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.feature_flags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name   VARCHAR(200) NOT NULL UNIQUE,
    is_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percentage SMALLINT NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shared.feature_flags (flag_name, is_enabled, rollout_percentage, description) VALUES
    ('whatsapp_notifications', FALSE, 0, 'WhatsApp Business API push notifications'),
    ('tally_xml_export',       FALSE, 0, 'Export financials in Tally-compatible XML format'),
    ('ai_first_response',      TRUE,  100, 'AI chatbot first response before routing to CA'),
    ('cash_flow_forecasting',  TRUE,  100, 'AI-powered cash flow predictions'),
    ('einvoice_generation',    TRUE,  100, 'E-invoice IRN generation via NIC portal'),
    ('ewaybill_generation',    TRUE,  100, 'E-way bill generation'),
    ('multi_org_support',      TRUE,  100, 'Multi-organization support for business owners')
ON CONFLICT (flag_name) DO NOTHING;

-- Done
SELECT 'SnapAccount DB initialization complete' AS status;
