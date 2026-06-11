-- =============================================================================
-- 075_ai_chunks_embeddings_interactions.sql
-- Phase 7a — AiService RAG chunk/embedding store + AI interaction audit.
--
-- Background: AiService P7a landed three entities (the RAG ingestion store and a
-- per-call usage/audit log) whose backing tables need the db-engineer DDL. The
-- vector column is stored as FLOAT4[] in P7a; the pgvector vector(768)+HNSW
-- upgrade is DEFERRED to P7b (see the P7b upgrade block on ai.embeddings below).
--
-- AUTHORITATIVE SOURCE: the EF entity configurations were reconstructed
-- column-for-column (orchestrator instruction; same method as 074), verified
-- against:
--   AiService.Infrastructure/Persistence/Configurations/AiChunkConfiguration.cs
--   AiService.Infrastructure/Persistence/Configurations/AiEmbeddingConfiguration.cs
--   AiService.Infrastructure/Persistence/Configurations/AiInteractionConfiguration.cs
-- Column types follow the EF mapping exactly: HasMaxLength(32/64/128) -> VARCHAR;
-- string props with NO HasMaxLength (created_by/updated_by, BaseAuditableEntity
-- string?) -> TEXT; FLOAT4[] for the P7a vector; AiInteraction.OrganizationId is
-- Guid? (nullable — the EF config does NOT mark it IsRequired).
--
-- RLS HOUSE STYLE (orchestrator: house style, NOT the handoff's app.current_org_id):
--   No `app.current_org_id` GUC exists anywhere. ai.* and every other org-owned
--   table uses the org-MEMBERSHIP subquery keyed on
--   `current_setting('app.current_user_id', TRUE)::uuid`. Used here for the
--   org-owned tables. RLS is defence-in-depth (app connects as schema owner).
--
-- Conventions per 060–074: snake_case, UUID PK, audit cols, idempotent
-- (IF NOT EXISTS / guarded DO blocks), additive. No existing object altered.
--
-- Depends on: 011_ai_schema.sql (ai schema), 000_init.sql (shared.set_updated_at,
--             vector extension). pgvector IS already enabled in this DB
--             (extension 'vector' present; HNSW used elsewhere) — but P7a keeps
--             FLOAT4[] per the P7a/EF compatibility decision; the extension is
--             ready for the P7b upgrade.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ai.chunks
-- RAG document chunks: one row per text chunk extracted from a document.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai.chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL,                          -- document.document.id (by value)
    organization_id     UUID NOT NULL,                          -- auth.organization.id
    chunk_index         INTEGER NOT NULL,                       -- 0-based position within the document
    text                TEXT NOT NULL,
    token_count         INTEGER NOT NULL,
    page_number         INTEGER,                                -- nullable (AiChunk.PageNumber is int?)
    embedding_provider  VARCHAR(32) NOT NULL,
    embedding_model     VARCHAR(64) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          TEXT,
    updated_by          TEXT
);

CREATE INDEX IF NOT EXISTS ix_ai_chunks_document_id
    ON ai.chunks (document_id);
CREATE INDEX IF NOT EXISTS ix_ai_chunks_organization_id
    ON ai.chunks (organization_id);
-- One chunk row per (document, chunk_index).
CREATE UNIQUE INDEX IF NOT EXISTS uix_ai_chunks_document_index
    ON ai.chunks (document_id, chunk_index);

ALTER TABLE ai.chunks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_ai_chunks_updated_at ON ai.chunks;
CREATE TRIGGER trg_ai_chunks_updated_at
    BEFORE UPDATE ON ai.chunks
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='ai' AND tablename='chunks'
          AND policyname='ai_chunks_org_isolation'
    ) THEN
        CREATE POLICY ai_chunks_org_isolation ON ai.chunks
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
-- ai.embeddings
-- One-to-one with ai.chunks (chunk_id FK ON DELETE CASCADE). P7a stores the
-- vector as FLOAT4[]; no audit columns are mapped by the EF config.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai.embeddings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id            UUID NOT NULL
                            REFERENCES ai.chunks (id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL,
    float_vector        FLOAT4[] NOT NULL                       -- P7a; upgraded to vector(768) in P7b (see block below)
);

CREATE INDEX IF NOT EXISTS ix_ai_embeddings_org_id
    ON ai.embeddings (organization_id);
CREATE INDEX IF NOT EXISTS ix_ai_embeddings_chunk_id
    ON ai.embeddings (chunk_id);

ALTER TABLE ai.embeddings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='ai' AND tablename='embeddings'
          AND policyname='ai_embeddings_org_isolation'
    ) THEN
        CREATE POLICY ai_embeddings_org_isolation ON ai.embeddings
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

