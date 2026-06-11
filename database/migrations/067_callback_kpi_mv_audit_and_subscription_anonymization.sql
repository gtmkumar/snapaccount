-- =============================================================================
-- 067_callback_kpi_mv_audit_and_subscription_anonymization.sql
-- Phase 7 sweep. Two unrelated, fully-additive/idempotent concerns bundled per
-- the pre-approved orchestrator handoffs:
--
--   (A) NEW-D09 — audit hardening of the callback.kpi_daily_snapshot materialized
--       view. Defensively (re-)asserts the unique index that REFRESH MATERIALIZED
--       VIEW CONCURRENTLY requires. Audit finding: the MV is ALREADY org-isolated
--       (org_id in SELECT + GROUP BY) and the unique index
--       uq_kpi_daily_snapshot_org_date (org_id, snapshot_date) ALREADY exists from
--       018_callback_schema.sql, so this is a guard, not a fix. It is included so
--       the invariant is reasserted on any DB whose 018 was hand-edited or whose
--       MV was rebuilt without the index. See docs/database/schema-overview.md
--       "Audit: callback.kpi_daily_snapshot (NEW-D09)".
--
--   (B) HANDOFF-SWEEP-02 — DPDP Act 2023 erasure metadata on
--       subscription.subscription. Adds anonymization_reason + anonymized_at so the
--       SubscriptionService can record WHY and WHEN a subscription row's PII was
--       anonymized during a right-to-erasure request, without hard-deleting the
--       billing/audit record (7-year retention vs DPDP erasure reconciliation).
--
-- ADDITIVE only. No column is renamed, dropped, or re-typed. Re-runnable: every
-- statement is guarded (IF NOT EXISTS / CREATE OR REPLACE-equivalent). Verified by
-- a second back-to-back apply under ON_ERROR_STOP=1.
--
-- Conventions: matches 060-066 (idempotent guards, COMMENT ON, TIMESTAMPTZ,
-- snake_case, cross-schema references by value). No EF migration exists for
-- SubscriptionService — this SQL file is canonical (see 064).
--
-- Depends on: 018_callback_schema.sql (MV + callbacks), 037_subscription_schema.sql
--             (subscription.subscription). No dependency on 064.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (A) NEW-D09 — callback.kpi_daily_snapshot unique-index guard (CONCURRENTLY)
-- -----------------------------------------------------------------------------
-- The MV groups and filters by org_id, so no cross-org aggregation can leak:
-- every output row is scoped to exactly one organization. REFRESH MATERIALIZED
-- VIEW CONCURRENTLY requires a UNIQUE index on the MV; (org_id, snapshot_date) is
-- its natural key. We reassert it idempotently. CREATE INDEX IF NOT EXISTS on a
-- materialized view is a no-op when the index already exists, so this is safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_daily_snapshot_org_date
    ON callback.kpi_daily_snapshot (org_id, snapshot_date);

-- Secondary (non-unique) index for date-range scans across orgs (platform
-- analytics). Reasserted idempotently for the same reason.
CREATE INDEX IF NOT EXISTS idx_kpi_daily_snapshot_date
    ON callback.kpi_daily_snapshot (snapshot_date);

-- Hard-assert the CONCURRENTLY precondition so a malformed/older deployment fails
-- loudly here rather than silently at the first scheduled refresh. Raises if no
-- UNIQUE index covering the MV exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_index      i
        JOIN   pg_class      ic ON ic.oid = i.indexrelid
        JOIN   pg_class      mc ON mc.oid = i.indrelid
        JOIN   pg_namespace  n  ON n.oid  = mc.relnamespace
        WHERE  n.nspname = 'callback'
        AND    mc.relname = 'kpi_daily_snapshot'
        AND    mc.relkind = 'm'          -- materialized view
        AND    i.indisunique
    ) THEN
        RAISE EXCEPTION
            'callback.kpi_daily_snapshot has no UNIQUE index; REFRESH MATERIALIZED VIEW CONCURRENTLY will fail. Expected uq_kpi_daily_snapshot_org_date (org_id, snapshot_date).';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- (B) HANDOFF-SWEEP-02 — subscription.subscription DPDP erasure metadata
-- -----------------------------------------------------------------------------
ALTER TABLE subscription.subscription
    ADD COLUMN IF NOT EXISTS anonymization_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ;

COMMENT ON COLUMN subscription.subscription.anonymization_reason IS
    'DPDP Act 2023 erasure metadata: free-text reason the subscription PII was anonymized (e.g. data-principal erasure request id). NULL = not anonymized. Added in migration 067.';
COMMENT ON COLUMN subscription.subscription.anonymized_at IS
    'DPDP Act 2023 erasure metadata: timestamp the subscription PII was anonymized. The billing/audit row is retained (7-year retention) but its PII fields are scrubbed. NULL = not anonymized. Added in migration 067.';

-- =============================================================================
-- End 067_callback_kpi_mv_audit_and_subscription_anonymization.sql
-- =============================================================================
