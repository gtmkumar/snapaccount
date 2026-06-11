---
name: task33-mca-editlog
description: Task #33 MCA audit edit-log report page — accountingApi, EditLogPage, route, sidebar, i18n, tests
metadata:
  type: project
---

Task #33 (MCA-UI, GAP-100) completed on 2026-06-11.

**What was built:**
- `src/admin/src/lib/accountingApi.ts` — new API client: `getEditLog()` + `exportEditLog()` with full Zod schemas matching AccountingService DTOs (EditLogEntrySchema, EditLogPageSchema). Operation enum: INSERT/UPDATE/DELETE. EntityType enum matches backend validator: journal_entry, journal_entry_line, ledger_entry, account, ledger.
- `src/admin/src/pages/compliance/EditLogPage.tsx` — full page: paginated table (timestamp, entityType, entityId, operation badge, changedBy, fyYear, before→after summary), FY year text input filter, entity type dropdown filter, CSV export button, permission gate via `<Can permission="accounting.editlog.read">`, loading skeleton, empty state.
- Route `/compliance/edit-log` added to `router.tsx`.
- Nav entry "Edit Log" added to `Sidebar.tsx` (ScrollText icon; roles: SUPER_ADMIN + CA; permission: accounting.editlog.read).
- 36 new i18n keys added to all three locales (en/hi/bn); key parity test still green.
- `src/admin/src/__tests__/EditLogPage.test.tsx` — 22 component tests.

**Key decisions:**
- FY filter is a plain text input (not a select) because valid FY range is open-ended; pattern hint shown below.
- Export triggers a browser download via `URL.createObjectURL` on a Blob. The export test stubs `URL.createObjectURL`/`revokeObjectURL` on `globalThis` — do NOT mock `document.createElement` (that breaks the test renderer).
- `Can` component shows fallback (forbidden message) when `permissionsLoaded` is false — tested as "shows forbidden before permissions load".
- Page size fixed at 50 (matching backend default max); pagination visible only when totalCount > 50.

**Test count:** 941 → 963 (22 new). 0 lint errors, build passes.

**Why:** MCA Companies Accounts Rules 2014 Rule 3(5)/(6) — statutory audit trail mandate (GAP-100).
**How to apply:** Accounting domain API client is now `accountingApi.ts` (separate from `reportApi.ts`). Add future accounting endpoints there.
