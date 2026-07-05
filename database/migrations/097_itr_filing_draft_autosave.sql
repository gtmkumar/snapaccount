-- =============================================================================
-- Migration 097: ITR filing gap fixes (DG-ITR-02..06)
--   1. Add ca_notes column (separate from ca_review_notes / rejection reason)
--   2. Add user_id NOT NULL constraint already exists — verify the column; backfill safety
--   3. The existing CHECK on status includes CA_REJECTED (not REJECTED_BY_CA) — no DDL change
--      needed; the entity code will be fixed to use CA_REJECTED.
-- =============================================================================

-- DG-ITR-04: dedicated ca_notes column, distinct from ca_review_notes (rejection reason)
ALTER TABLE itr.filings
    ADD COLUMN IF NOT EXISTS ca_notes TEXT;

COMMENT ON COLUMN itr.filings.ca_notes IS
    'CA working notes (autosaved from the admin CA tax-computation panel). Distinct from
     ca_review_notes which stores the CA rejection reason. Added migration 097 (DG-ITR-04).';

-- DG-ITR-05: user_id NOT NULL is already enforced by 024_itr_assessee_filings.sql (line 79).
-- The EF entity was never writing it, so existing rows may have user_id=NULL if any inserts
-- were made via EF. No DDL change needed — the entity fix (backend) handles new rows.
-- We do NOT relax the NOT NULL; the backend fix will populate it.
-- For safety, index already exists (idx_filings_user_id from migration 024).

-- DG-ITR-06: status CHECK constraint already allows CA_REJECTED (024:103). No DDL change.
-- The entity code change (REJECTED_BY_CA → CA_REJECTED) is the only fix needed.
