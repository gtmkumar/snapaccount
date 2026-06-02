-- =============================================================================
-- 047_ai_config_and_usage.sql
-- AI configuration, encrypted provider keys, price catalog, and usage ledger.
-- Backs the admin "AI Model Configuration" panel (AuthService /auth/config/ai*):
--   - ai_configuration : platform-wide provider/model/tier + OCR toggles (single row)
--   - ai_provider_key  : AES-256 encrypted API keys (one per provider; write-only via API)
--   - ai_model_price   : maintained USD price catalog (Super-Admin editable) for cost calc
--   - ai_usage_log     : append-only metered AI/LLM call ledger (drives usage metrics)
-- ADDITIVE, idempotent. Audit columns follow the auth convention
-- (created_by/updated_by UUID; updated_at NOT NULL DEFAULT NOW()).
-- =============================================================================

-- ── Platform AI configuration (single row, fixed id) ─────────────────────────
CREATE TABLE IF NOT EXISTS auth.ai_configuration (
    id                    UUID PRIMARY KEY,
    ocr_provider          VARCHAR(50)  NOT NULL DEFAULT 'tesseract',
    ocr_model             VARCHAR(100),
    ocr_tier              VARCHAR(20)  NOT NULL DEFAULT 'efficient',
    confidence_threshold  NUMERIC(3,2) NOT NULL DEFAULT 0.75,
    ocr_enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
    auto_classify_enabled BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,
    created_by            UUID,
    updated_by            UUID
);

-- Seed the singleton row (id matches AiConfiguration.SingletonId).
INSERT INTO auth.ai_configuration (id, ocr_provider, ocr_model, ocr_tier)
VALUES ('a1c00f16-0000-0000-0000-000000000001', 'tesseract', 'tesseract-ocr', 'efficient')
ON CONFLICT (id) DO NOTHING;

-- ── Encrypted AI provider API keys (one per provider) ────────────────────────
CREATE TABLE IF NOT EXISTS auth.ai_provider_key (
    id            UUID PRIMARY KEY,
    provider      VARCHAR(50)  NOT NULL,        -- gemini | openai | anthropic | document_ai
    encrypted_key TEXT         NOT NULL,        -- AES-256 (IV-prepended Base64); never returned raw
    key_last4     VARCHAR(8),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    created_by    UUID,
    updated_by    UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_provider_key_provider
    ON auth.ai_provider_key (provider) WHERE deleted_at IS NULL;

-- ── Maintained price catalog (USD rates; Super-Admin editable) ───────────────
CREATE TABLE IF NOT EXISTS auth.ai_model_price (
    id                 UUID PRIMARY KEY,
    provider           VARCHAR(50)  NOT NULL,
    model              VARCHAR(100) NOT NULL,
    input_per_million  NUMERIC(12,4) NOT NULL DEFAULT 0,  -- USD / 1M input tokens
    output_per_million NUMERIC(12,4) NOT NULL DEFAULT 0,  -- USD / 1M output tokens
    per_page           NUMERIC(12,4) NOT NULL DEFAULT 0,  -- USD / page (e.g. Document AI)
    currency           VARCHAR(8)   NOT NULL DEFAULT 'USD',
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ,
    created_by         UUID,
    updated_by         UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_model_price
    ON auth.ai_model_price (provider, model) WHERE deleted_at IS NULL;

-- Seed current public rates (approximate; editable by Super Admin via PUT /auth/config/ai/prices).
INSERT INTO auth.ai_model_price (id, provider, model, input_per_million, output_per_million, per_page) VALUES
    (gen_random_uuid(), 'tesseract',   'tesseract-ocr',      0,     0,    0),
    (gen_random_uuid(), 'gemini',      'gemini-2.0-flash',   0.10,  0.40, 0),
    (gen_random_uuid(), 'gemini',      'gemini-1.5-flash',   0.075, 0.30, 0),
    (gen_random_uuid(), 'gemini',      'gemini-1.5-pro',     1.25,  5.00, 0),
    (gen_random_uuid(), 'openai',      'gpt-4o-mini',        0.15,  0.60, 0),
    (gen_random_uuid(), 'openai',      'gpt-4o',             2.50, 10.00, 0),
    (gen_random_uuid(), 'anthropic',   'claude-haiku-4-5',   1.00,  5.00, 0),
    (gen_random_uuid(), 'anthropic',   'claude-sonnet-4-6',  3.00, 15.00, 0),
    (gen_random_uuid(), 'document_ai', 'document-ai-ocr',    0,     0,    0.0015)
ON CONFLICT DO NOTHING;

-- ── Append-only metered AI usage ledger ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.ai_usage_log (
    id              UUID PRIMARY KEY,
    organization_id UUID,
    provider        VARCHAR(50)   NOT NULL,
    model           VARCHAR(100)  NOT NULL,
    feature         VARCHAR(50)   NOT NULL,   -- ocr | chat | classify | tax-advice | ...
    input_tokens    INT           NOT NULL DEFAULT 0,
    output_tokens   INT           NOT NULL DEFAULT 0,
    units           INT           NOT NULL DEFAULT 0,
    latency_ms      INT           NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(14,6) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);
CREATE INDEX IF NOT EXISTS ix_ai_usage_log_created_at ON auth.ai_usage_log (created_at);
CREATE INDEX IF NOT EXISTS ix_ai_usage_log_org        ON auth.ai_usage_log (organization_id);

-- ── Permission for managing AI config / keys / prices (Super Admin) ──────────
INSERT INTO auth.permission (id, name, resource, action, description, is_active)
VALUES (gen_random_uuid(), 'platform.ai.manage', 'platform', 'ai.manage',
        'Manage platform AI provider/model configuration, encrypted keys, and price catalog.', TRUE)
ON CONFLICT (name) DO NOTHING;
