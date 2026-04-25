-- =============================================================================
-- 000_init.sql
-- SnapAccount — Database Initialization
-- Run this file FIRST before any service schema migrations.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4() (fallback)
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram indexes for ILIKE search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN indexes for composite searches

-- =============================================================================
-- Create all service schemas
-- =============================================================================

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

-- =============================================================================
-- Set default search path (applications should override per service)
-- =============================================================================

ALTER DATABASE snapaccount SET search_path TO shared, public;

-- =============================================================================
-- Shared trigger function: auto-update updated_at on row modification
-- =============================================================================

CREATE OR REPLACE FUNCTION shared.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION shared.set_updated_at() IS
  'Trigger function to auto-update updated_at timestamp on every row update.';

-- =============================================================================
-- Shared trigger function: auto-update updated_at — installed per-schema
-- Each migration file calls CREATE TRIGGER ... EXECUTE FUNCTION shared.set_updated_at()
-- =============================================================================
