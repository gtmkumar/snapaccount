-- =============================================================================
-- 069_itr_filings_reviewed_by_ca_id.sql
-- Phase 7 sweep. Closes the remaining EF<->SQL divergence behind the live 500
--   42703: column f.reviewed_by_ca_id does not exist
-- on the ITR admin listing (next column after the 068 anonymization fix).
--
-- The Filing entity exposes ReviewedByCaId (Guid?, nullable — the CA reviewer's
-- user id). It has NO explicit HasColumnName in FilingConfiguration, so EF maps
-- it by the default snake_case convention to `reviewed_by_ca_id`. itr.filings
-- lacks that column, so every SELECT projecting it 500s.
--
-- Fix: ADD COLUMN reviewed_by_ca_id UUID (nullable). Indexed with a partial
-- btree (WHERE NOT NULL) to support reviewer-lookup queries, mirroring the
-- existing idx_filings_ca_reviewer pattern.
--
-- NOTE — orphan column ca_reviewer_id (NOT touched): itr.filings already has a
-- column `ca_reviewer_id` (uuid, nullable) with a partial index
-- idx_filings_ca_reviewer. That column is NOT mapped by any EF entity property
-- (ReviewedByCaId maps to reviewed_by_ca_id, not ca_reviewer_id) and is empty
-- (0 rows). Per the additive-only rule (Phase 2+: never rename/drop), we do NOT
-- rename ca_reviewer_id -> reviewed_by_ca_id; we add the EF-expected column
-- alongside it. Whether to backfill from / deprecate ca_reviewer_id is a
-- backend/data-model decision (flagged in docs + the orchestrator handoff). The
-- old column is left in place, marked below.
-- -- DEPRECATED: superseded by reviewed_by_ca_id; unmapped orphan, kept for
-- -- additive-safety, deprecated in Phase 7 (migration 069). Backfill/drop is a
-- -- backend decision.
--
-- ADDITIVE only. No column is renamed, dropped, or re-typed. Re-runnable: every
-- statement is guarded (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- Verified by a second back-to-back apply under ON_ERROR_STOP=1.
--
-- Conventions: matches 060-068 (idempotent guards, COMMENT ON, snake_case,
-- UUID). No EF migration exists for ItrService — this SQL file is canonical.
--
-- Depends on: itr.filings (ITR schema), migration 068.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- itr.filings — CA reviewer user id (EF: Filing.ReviewedByCaId)
-- -----------------------------------------------------------------------------
ALTER TABLE itr.filings
    ADD COLUMN IF NOT EXISTS reviewed_by_ca_id UUID;

COMMENT ON COLUMN itr.filings.reviewed_by_ca_id IS
    'CA reviewer user id (auth.users by value, cross-schema — no FK) who reviewed/approved/rejected this filing. Mapped from Filing.ReviewedByCaId. NULL = not yet CA-reviewed. Added in migration 069. Supersedes the unmapped orphan column ca_reviewer_id.';

-- Partial index (reviewer is sparse) for "filings reviewed by CA X" / reviewer
-- workload lookups, mirroring idx_filings_ca_reviewer on the orphan column.
CREATE INDEX IF NOT EXISTS idx_filings_reviewed_by_ca_id
    ON itr.filings (reviewed_by_ca_id)
    WHERE reviewed_by_ca_id IS NOT NULL;

COMMENT ON INDEX itr.idx_filings_reviewed_by_ca_id IS
    'Partial btree on the CA reviewer id (NOT NULL only) for reviewer-lookup / workload queries. Added in migration 069.';

-- =============================================================================
-- End 069_itr_filings_reviewed_by_ca_id.sql
-- =============================================================================
