---
name: dg-dash-01-mobile-home-dashboard
description: DG-DASH-01 implementation — GET /accounting/dashboard-metrics and GET /accounting/recent-activities for mobile Home screen
metadata:
  type: project
---

DG-DASH-01 (critical): Mobile Home dashboard KPIs and activity feed were calling non-existent backend endpoints; Home screen always showed zeros and empty activity list.

**Why:** HomeScreen.tsx line 83 calls GET '/accounting/dashboard-metrics' and line 100 calls GET '/accounting/recent-activities?limit=5'. Neither route existed — confirmed by grep across backend/.

**Implementation (2026-06-28):**

Two new query files added to Finance.Application (Accounting module):

1. `Finance.Application/Accounting/Dashboard/Queries/GetDashboardMetrics/GetDashboardMetricsQuery.cs`
   - `GetDashboardMetricsQuery(Guid OrgId)` — `[RequiresPermission("accounting.reports.read")]`
   - Handler injects both `IAccountingDbContext` (ledger entries) and `IGstDbContext` (gst returns)
   - Computes current Indian FY (fyYear = calendar year when month >= 4, else year-1)
   - Indian FY period month: April=1 ... March=12
   - YTD totals from accounting.ledger_entries (PostingStatus.Approved, INCOME credit side / EXPENSE debit side)
   - MoM trend % from current vs prior period (handles April→March prior-FY crossover)
   - GstPayable = SUM(NetTaxPayable) on non-FILED gst returns for org
   - Returns `DashboardMetricsDto` matching mobile `DashboardMetrics` interface exactly

2. `Finance.Application/Accounting/Dashboard/Queries/GetRecentActivities/GetRecentActivitiesQuery.cs`
   - `GetRecentActivitiesQuery(Guid OrgId, int Limit = 5)` — same permission
   - Handler injects `IDocumentDbContext` + `IGstDbContext`
   - Merges recent document uploads and GST return updates, sorted by timestamp desc
   - Returns `ActivityItemDto[]` matching mobile `ActivityItem` interface (id, type, description, amount?, timestamp)
   - Activity types: "document" and "gst" (covers most mobile Home scenarios)

Endpoint wiring in `Finance.WebApi/Endpoints/Accounting/Accounting.cs`:
- `GET /accounting/dashboard-metrics` → `GetDashboardMetrics`
- `GET /accounting/recent-activities?limit=N` → `GetRecentActivities`
- Both: `.RequireAuthorization().RequireRateLimiting("standard")`

DB migration: `database/migrations/094_accounting_dashboard_metrics_permission.sql`
- Seeds `accounting.reports.read` permission (was referenced in code but never seeded in DB)
- Grants to same roles as `accounting.journal.review` (accounts_clerk, CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN)
- Idempotent via ON CONFLICT DO NOTHING

**Cross-module DI pattern:** All three DbContexts (AccountingDbContext, GstDbContext, DocumentDbContext) are registered in the Finance composite's single DI container — cross-module handler injection works without any DI changes.

**Build:** `dotnet build Services/AppHost/AppHost.csproj` → 0 errors, 22 warnings (pre-existing).

**How to apply:** When adding other dashboard/aggregation endpoints that span multiple modules in Finance composite, inject the needed DbContext interfaces directly into the handler. No cross-service HTTP calls needed — they're all in the same process.
