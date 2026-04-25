-- =============================================================================
-- 011_ai_schema.sql
-- AI Service — RAG Pipeline, Embeddings, pgvector, Sarvam AI
-- Depends on: 000_init.sql (which enables the vector extension)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ai;

-- =============================================================================
-- ai.knowledge_base
-- Collections of knowledge for RAG (GST rules, ITR guides, etc.)
-- =============================================================================
CREATE TABLE ai.knowledge_base (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(100) NOT NULL UNIQUE,
    name            VARCHAR(300) NOT NULL,
    description     TEXT,
    domain          VARCHAR(100) NOT NULL,            -- 'GST', 'ITR', 'ACCOUNTING', 'GENERAL'
    language        VARCHAR(20) NOT NULL DEFAULT 'en',
    version         VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    document_count  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_knowledge_base_domain ON ai.knowledge_base (domain);
CREATE INDEX idx_knowledge_base_language ON ai.knowledge_base (language);

CREATE TRIGGER trg_knowledge_base_updated_at
    BEFORE UPDATE ON ai.knowledge_base
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.knowledge_document
-- Source documents in the knowledge base (chunked for RAG)
-- =============================================================================
CREATE TABLE ai.knowledge_document (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id   UUID NOT NULL REFERENCES ai.knowledge_base (id),
    title               VARCHAR(500) NOT NULL,
    source_url          TEXT,
    source_type         VARCHAR(50),                 -- 'PDF', 'WEB', 'MANUAL', 'API'
    content_hash        VARCHAR(128),                -- SHA-512 for dedup
    total_chunks        INTEGER NOT NULL DEFAULT 0,
    language            VARCHAR(20) NOT NULL DEFAULT 'en',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_knowledge_doc_kb_id ON ai.knowledge_document (knowledge_base_id);
CREATE INDEX idx_knowledge_doc_hash ON ai.knowledge_document (content_hash) WHERE content_hash IS NOT NULL;

CREATE TRIGGER trg_knowledge_document_updated_at
    BEFORE UPDATE ON ai.knowledge_document
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.document_chunk
-- Chunks of knowledge documents with vector embeddings for RAG
-- Vector dimension: 768 (Google text-embedding-004 / Vertex AI default)
-- =============================================================================
CREATE TABLE ai.document_chunk (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_doc_id    UUID NOT NULL REFERENCES ai.knowledge_document (id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL,
    content             TEXT NOT NULL,
    content_length      INTEGER GENERATED ALWAYS AS (LENGTH(content)) STORED,
    embedding           VECTOR(768),                 -- pgvector column for RAG
    metadata            JSONB,                       -- page number, section, etc.
    language            VARCHAR(20) NOT NULL DEFAULT 'en',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_document_chunk_doc_id ON ai.document_chunk (knowledge_doc_id);
-- HNSW index for fast approximate nearest neighbor search (cosine similarity)
CREATE INDEX idx_document_chunk_embedding_hnsw ON ai.document_chunk
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE TRIGGER trg_document_chunk_updated_at
    BEFORE UPDATE ON ai.document_chunk
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.user_document_embedding
-- Embeddings for user-uploaded documents (for semantic search within user's vault)
-- =============================================================================
CREATE TABLE ai.user_document_embedding (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    organization_id     UUID,
    document_id         UUID NOT NULL,               -- document.document.id
    document_at         TIMESTAMPTZ NOT NULL,        -- partition key
    page_number         SMALLINT,
    chunk_index         INTEGER NOT NULL DEFAULT 0,
    content_summary     TEXT,                        -- Short summary of the chunk
    embedding           VECTOR(768),
    model_used          VARCHAR(200) NOT NULL DEFAULT 'text-embedding-004',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_user_doc_embed_user_id ON ai.user_document_embedding (user_id);
CREATE INDEX idx_user_doc_embed_document_id ON ai.user_document_embedding (document_id);
-- HNSW index for user document semantic search
CREATE INDEX idx_user_doc_embed_hnsw ON ai.user_document_embedding
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE ai.user_document_embedding ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_document_embedding_updated_at
    BEFORE UPDATE ON ai.user_document_embedding
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.ai_session
-- AI chatbot sessions (before handoff to CA)
-- =============================================================================
CREATE TABLE ai.ai_session (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    conversation_id     UUID,                        -- chat.conversation.id (after handoff)
    session_type        VARCHAR(50) NOT NULL DEFAULT 'CHATBOT'
                            CHECK (session_type IN ('CHATBOT','TAX_ADVICE','DOCUMENT_QUERY','GENERAL')),
    model_used          VARCHAR(200) NOT NULL DEFAULT 'gemini-pro',
    language            VARCHAR(20) NOT NULL DEFAULT 'en',
    status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','HANDED_OFF','COMPLETED','ABANDONED')),
    message_count       INTEGER NOT NULL DEFAULT 0,
    token_count_input   INTEGER NOT NULL DEFAULT 0,
    token_count_output  INTEGER NOT NULL DEFAULT 0,
    handed_off_at       TIMESTAMPTZ,
    handoff_reason      TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ai_session_user_id ON ai.ai_session (user_id);
CREATE INDEX idx_ai_session_status ON ai.ai_session (status);
CREATE INDEX idx_ai_session_conversation_id ON ai.ai_session (conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE ai.ai_session ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ai_session_updated_at
    BEFORE UPDATE ON ai.ai_session
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.ai_message
-- Individual messages in an AI session
-- =============================================================================
CREATE TABLE ai.ai_message (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES ai.ai_session (id) ON DELETE CASCADE,
    role                VARCHAR(20) NOT NULL CHECK (role IN ('USER','ASSISTANT','SYSTEM')),
    content             TEXT NOT NULL,
    token_count         INTEGER,
    rag_chunks_used     JSONB,                       -- IDs of knowledge chunks used in response
    confidence_score    NUMERIC(5,4),
    language            VARCHAR(20) NOT NULL DEFAULT 'en',
    translated_from     VARCHAR(20),                -- If Sarvam AI translated from another language
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ai_message_session_id ON ai.ai_message (session_id, created_at);

ALTER TABLE ai.ai_message ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ai_message_updated_at
    BEFORE UPDATE ON ai.ai_message
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- ai.ai_model_config
-- Configurable AI model settings (admin-managed, no vendor lock-in)
-- =============================================================================
CREATE TABLE ai.ai_model_config (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    use_case            VARCHAR(100) NOT NULL UNIQUE, -- 'CHATBOT', 'EMBEDDING', 'TAX_ADVICE', etc.
    provider            VARCHAR(50) NOT NULL DEFAULT 'VERTEX_AI',
    model_name          VARCHAR(200) NOT NULL,
    endpoint_url        TEXT,
    api_key_secret_ref  VARCHAR(200),               -- GCP Secret Manager reference
    max_tokens          INTEGER,
    temperature         NUMERIC(3,2) NOT NULL DEFAULT 0.7,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    fallback_model      VARCHAR(200),
    extra_config        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ai_model_config_use_case ON ai.ai_model_config (use_case);

CREATE TRIGGER trg_ai_model_config_updated_at
    BEFORE UPDATE ON ai.ai_model_config
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY user_doc_embedding_isolation ON ai.user_document_embedding
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY ai_session_user_isolation ON ai.ai_session
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY ai_message_isolation ON ai.ai_message
    USING (session_id IN (
        SELECT id FROM ai.ai_session
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
