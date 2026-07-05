---
name: dg-gst-01-calculation-wiring
description: DG-GST-01 fix: IGstCalculationService wired into GSTR-3B draft generation path — return totals now computed from gst.invoices
metadata:
  type: project
---

## DG-GST-01: GSTR-3B Totals Now Computed from Invoices

**Fact:** `IGstCalculationService.CalculateAsync` was registered but never called. `GstReturn.UpdateTotals()` was never invoked from any command handler — all returns were filed with zero totals.

**Fix applied (2026-06-28):**

1. `AddReturnInvoiceCommandHandler` — after persisting the invoice, calls `RecalculateReturnTotalsAsync()` which:
   - SUMs `gst.invoices WHERE gst_return_id = ?` for output CGST/SGST/IGST/cess/taxable_value
   - SUMs `gst.itc_records WHERE gst_return_id = ? AND is_eligible = true` for ITC available
   - Computes `netTaxPayable = MAX(0, outputTax - itcAvailable)`
   - Calls `gstReturn.UpdateTotals(...)` and saves again in the same transaction

2. `BulkImportInvoicesCommandHandler` — same recalculation after bulk save when `GstReturnId` is set

3. `SubmitForApprovalCommandHandler` — now injects `IGstDbContext`; guards against returns with invoices but zero totals (returns `Error.Validation("GstReturn.TotalsNotComputed", ...)`); nil returns (0 invoices + 0 totals) pass through

**Why:** Gap audit DG-GST-01 showed returns were always submitted with zero amounts. The `GstCalculationService` per-invoice calculation was not needed for aggregation — we sum the already-stored invoice fields directly.

**Key files changed:**
- `Finance.Application/Gst/Invoices/Commands/AddReturnInvoice/AddReturnInvoiceCommand.cs`
- `Finance.Application/Gst/Invoices/Commands/BulkImportInvoices/BulkImportInvoicesCommand.cs`
- `Finance.Application/Gst/GstReturns/Commands/SubmitForApproval/SubmitForApprovalCommand.cs`

**Build/Test:** 0 errors, 217 GstService tests pass, 1979 total unit tests pass.

**How to apply:** If a new write path adds invoices to a return (e.g., CSV import, reconciliation sync), it MUST call the same recalculation pattern before saving the return.
