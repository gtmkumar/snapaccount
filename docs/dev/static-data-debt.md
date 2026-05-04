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
