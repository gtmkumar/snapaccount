---
name: project_admin_ui_patterns
description: Reusable admin-UI constraints/patterns — DataTable has no row-selection, CSV export helper, 403 handling — learned across the 2026-07-05 CG gap wave
metadata:
  type: project
---

Conventions that recur across `src/admin` list/detail pages (from the 2026-07-05 screen-spec gap wave):

- **`components/ui/DataTable.tsx` has NO per-row multi-select** (no checkbox column / rowSelection). So spec'd "bulk select + action" features can't be done row-by-row without extending DataTable. Pattern used instead: a **filter-scoped bulk action** — e.g. BankCommunicationsPage "Retry all failed" acts on every failed row in the *current filter*, not hand-picked rows. If a future task truly needs hand-picked bulk, DataTable must be extended first (flag it).

- **CSV export** = `lib/csv.ts` (`toCsv(rows, [{header, value: row=>…}])` + `downloadCsv(csvFilename('prefix'), csv)`). Used on BankCommunicationsPage and CallbackListPage export buttons. Column headers should be `t()` keys. `downloadCsv` prepends a UTF-8 BOM (Excel renders ₹/Indian names).

- **403 vs empty** = `lib/apiError.ts` `isForbiddenError(error)` + `components/shared/AccessDeniedState.tsx` (inline panel). Capture `error` from the useQuery and branch: forbidden → AccessDeniedState, else empty → EmptyState. See [[project_admin_rbac_enforcement_model]].

- **i18n**: keys are a FLAT catalog in `i18n/{en,hi,bn}.json`; the `i18nKeyParity` test requires all three have the identical key set (no unused-key check, so orphaned keys are harmless but should go to Phase 6 cleanup). Add new keys to all three. Never leave a `t('some.key')` whose key is missing — it renders the raw key on screen (the ACM-09 bug class).

- **Never-fabricate rule (CG-ANALYTICS)**: don't pad an API response with synthetic/derived financial metrics that have no backend source (the old getPlatformRevenue multiplied MRR by made-up factors). Render only real fields; if the backend can't provide a metric, omit the section, don't invent it.

- **Partner banks canonical route is `/loans/partner-banks`** (NOT `/settings/partner-banks` — that route doesn't exist despite the page's doc comment). The Settings "Partner Banks" tab redirects there.
