---
name: analytics-suite-dg-dash-06
description: DG-DASH-06 Admin Reports & Analytics suite (Screens 100-103) implementation status and patterns
metadata:
  type: project
---

DG-DASH-06 implemented 2026-06-28 on branch feature/repository-refactor.

**What was built:**
- `src/admin/src/lib/analyticsApi.ts` — Zod-typed API client for all 4 analytics screens. Calls real backend endpoints where they exist (dashboard-stats, /subscriptions/mrr). Mock-first fallback for operational aggregation and compliance endpoints not yet in backend.
- `src/admin/src/pages/reports/OperationalReportPage.tsx` — Screen 100
- `src/admin/src/pages/reports/PlatformRevenuePage.tsx` — Screen 101 (wired to real /subscriptions/mrr)
- `src/admin/src/pages/reports/UserAnalyticsPage.tsx` — Screen 102
- `src/admin/src/pages/reports/ComplianceReportPage.tsx` — Screen 103

**Routes added in router.tsx:**
- /reports/operational → OperationalReportPage
- /reports/revenue → PlatformRevenuePage
- /reports/users → UserAnalyticsPage
- /reports/compliance → ComplianceReportPage

**Sidebar:** 4 sub-items added after 'Reports', gated by admin.dashboard.read + SUPER_ADMIN/OPERATIONS_MANAGER.

**i18n:** All analytics.* keys added to en.json, hi.json, bn.json (flat dotted keys, parity maintained).

**Backend gaps:** The operational aggregation and compliance endpoints don't exist in backend yet. analyticsApi.ts uses a "mock-first, real-data-enriched" pattern — it calls existing dashboard-stats endpoints and enriches with mock trend data. Backend-agent needs to add /analytics/operational, /analytics/users, /analytics/compliance to fully hydrate these screens.

**Build status:** tsc passes clean, ESLint 0 warnings, vite builds in ~2.4s.

**Patterns established:**
- `ErrorBoundary scope` must be `'pane' | 'route'` — not 'page' (runtime type check caught this)
- Recharts `Tooltip formatter` type must accept `unknown`, not specific types (recharts types are `ValueType`)
- `EmptyState` variants: generic, callbacks, chat.thread, chat.inbox, reports, subscriptions, team, search.noResults, notice.inbox, loans.applications — no 'error' variant
- `Skeleton` variants: row, card, list, shell, dataTableDense, chart, pdf — no 'dataTable' variant
