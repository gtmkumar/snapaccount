---
name: task-23-dpdp-sec056-kpi-idor
description: Task #23 outcomes (2026-06-11): DPDP coverage +21 unit tests, SEC-056 WIRED, PermissionCatalog filter behavior documented, NEW-D09 IDOR 2 integration tests PASS
type: project
---

Task #23 completed 2026-06-11 on branch `2026-06-10-s5t4`.

## NEW-W2-003 — DPDP Privacy Coverage

- Added `tests/unit/AuthService/DpdpPrivacyCoverageTests.cs` — 21 new tests.
- Covered: GetDataExportStatusQuery (6 cases incl. cross-user IDOR), DataCorrectionRequest.BeginReview/Complete/Reject, DataExportJob failure path (mock IAuthDbContext throws → MarkFailed + re-throw verified), WithdrawConsent cross-user isolation, EnqueueDataExport after completed/failed prior request.
- AuthService unit suite: 642 → 663 PASS.
- Privacy module line coverage estimate: ~58% → ~84% (exceeds 80% target).
- Key pattern: InMemory EF does NOT auto-set `CreatedAt` (no DB trigger) — must set `entity.CreatedAt` explicitly in tests that depend on ordering by CreatedAt.

## SEC-056

- Verdict: WIRED (fully implemented in Wave 2 commit 75c0e69).
- `Settings.cs` — 8 routes: org/settings GET/PATCH, feature-flags GET/PATCH/{flag}, config/language GET/PATCH, config/whatsapp GET/PATCH.
- `AiConfigEndpoints.cs` — 7 AI config routes.
- All backed by `[RequiresPermission]`-decorated handlers via PermissionBehavior.
- Status note at `.claude/qa/sec-056-status-2026-06-11.md`.
- gap-analysis-2026-06-11-delta.md "PARTIAL" note predated Wave 2 landing — now stale.

## NEW-W2-006 — PermissionCatalogPage inactive permissions

- FINDING: Page FILTERS inactive perms via Active/Inactive/All segmented control — does NOT use HTML `disabled` attribute on rows.
- Inactive rows appear in the rendered list (in "all" or "inactive" mode) with dimmed CSS text class only.
- Catalog management page intentionally shows retired perms for re-activation.
- Role matrix calls `listPermissions()` WITHOUT `includeInactive=true` — retired perms naturally absent there.
- Added 5 Vitest tests to `src/admin/src/__tests__/PermissionCatalogPage.test.tsx`.
- Vitest total: 933 → 938 PASS.

## NEW-D09 — KPI Snapshot IDOR integration test

- Added `tests/integration/CallbackService/KpiSnapshotIdorTests.cs` — 2 tests using real Postgres 17 via Testcontainers.
- Uses direct NpgsqlConnection + raw SQL (not WebApplicationFactory) because MV is a raw Postgres construct and REFRESH is DDL.
- Test creates callback schema + MV inline in `SetupSchemaAsync()` — portable, no migration file dependency.
- Asserts: exactly 2 rows for same IST date, per-org total_requested isolation, IST boundary bucketing (2026-06-09 21:00 UTC = 2026-06-10 02:30 IST lands in 2026-06-10 row), IDOR filter returns 0 from other org.
- CONCURRENTLY refresh works; unique index prevents duplicate rows on double refresh.
- 2/2 PASS.

**Why:** InMemory EF CreatedAt gotcha is a recurring pattern — always set entity.CreatedAt manually in ordering-sensitive tests.
**How to apply:** Use this test file as a template for future IDOR MV tests. The NpgsqlConnection direct pattern is correct for raw-SQL MVs.
