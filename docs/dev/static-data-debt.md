# Static-Data Debt — Phase 7

Inventory of admin / mobile pages that still render hard-coded mock arrays
instead of fetching from the API. Each entry includes the file:line, the mock
identifier, and the backend endpoint(s) that would need to exist to remove it.

Greppable marker comment (added to live offenders during PR #7):
```
// STATIC-DATA-DEBT-7
```

---

## 🔴 Pages with mock business data (must be migrated)

### `src/admin/src/pages/dashboard/DashboardPage.tsx`
- `mockDashboardData` (line ~26) — pendingDocuments, gstReturnsDueToday, ITR pending, callbacks open, loans active.
- `mockActivityData{7,30,90}D` (lines ~36–61) — time-series for activity charts.
- `mockTeamWorkload` (line ~69) — agent-level open/completed counts.
- `mockChatQueue` (line ~77) — top-N waiting chat threads.
- `mockAuditEvents` (line ~83) — recent audit-log tail.

**Backend gaps (all need new CQRS slices):**
- `GET /admin/dashboard/stats` — counts across documents, gst, itr, callbacks, loans
- `GET /admin/dashboard/activity?range=7D|30D|90D` — daily aggregates by domain
- `GET /admin/dashboard/team-workload` — per-user assigned/completed/SLA counts
- `GET /admin/chat/queue?limit=N` — currently no aggregation across ChatService
- `GET /admin/audit-events?limit=N` — needs a cross-service audit collector or per-service feed

### `src/admin/src/pages/users/UserDetailPage.tsx`
- `mockUser` (line ~15) — full user/business profile
- `mockDocuments` (line ~22) — recent docs for this user
- `mockGstReturns` (line ~28) — recent GST returns
- `mockAuditLog` (line ~34) — per-user audit tail

**Backend gaps:**
- `GET /admin/users/{id}` — exists in AuthService but not exposed cleanly to admin
- `GET /admin/users/{id}/documents` — DocumentService cross-user query (admin-only)
- `GET /admin/users/{id}/gst-returns` — GstService cross-user query (admin-only)
- `GET /admin/users/{id}/audit-log?limit=N` — same audit collector as Dashboard

### `src/admin/src/pages/gst/GstFilingQueuePage.tsx`
- `availableCAs` (line ~75) — should come from `GET /auth/users?role=CA`

### `src/admin/src/pages/users/UsersListPage.tsx` (suspect — verify)
- Should be fully wired via `GET /admin/users?...` but worth re-checking.

---

## 🟢 Resolved in PR #7

### `src/admin/src/pages/settings/sections/PartnerBanksSettings.tsx`
- `mockBanks` removed; now fetches from `GET /loans/partner-banks` via the new
  `getPartnerBanksLite()` helper in `lib/loanApi.ts`. Loading / error / empty
  states wired. The seed at `database/dev-seed/200_dev_business_data.sql`
  inserts two banks (HDFC, ICICI) so the section renders against real data.

## 🟢 Resolved in PR #8

### `src/admin/src/pages/dashboard/DashboardPage.tsx` — top counters
- `mockDashboardData` (5 cross-service counts) replaced with a real
  `getAdminDashboardStats()` fan-out call defined in `lib/dashboardApi.ts`.
- Each service now has its own thin `GET /<service>/admin/dashboard-stats`
  query handler that returns just the count it owns (DocumentService:
  pending docs; GstService: returns due today; ItrService: filings awaiting
  e-verification; CallbackService: open callbacks; LoanService: active apps).
- Frontend fans out 5 parallel requests via `Promise.all`; failed services
  land in `data.errors` and the affected count is undefined so the UI can
  render the rest. Threshold flags (`pendingDocumentsOverThreshold`,
  `gstReturnsDueTodayUrgent`) are now derived in the component, not
  fabricated server-side.
- Refresh interval 30s preserved.
- **DashboardPage is now fully API-driven** as of PR #12. No mocks remain.

## 🟢 Resolved in PR #12

### `DashboardPage.tsx` — recent audit events widget (last DashboardPage mock)
- Removed `mockAuditEvents`. `getAdminAuditEvents(limit)` reads from the
  partitioned `shared.audit_log` table that all 12 services already write
  to (see migration 012 — pre-existing infrastructure).
- New AuthService entity `AuditLogEntry` is keyless-on-insert, mapped to
  `shared.audit_log`, **excluded from EF migrations** (table is owned by
  the schema migration, not by EF).
- `GET /auth/admin/audit-events?limit=N` (max 100) returns the most-recent
  non-sensitive rows ordered by event_time DESC.
- Sensitive PII rows (`is_sensitive = TRUE`) are filtered server-side so
  this endpoint can't be used as an exfiltration channel.
- 30s refetch on the dashboard.

### `src/admin/src/pages/dashboard/DashboardPage.tsx` — overall
- All 5 widgets on DashboardPage are now wired to live APIs (top counters,
  activity chart, chat queue, team workload, audit events).
- Page-level mock removal complete across PRs #8–#12.

## 🟢 Resolved in PR #11

### `DashboardPage.tsx` — team workload widget
- Removed `mockTeamWorkload`. New `getAdminTeamWorkload()` fans out 3 calls:
  - `GET /auth/admin/team-members` (operational roles only — DATA_ENTRY,
    SUPPORT_EXEC, CA, OPS_MANAGER, SYS_ADMIN; excludes BUSINESS_OWNER /
    EMPLOYEE)
  - `GET /callbacks/admin/workload-by-user` (per-assignee active vs completed)
  - `GET /chat/admin/workload-by-user` (per-assignee open vs resolved)
- Frontend merges by userId, sums callback + chat workload per user, sorts
  by assigned DESC. Members with zero assignments still appear.
- 1-minute refetch.
- **slaBreaches stays at 0** — no SLA tracker exists in any service yet;
  field marked TODO. Renders the green "OK" pill for everyone today.

## 🟢 Resolved in PR #10

### `DashboardPage.tsx` — chat queue widget
- Removed `mockChatQueue`. New `getAdminChatQueueSnapshot(limit)` fetches
  `GET /chat/admin/queue-snapshot?limit=N` (top-N oldest open unassigned
  threads, ordered by creation time). 30s refetch.
- Backend: `ChatService.Application.Dashboard.Queries.GetQueueSnapshot`
  with permission `admin.dashboard.read`. Empty state shows "No chat
  threads waiting for an agent." Open button deep-links to
  `/chat?thread={id}`.

## 🟢 Resolved in PR #9

### `DashboardPage.tsx` — activity chart
- Removed `mockActivityData{7,30,90}D` and the `activityDataByPeriod` map.
- New `getAdminDashboardActivity(range)` helper in `lib/dashboardApi.ts`
  fans out 3 parallel calls to `/<svc>/admin/activity?range=` (Documents,
  Gst, Itr), merges by date, fills missing days with zeros, formats the
  date column for the recharts axis. Failed services land in errors and
  the affected series stays at zero — chart still renders.
- 1-minute refetch interval (separate from the 30s stats interval).
- Backend: 3 new admin-only IQuery slices each returning a daily
  `(DateOnly, int)` series with FluentValidation on the range whitelist.

---

## 🟢 Pages already wired correctly (audited, no debt)

- All `loans/*` pages — `LoansListPage`, `LoanDetailPage`, `BankCommunicationsPage`
  use TanStack Query + `lib/loanApi.ts` against real endpoints.
- All `gst/*` pages except `GstFilingQueuePage` (above).
- All `itr/*` pages.
- All `callbacks/*` pages.
- All `chat/*` pages.
- All `subscriptions/*` pages.
- All `notifications/*` pages.
- All `reports/*` pages.
- `settings/sections/*` apart from `PartnerBanksSettings` (now fixed) — these
  surface UI options (LANGUAGES, CATEGORIES) which are correct as constants.

---

## How to find regressions

```bash
# Find mock identifiers
grep -RnE "const mock[A-Z]|const MOCK_" src/admin/src/pages

# Find STATIC-DATA-DEBT-7 markers (added to live offenders)
grep -Rn "STATIC-DATA-DEBT-7" src/admin/src
```

Any new page added must pull data from `lib/*Api.ts` via TanStack Query —
**never** from inline arrays.
