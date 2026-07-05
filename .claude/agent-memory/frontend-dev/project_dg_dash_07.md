---
name: dg-dash-07-reports-page-enhancements
description: DG-DASH-07 admin Financial Reports page — comparative/currency controls, KpiStrip, PdfViewer preview, Share modal — implemented 2026-06-28
metadata:
  type: project
---

DG-DASH-07 (low severity) fully implemented on branch `feature/repository-refactor` in `src/admin/src/pages/reports/ReportsPage.tsx`.

**Why:** Gap audit found ReportsPage missing the spec'd UX controls from docs/design/admin/reports/financial-reports-page.md §4.2–§5.

**What was built:**
- Comparative checkbox (only rendered for P&L, BS, CashFlow types — stored in `COMPARATIVE_TYPES` constant)
- Currency display chip group: ₹ exact / ₹ Lakhs / ₹ Crores; both passed to `generateReport()` as `comparative` + `currencyDisplay` fields (added to `GenerateReportRequest` in reportApi.ts)
- `ReportKpiStrip` component — 4 MetricCards (last generated, status, pages, size) + quick-action buttons for Open Preview / Share Report
- `PdfViewerWebPackagePane` embedded as an inline preview pane (toggled by clicking a job row's preview button); loads URL via `getReportDownloadUrl`
- `ReportShareModal` — Dialog with two tabs (Share with CA / Share with Bank), expiry chips (24h/7d/30d/no-expiry), optional message, inline DisclaimerCard; bank tab caps expiry at 7d; calls `generateShareLink(id, { expiryHours, message })`
- `generateShareLink` in reportApi.ts extended to accept `GenerateShareLinkRequest` with `expiryHours` + `message`

**i18n:** All 34 new keys added to en.json, hi.json, bn.json with full parity.

**Build status:** `npm run build` clean (zero TS errors), `npm run lint` clean (zero warnings). The chunk-size warning is pre-existing/unrelated.

**How to apply:** When extending ReportsPage further, note that `ReportStatus` Zod schema is strict (QUEUED/GENERATING/COMPLETE/FAILED uppercase only); legacy casing ('Completed' etc.) is rejected at Zod parse time, so don't add comparisons against mixed-case status values.
