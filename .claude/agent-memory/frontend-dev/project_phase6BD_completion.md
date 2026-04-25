---
name: Phase 6B+6D Completion
description: What was built in Phase 6B (GST notices, IRP/EWB, HsnSac typeahead) and Phase 6D (ITR admin UI, CA computation panel), patterns discovered, type gotchas
type: project
---

Phase 6B + Phase 6D admin frontend complete as of 2026-04-25.

**Phase 6B deliverables:**
- `gstApi.ts` extended: GstNoticeSchema (noticeDate field, not issueDate; noticeType enum uses ASMT-10/DRC-01/etc not SCN), IrnStatusSchema, EwbStatusSchema, HsnSacCodeSchema, NoticesDueWidgetDataSchema (has `total` field too)
- `NoticeTrackerListPage.tsx` — route `/gst/notices`
- `NoticeDetailPage.tsx` — route `/gst/notices/:noticeId`
- `GstReturnReviewPage.tsx` extended — 4th "Invoices" tab with HsnSacTypeahead per-row, IrpStatusCard/EwbStatusCard for selected invoice
- `HsnSacTypeahead.tsx` — debounced 300ms combobox for HSN/SAC search
- `IrpStatusCard.tsx`, `EwbStatusCard.tsx` — status display components
- `NoticesDueWidget.tsx` — dashboard widget
- Sidebar: "GST Notices" entry added at `/gst/notices`

**Phase 6D deliverables:**
- `itrApi.ts` (new) — 17+ endpoints; key field names: `assesseeId` (not userId), `panLast4`, `noticeDate` is `issuedDate` in itrApi (not issueDate), `payableOrRefund` (not taxPayableOrRefundable), `computationHash`, `awaitingReview`/`slaBreached`/`avgTimeToReviewDays`/`totalFilingsAy` for KPI
- `ItrPage.tsx` — rewritten with 4 tabs; `getVerificationKpi` (not getFilingKpi)
- `CaTaxComputationPanelPage.tsx` — DualPaneEditor full-screen; flat ComputationInput (no nested objects)
- `ItrFilingDetailPage.tsx` — filing detail with history
- `DueDateChip.tsx`, `SelectionToolbar.tsx`, `AttachmentList.tsx`, `DualPaneEditor.tsx`, `ComputationCard.tsx`

**Test patterns:**
- Always type test mock objects using the actual Zod-inferred type (`Filing`, `Callback`, etc.) to avoid `never[]` array gotcha
- `baseCallback.notes: [] as CallNote[]` pattern required when base status is `as const`
- GstInvoice uses `totalTaxableValue`/`totalGst` not `taxableValue`/`totalTax`
- ItrVerificationKpi fields: `awaitingReview`, `slaBreached`, `avgTimeToReviewDays`, `totalFilingsAy`

**Test count:** 154 baseline → 243 after Phase 6B+6D (89 new tests across 4 new test files)

**Why:** Phase 6B+6D combined dispatch; all build/lint/test gates pass.
**How to apply:** When writing fixture tests, always read the actual schema definition rather than guessing field names from the API contract doc.
