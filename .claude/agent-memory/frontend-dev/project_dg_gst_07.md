---
name: dg-gst-07-gstr1-subtabs
description: DG-GST-07 — GSTR-1 review sub-tabs (B2B, B2C Summary, Credit/Debit Notes, HSN Summary, Document Issues) added to GstReturnReviewPage
type: project
---

DG-GST-07 GSTR-1 sub-tabs implemented on 2026-06-28.

**What was built:**
- `GstReturnReviewPage.tsx` now detects `returnType === 'GSTR-1'` and branches to 5 GSTR-1 sub-tabs
- GSTR-3B path unchanged (existing outward/ITC/net/invoices tabs)
- New sub-tab components (all in the same file): `Gstr1B2BTab`, `Gstr1B2CTab`, `Gstr1CreditDebitTab`, `Gstr1HsnSummaryTab`, `Gstr1DocumentIssuesTab`, `Gstr1SummaryBar`
- `gstApi.ts` extended with: `ReturnInvoiceDtoSchema` (matches backend `ReturnInvoiceDto` field names), `ReturnInvoicesListSchema`, `aggregateB2CSummary()`, `aggregateHsnSummary()`, `detectDocumentIssues()`
- `listReturnInvoices()` now uses `ReturnInvoicesListSchema` (was `GstInvoicesListSchema` — field name mismatch fixed)
- GSTR-1 loads all invoices (pageSize=500) for client-side aggregation; GSTR-3B still uses paginated (pageSize=15)

**Key schema insight:**
Backend `ReturnInvoiceDto` uses `invoiceId` (not `id`), `taxableValue` (not `totalTaxableValue`), `igstAmount/cgstAmount/sgstAmount/cessAmount` (not `totalGst`), `invoiceType` (not `documentType`), `irnStatus` string (not `irnNumber` bool). The old GSTR-3B invoices tab was using null-safe fallbacks so it worked; now both paths use the correct schema.

**i18n:** 71 keys added × 3 locales (en/hi/bn) — all under `admin.gst.return.tab.*`, `admin.gst.return.b2c.*`, `admin.gst.return.creditDebit.*`, `admin.gst.return.hsnSummary.*`, `admin.gst.return.documentIssues.*`, `admin.gst.return.summaryBar.*`.

**HSN Summary limitation:** Backend `ReturnInvoiceDto` doesn't carry per-line HSN codes — only supplier-level data. `aggregateHsnSummary()` groups by `supplierGstin` as a proxy. A real HSN-summary endpoint from the backend would fix this.

**Build status:** `tsc -b` + `vite build` both clean, 0 lint errors/warnings.

**Why:** Gap DG-GST-07 in the 2026-06-28 audit — GSTR-1 review had no B2C/CDN/HSN/DocIssues views.
**How to apply:** The pattern (branch on `returnType`, load-all for aggregation tabs) can be reused for GSTR-9 if needed.
