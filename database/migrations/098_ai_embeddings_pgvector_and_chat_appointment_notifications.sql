-- =============================================================================
-- Migration 098: AI embeddings pgvector upgrade (DG-CHAT-01)
-- =============================================================================
-- Applies the deferred P7b DDL documented in migration 075:
--   • Adds vector(768) column to ai.embeddings
--   • Backfills from float_vector (cast float4[] → vector)
--   • Adds HNSW cosine-distance index (vector_cosine_ops)
--
-- float_vector is KEPT per additive-migration rule (readers are upgraded
-- to use `embedding` incrementally; float_vector may be dropped in a
-- future major clean-up migration once all readers are confirmed on `embedding`).
--
-- DG-CHAT-03 notification catalog entries are seeded at application startup
-- by NotificationSeeder (Platform service) — no SQL rows required here.
-- =============================================================================

-- Ensure the pgvector extension is enabled (no-op if already present from init/075)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Add nullable vector(768) column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ai.embeddings
    ADD COLUMN IF NOT EXISTS embedding vector(768);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Backfill from float_vector (where dimension = 768)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    UPDATE ai.embeddings
    SET    embedding = float_vector::vector
    WHERE  embedding IS NULL
      AND  float_vector IS NOT NULL
      AND  array_length(float_vector, 1) = 768;
END $$;

-- For P7a zero-vector mock rows (empty or wrong-dim float_vector),
-- store a zero vector so NOT NULL can be set without blocking.
DO $$
BEGIN
    UPDATE ai.embeddings
    SET    embedding = array_fill(0::float4, ARRAY[768])::vector
    WHERE  embedding IS NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Set NOT NULL after backfill
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ai.embeddings
    ALTER COLUMN embedding SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: HNSW cosine-distance index for fast ANN retrieval
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_ai_embeddings_hnsw
    ON ai.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON COLUMN ai.embeddings.embedding IS
    'P7b: 768-dimensional pgvector column indexed via HNSW vector_cosine_ops for '
    'cosine top-k retrieval. float_vector (P7a FLOAT4[]) retained for additive-migration compliance.';
