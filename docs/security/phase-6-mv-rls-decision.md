# P6-HANDOFF-04: Materialized View RLS Decision

**Date:** 2026-04-25
**Decided by:** security-reviewer agent
**Reviewed item:** `callback.kpi_daily_snapshot` — Postgres does not support RLS on materialized views

---

## Context

Migration `018_callback_schema.sql` creates `callback.kpi_daily_snapshot` as a MATERIALIZED VIEW aggregating per-org daily callback KPIs. PostgreSQL does not support `ENABLE ROW LEVEL SECURITY` on materialized views. The migration comment explicitly flags this and asks security-reviewer to choose between:

- **(a)** API-layer `org_id` filter from `ICurrentUser.OrganizationId`
- **(b)** `SECURITY INVOKER` SQL function wrapper providing DB-layer enforcement

---

## Decision

**Option (a) accepted — API-layer org_id filter.**

### Rationale

1. **MV structure already org-scoped.** The view groups by `(c.org_id, snapshot_date)`. Every row in the MV is identified by its `org_id`. A `WHERE org_id = @orgId` filter at the API layer is semantically equivalent to RLS on the underlying table — no row from another org can appear in the filtered result set.

2. **SECURITY INVOKER wrapper adds complexity without proportional security gain.** Wrapping the MV in a SQL function would require: a new migration, a dedicated DB role, and plumbing a function call through EF Core (raw SQL). The backing `callback.callbacks` table already has RLS via `callbacks_org_or_assignee_isolation`. The MV is a read-only rollup; it does not expose raw user data rows.

3. **ICurrentUser.OrganizationId is cryptographically derived.** The organization ID in the JWT claim originates from Firebase Auth middleware validation. It cannot be spoofed by the calling user. Filtering the MV query by this value provides the same organizational isolation guarantee as an RLS policy.

4. **Existing precedent.** The `ListCallbacks` query uses the same pattern (org_id from ICurrentUser) and it was accepted as the authoritative filter for the list endpoint.

---

## Conditions of Acceptance

The following conditions MUST be met before this decision is considered fully closed:

| Condition | Owner | Status |
|-----------|-------|--------|
| Full KPI query implementation adds `WHERE org_id = @orgId` from `ICurrentUser.OrganizationId` | backend-agent | OPEN — KPI endpoint currently returns placeholder |
| Integration test: user from Org A cannot retrieve KPI data for Org B | qa-web or backend-agent | OPEN |
| Code comment at KPI endpoint references this document | backend-agent | OPEN |

---

## What Was Rejected and Why

**Option (b) — SECURITY INVOKER SQL function** was considered and rejected because:

- It does not provide additional protection beyond the API-layer filter for this specific MV shape (pre-aggregated, keyed by org_id).
- It introduces a non-EF-Core query path that bypasses the standard repository pattern and is harder to audit.
- It requires a new Postgres role with specific table-level SELECT grants on the MV, which is operational overhead without commensurate benefit.

If the MV schema were to change to include raw `user_id` or PII rows (not aggregates), this decision should be revisited and option (b) reconsidered.

---

## Open Security Notes for Phase 6B

- When the full KPI query replaces the placeholder `GetKpiSnapshot` handler, the security-reviewer agent must verify the `WHERE org_id = @orgId` clause is present in the generated SQL (via EF Core query logging).
- The MV refresh job (`REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot`) runs as a Cloud Scheduler + Pub/Sub job (P6-HANDOFF-07). The Cloud Scheduler SA has been granted `pubsub.publisher` only; it does not have direct DB access. The actual REFRESH is executed by a backend job — verify that job runs under a non-superuser role with only `REFRESH MATERIALIZED VIEW` privilege on this specific MV.

---

*Document created by security-reviewer agent — Phase 6A+6E final gate*
*Reference: docs/security/security-report.md — Phase 6 Findings, P6-HANDOFF-04*