-- =============================================================================
-- P7b UPGRADE DDL (DO NOT RUN in P7a — documentation of the deferred upgrade).
-- =============================================================================
-- pgvector is already enabled in this DB (CREATE EXTENSION vector — present).
-- When Pgvector.EntityFrameworkCore is wired in P7b, replace the FLOAT4[] column
-- with a real vector(768) column and add an HNSW cosine index. Indicative DDL:
--
--   ALTER TABLE ai.embeddings ADD COLUMN embedding vector(768);
--   UPDATE ai.embeddings SET embedding = float_vector::vector;   -- backfill
--   ALTER TABLE ai.embeddings ALTER COLUMN embedding SET NOT NULL;
--   CREATE INDEX ix_ai_embeddings_hnsw
--       ON ai.embeddings USING hnsw (embedding vector_cosine_ops);
--   -- then mark float_vector DEPRECATED (keep per additive rule) or drop in a
--   -- later major migration once all readers use `embedding`.
--
-- Dimension 768 matches the P7a embedding model; confirm against the live model
-- before applying (text-embedding-004 / Vertex = 768).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ai.interactions
-- APPEND-ONLY audit of every AI call (provider/model/tokens/latency/budget).
-- organization_id is NULLABLE (AiInteraction.OrganizationId is Guid?). Immutable
-- at the DB level reusing the accounting.edit_log (071) pattern.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai.interactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID,                                   -- nullable per EF
    user_id             VARCHAR(128) NOT NULL,
    feature_code        VARCHAR(64) NOT NULL,
    provider            VARCHAR(32) NOT NULL,
    model               VARCHAR(64) NOT NULL,
    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    latency_ms          INTEGER NOT NULL,
    budget_exceeded     BOOLEAN NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          TEXT,
    updated_by          TEXT
);

CREATE INDEX IF NOT EXISTS ix_ai_interactions_org_id
    ON ai.interactions (organization_id);
CREATE INDEX IF NOT EXISTS ix_ai_interactions_created_at
    ON ai.interactions (created_at);
CREATE INDEX IF NOT EXISTS ix_ai_interactions_org_feature_date
    ON ai.interactions (organization_id, feature_code, created_at);

ALTER TABLE ai.interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='ai' AND tablename='interactions'
          AND policyname='ai_interactions_org_isolation'
    ) THEN
        CREATE POLICY ai_interactions_org_isolation ON ai.interactions
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
-- accounting.edit_log (071) immutability approach.
CREATE OR REPLACE FUNCTION ai.reject_interaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'ai.interactions is append-only (AI usage/audit log). % is not permitted.',
        TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_interactions_no_update ON ai.interactions;
CREATE TRIGGER trg_ai_interactions_no_update
    BEFORE UPDATE ON ai.interactions
    FOR EACH ROW EXECUTE FUNCTION ai.reject_interaction_mutation();

DROP TRIGGER IF EXISTS trg_ai_interactions_no_delete ON ai.interactions;
CREATE TRIGGER trg_ai_interactions_no_delete
    BEFORE DELETE ON ai.interactions
    FOR EACH ROW EXECUTE FUNCTION ai.reject_interaction_mutation();

DROP TRIGGER IF EXISTS trg_ai_interactions_no_truncate ON ai.interactions;
CREATE TRIGGER trg_ai_interactions_no_truncate
    BEFORE TRUNCATE ON ai.interactions
    FOR EACH STATEMENT EXECUTE FUNCTION ai.reject_interaction_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON ai.interactions FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snapaccount_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON ai.interactions FROM snapaccount_app;
        GRANT  SELECT, INSERT ON ai.interactions TO snapaccount_app;
    END IF;
END $$;

COMMENT ON TABLE ai.chunks IS 'RAG document chunks (one per text chunk). UNIQUE(document_id, chunk_index).';
COMMENT ON TABLE ai.embeddings IS 'P7a: FLOAT4[] vector, 1:1 with ai.chunks (ON DELETE CASCADE). P7b upgrades float_vector -> vector(768)+HNSW (see DDL block in 075).';
COMMENT ON TABLE ai.interactions IS 'APPEND-ONLY AI usage/audit log. Immutable (UPDATE/DELETE/TRUNCATE rejected). organization_id nullable.';
COMMENT ON COLUMN ai.embeddings.float_vector IS 'P7a embedding as FLOAT4[]. P7b: replace with vector(768) + HNSW cosine index (pgvector already enabled).';

-- =============================================================================
-- End 075_ai_chunks_embeddings_interactions.sql
-- =============================================================================
