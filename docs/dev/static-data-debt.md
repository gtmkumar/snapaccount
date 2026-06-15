# Static-Data Debt — Phase 7

Inventory of admin / mobile pages that still render hard-coded mock arrays
instead of fetching from the API. Each entry includes the file:line, the mock
identifier, and the backend endpoint(s) that would need to exist to remove it.

Greppable marker comment (added to live offenders during PR #7):
```
// STATIC-DATA-DEBT-7
```

---

## 🔴 CORRECTION — Open debt re-verified 2026-06-10 (gap-analysis review)

The 2026-05-17 "all migrated" claim below is **stale**. A fresh grep
(`grep -RnE "const mock[A-Z]" src/admin/src/pages` excluding tests) finds three
production pages still mock-backed, plus two hardcoded-stat widgets:

| File | Mock | Backend dependency | Tracking |
|------|------|--------------------|----------|
| `pages/documents/DocumentQueuePage.tsx:32` | `mockDocuments` (fake `useQuery`, 300ms delay) | `/documents` admin list exists; needs `lib/documentApi.ts` | GAP-010, frontend F1 |
| `pages/documents/DocumentReviewPage.tsx:31` | `mockFields` (OCR fields + fake doc metadata) | `/documents/{id}` + OCR results exist | GAP-010, frontend F1 |
| `pages/gst/ItcMismatchPage.tsx:23` | `mockMismatches` (fake `useQuery`) | `GetItcMismatchesQuery` / `ReconcileItcCommand` exist server-side | GAP-011, frontend F2 |
| `pages/dashboard/DashboardPage.tsx:~446` | Hardcoded System Health metrics (latency/error rate/OCR depth/DB conns) | Needs devops monitoring proxy (D6) | GAP-052, frontend F6 |
| `pages/settings/SettingsPage.tsx:~85` | Hardcoded Subscription Tier stats (4 plans / 1,247 subscribers / ₹8.4L MRR) | `/subscriptions/mrr` exists | GAP-034, frontend F3 |

Also: `pages/loans/LoanDetailPage.tsx` `handleVerifyHmac` and
`pages/loans/PartnerBanksSettingsPage.tsx` `handleTestConnection` are simulated
(always-success) actions, and `pages/settings/sections/PaymentGatewaySettings.tsx`
holds local-only form state (TODO: `PATCH /subscriptions/config/razorpay`).

See `.claude/orchestrator/gap-analysis-2026-06-10.md` and
`.claude/orchestrator/phase-7-tasks/frontend-dev.md` for remediation tasks.

---

## ~~🟢 All known pages migrated (as of 2026-05-17)~~ — SUPERSEDED by the correction above

Status as claimed on 2026-05-17: greppable scan of `src/admin/src/pages/**/*.tsx` for `const mock`,
`mockData`, and `STATIC-DATA-DEBT-7` returns zero matches in production page files
(test fixtures excluded). See "Resolved in PR …" sections below for the full audit
trail across PRs #7–#16.

### ~~`src/admin/src/pages/dashboard/DashboardPage.tsx`~~ — RESOLVED (PR #12 final widget)
Fully API-driven. All five mocks (`mockDashboardData`, `mockActivityData{7,30,90}D`,
`mockTeamWorkload`, `mockChatQueue`, `mockAuditEvents`) replaced across PRs #8 → #12.

### ~~`src/admin/src/pages/users/UserDetailPage.tsx`~~ — RESOLVED in PR #13
All four mocks replaced with live API fetches.

### ~~`src/admin/src/pages/users/UserListPage.tsx`~~ — RESOLVED in PR #16
Server-side pagination + search via `GET /auth/admin/users`; `mockUsers` removed.

### ~~`src/admin/src/pages/gst/GstFilingQueuePage.tsx`~~ — RESOLVED in PR #14
`availableCAs` mock replaced; assign-to dropdown fetches live CAs via
`GET /auth/admin/team-members?role=CA`.

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

## 🟢 Resolved in PR #15

### `tests/unit/ReportService` — new test project + first 16 tests
- Net new test project mirroring the AccountingService template
  (xunit, FluentAssertions, Moq, coverlet, ReportService project refs).
- 16 tests against `GenerateReportCommandValidator` covering:
  - default valid command shape
  - FY-format whitelist (yyyy-yy) and 4 invalid shapes
  - PeriodStart < PeriodEnd invariant + open-ended start
  - LoanPackage requires LoanApplicationId; non-LoanPackage doesn't
- AiService deliberately not scaffolded — service has only DbContext and
  endpoints, no domain logic / validators worth testing today.

## 🟢 Resolved in PR #14

### `src/admin/src/pages/gst/GstFilingQueuePage.tsx` — assign-to CA dropdown
- Removed the 4-row hardcoded `availableCAs` array.
- Existing `GetTeamMembersQuery` extended with optional `Role` parameter
  (whitelisted against `OperationalRoles` to prevent role-name spoofing).
- Endpoint `GET /auth/admin/team-members` now accepts `?role=CA`.
- New `getAdminTeamMembers(role?)` helper in `lib/dashboardApi.ts`.
- AssignCell uses `useQuery({ enabled: isOpen })` so the CA list only
  fetches when the dropdown is opened. 5-minute staleTime.
- `load` count was fabricated server-side and is dropped from the UI; per-CA
  workload is available via the existing dashboard endpoint
  (`getAdminTeamWorkload`) but not yet wired here — separate UX iteration.

## 🟢 Resolved in PR #13

### `src/admin/src/pages/users/UserDetailPage.tsx` — full rewrite
All 4 mocks (mockUser, mockDocuments, mockGstReturns, mockAuditLog) replaced
with live API fetches via TanStack Query.

Backend — 3 new admin-only IQuery slices + 1 extension:
  - AuthService     `GET /auth/admin/users/{id}` — profile + primary business org
  - DocumentService `GET /documents/admin/users/{userId}/documents?limit=N`
  - GstService      `GET /gst/admin/orgs/{organizationId}/returns?limit=N`
  - AuthService     `GET /auth/admin/audit-events` extended with optional
                    `?actorUserId=` filter (existing endpoint, additive)

Frontend:
  - New `lib/userAdminApi.ts` with 3 typed clients
  - DashboardPage's `getAdminAuditEvents(limit, actorUserId?)` extended
  - UserDetailPage rewritten:
    - Loading + error states wired
    - Tab-scoped fetches (only fire when matching tab is active) so
      switching tabs doesn't waste backend roundtrips
    - Empty states everywhere
    - Optional/missing fields handled gracefully (no business profile,
      no GSTIN, no industry, etc.)
    - PAN masking preserved (XXXXX****X)

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
