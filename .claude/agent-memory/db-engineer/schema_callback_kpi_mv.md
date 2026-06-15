---
name: schema-callback-kpi-mv
description: callback.kpi_daily_snapshot materialized view — org isolation, CONCURRENTLY index, IST day-boundary decision, status-vocab drift.
metadata:
  type: project
---

`callback.kpi_daily_snapshot` is a MATERIALIZED VIEW (created in 018_callback_schema.sql), audited under NEW-D09 (migration 067, 2026-06-11). Verdict: ORG-SAFE.

- **Org isolation:** `org_id` is in both SELECT and GROUP BY, so each row aggregates exactly one org — no cross-org leak is structurally possible. The only un-partitioned slice is `snapshot_date`.
- **CONCURRENTLY:** unique index `uq_kpi_daily_snapshot_org_date (org_id, snapshot_date)` (from 018) is what makes `REFRESH MATERIALIZED VIEW CONCURRENTLY` work. Migration 067 reasserts it `IF NOT EXISTS` + a DO block that RAISES if no UNIQUE index covers the MV.
- **Day-boundary DECISION = IST (`Asia/Kolkata`), NOT UTC.** `snapshot_date = date_trunc('day', requested_at AT TIME ZONE 'Asia/Kolkata')::date`. India-only product → KPI days must align to the ops team's working day. Any future MV with a daily bucket for an India product should use the same IST truncation; do not switch to UTC.
- **Status-vocab drift — FIXED in migration 073 (GAP-029, 2026-06-11).** The MV (018) filtered on the original labels `SCHEDULED`/`IN_PROGRESS`/`ESCALATED_TO_CA`, but `056` re-aligned `callback.callbacks.status` to the domain enum `PENDING|ASSIGNED|CONFIRMED|COMPLETED|ESCALATED|CANCELLED`, so those 3 counts were always 0. 073 recreates the MV mapping `count_scheduled←ASSIGNED`, `count_in_progress←CONFIRMED`, `count_escalated←ESCALATED`, **keeping every column name identical** (the EF read model `KpiDailySnapshotConfiguration` + `GetKpiSnapshotQuery` bind to those names; frontend labels them Scheduled/InProgress/Escalated). IST boundary + unique index preserved. Lesson: when an MV's FILTER labels drift from the backing CHECK, fix the predicate but NEVER rename MV columns — verify the EF view-mapping + handler READ-ONLY first.
- MVs cannot have RLS in Postgres; isolation is enforced at the API layer (`GetKpiSnapshotQuery` injects `WHERE org_id = <caller-claim>`).

**Why:** so future MV audits and any new daily-rollup MV reuse the IST decision and the unique-index-for-CONCURRENTLY pattern.
**How to apply:** reuse the IST `date_trunc(... AT TIME ZONE 'Asia/Kolkata')` pattern + a (org_id, day) unique index for any future per-org daily MV; flag status-vocab drift rather than silently fixing it.

See also [[conventions-migrations-ef-parity]].
