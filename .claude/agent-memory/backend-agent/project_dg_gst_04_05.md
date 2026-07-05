---
name: dg-gst-04-05-late-fee-einvoice-threshold
description: DG-GST-04 late fee + interest calculation; DG-GST-05 e-invoice >5Cr threshold enforcement
type: project
---

# DG-GST-04: Late Fee + Interest Calculation (2026-06-28)

**Status:** DONE — 0 errors build.

## What was missing
`GstReturn.LateFeeAmount` and `InterestAmount` were always 0. No service computed them.

## Implementation
- **Migration 101** (`database/migrations/101_gst_late_fee_rate.sql`): 2 new tables:
  - `gst.gst_late_fee_rate` — per (return_type, is_nil_return) per-day rate + cap
  - `gst.gst_interest_rate` — annual interest rate (Section 50); seeded with 18% from 2017-07-01
  - Seeded statutory rates: GSTR-3B non-nil Rs 50/day (cap 10k), nil Rs 20/day (cap 500), GSTR-1 non-nil Rs 200/day (cap 5k), nil Rs 50/day (cap 1k)
- **Domain entities**: `GstLateFeeRate`, `GstInterestRate` (extend BaseEntity — NO audit columns)
- **Domain change**: Added `SetPenalties(lateFeeAmount, interestAmount)` to `GstReturn`
- **Interface**: `IGstLateFeeService` in `Finance.Application/Gst/Interfaces/`
- **Service**: `GstLateFeeService` in `Finance.Infrastructure/Gst/Services/` — reads from DB tables
- **FileReturnCommand**: now returns `FileReturnResponse` (was `ICommand`, now `ICommand<FileReturnResponse>`) with `LateFeeAmount`, `InterestAmount`, `DaysLate`; wires `IGstLateFeeService`
- **FileReturn endpoint**: now returns 200 with penalty body (not 204) — allows frontend to surface fees
- **GetGstReturnDto**: added `LateFeeAmount`, `InterestAmount` fields
- **New query**: `GetLateFeePreviewQuery` → `GET /gst/returns/{id}/late-fee-preview?asOf=`
- **EF configs**: `GstLateFeeRateConfiguration`, `GstInterestRateConfiguration`
- **DI**: `IGstLateFeeService` registered as scoped

## Algorithm
- `days_late = MAX(0, filed_date.DayNumber - deadline.DayNumber)`
- If `days_late == 0` → zero amounts
- Late fee = `per_day_amount * days_late`, capped at `max_cap_amount`
- Interest = `net_tax_payable * (rate_pct / 100 / 365) * days_late` (simple interest)
- Missing rate config → log warning, return 0 amounts (non-blocking)

---

# DG-GST-05: E-Invoice >5Cr Threshold Gate (2026-06-28)

**Status:** DONE — 0 errors build.

## What was missing
`GenerateEInvoiceCommandHandler` called IRP unconditionally. The comment "IRP threshold check is performed here" was a lie.

## Implementation
- **Migration 102** (`database/migrations/102_gst_org_profile.sql`): new table `gst.gst_org_profile`
  - Columns: `organization_id` (unique), `annual_turnover_cr` (numeric, nullable), `einvoice_enabled` (bool override), `effective_from_fy`
  - Has RLS + trigger for `updated_at`
- **Domain entity**: `GstOrgProfile` (extends BaseAuditableEntity) with `IsEInvoiceMandatory(thresholdCrore)` method
- **IGstServiceOptions**: added `EInvoiceThresholdCrore` property
- **GstServiceOptions**: reads `GstService:EInvoiceThresholdCrore` config; default 5.0 Crore
- **GenerateEInvoiceCommandHandler**: now loads `GstOrgProfile` for the invoice's org and calls `IsEInvoiceMandatory(threshold)`. If false → returns `EInvoice.NotApplicable` (ErrorType.Validation)
- **New command**: `SetGstOrgProfileCommand` → `PUT /gst/org-profile/{organizationId}` — creates/updates org profile; permission `gst.org-profile.write`
- **New query**: `GetGstOrgProfileQuery` → `GET /gst/org-profile/{organizationId}` — returns profile + `IsEInvoiceMandatory` + `ThresholdCrore`; permission `gst.org-profile.read`
- **EF config**: `GstOrgProfileConfiguration`

## Config key
`GstService:EInvoiceThresholdCrore` in appsettings.json / GCP Secret Manager. Never hardcode.

**Why:** Threshold has changed multiple times (20Cr → 10Cr → 5Cr) and may change again.
