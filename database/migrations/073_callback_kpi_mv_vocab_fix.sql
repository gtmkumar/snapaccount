-- =============================================================================
-- 073_callback_kpi_mv_vocab_fix.sql
-- Phase 7 / GAP-029 (LOW) — fix callback.kpi_daily_snapshot status vocabulary.
--
-- PROBLEM
--   callback.kpi_daily_snapshot (created in 018) FILTERs callback rows on status
--   labels 'SCHEDULED', 'IN_PROGRESS' and 'ESCALATED_TO_CA'. Those labels were
--   the ORIGINAL 018 vocabulary, but migration 056 re-aligned
--   callback.callbacks.status to the domain enum vocabulary:
--       PENDING | ASSIGNED | CONFIRMED | COMPLETED | ESCALATED | CANCELLED
--   So the MV's count_scheduled / count_in_progress / count_escalated FILTERs
--   never match any row and are permanently 0.
--
-- FIX (this migration)
--   Recreate the MV mapping the FILTER predicates to the REAL vocabulary, while
--   keeping EVERY column name identical so the backend read path is untouched:
--       count_pending      <- status = 'PENDING'    (unchanged)
--       count_scheduled    <- status = 'ASSIGNED'   (the "scheduled / assigned to agent" state)
--       count_in_progress  <- status = 'CONFIRMED'  (the active in-progress state)
--       count_completed    <- status = 'COMPLETED'  (unchanged)
--       count_cancelled    <- status = 'CANCELLED'  (unchanged)
--       count_escalated    <- status = 'ESCALATED'  (was 'ESCALATED_TO_CA')
--   The IST day-boundary (Asia/Kolkata) and all other measures are preserved.
--
-- The EF read model (CallbackService KpiDailySnapshotConfiguration) and the
-- GetKpiSnapshotQuery handler bind to the column names
--   org_id, snapshot_date, count_pending, count_scheduled, count_in_progress,
--   count_completed, count_cancelled, count_escalated, count_sla_breached,
--   avg_ttr_minutes, avg_csat, total_requested
-- — ALL preserved here, so this change is non-breaking for the backend.
--
-- Idempotent: DROP MATERIALIZED VIEW IF EXISTS + recreate + recreate indexes.
-- Depends on: 018_callback_schema.sql, 056_chat_callback_write_alignment.sql
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS callback.kpi_daily_snapshot;

CREATE MATERIALIZED VIEW callback.kpi_daily_snapshot AS
SELECT
    c.org_id,
    -- IST day-boundary: India-only product; KPI days align to the ops working day.
    date_trunc('day', c.requested_at AT TIME ZONE 'Asia/Kolkata')::date AS snapshot_date,
    COUNT(*) FILTER (WHERE c.status = 'PENDING')    AS count_pending,
    COUNT(*) FILTER (WHERE c.status = 'ASSIGNED')   AS count_scheduled,
    COUNT(*) FILTER (WHERE c.status = 'CONFIRMED')  AS count_in_progress,
    COUNT(*) FILTER (WHERE c.status = 'COMPLETED')  AS count_completed,
    COUNT(*) FILTER (WHERE c.status = 'CANCELLED')  AS count_cancelled,
    COUNT(*) FILTER (WHERE c.status = 'ESCALATED')  AS count_escalated,
    COUNT(*) FILTER (WHERE c.sla_breached = TRUE)   AS count_sla_breached,
    AVG(EXTRACT(EPOCH FROM (c.completed_at - c.requested_at)) / 60.0)
        FILTER (WHERE c.status = 'COMPLETED')       AS avg_ttr_minutes,
    AVG(c.csat_score) FILTER (WHERE c.csat_score IS NOT NULL) AS avg_csat,
    COUNT(*) AS total_requested
FROM callback.callbacks c
WHERE c.deleted_at IS NULL
GROUP BY c.org_id, date_trunc('day', c.requested_at AT TIME ZONE 'Asia/Kolkata');

-- Unique index is what enables REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_daily_snapshot_org_date
    ON callback.kpi_daily_snapshot (org_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_kpi_daily_snapshot_date
    ON callback.kpi_daily_snapshot (snapshot_date);

-- Populate immediately (non-concurrent: MV was just (re)created).
REFRESH MATERIALIZED VIEW callback.kpi_daily_snapshot;

COMMENT ON MATERIALIZED VIEW callback.kpi_daily_snapshot IS
    'Per-org daily callback KPI rollup (IST day-boundary). Status FILTERs map '
    'count_scheduled<-ASSIGNED, count_in_progress<-CONFIRMED, count_escalated<-ESCALATED '
    'to the post-056 domain vocabulary. Column names are stable (EF read model + '
    'GetKpiSnapshotQuery depend on them). Refresh CONCURRENTLY via the unique '
    '(org_id, snapshot_date) index.';

-- =============================================================================
-- End 073_callback_kpi_mv_vocab_fix.sql
-- =============================================================================
