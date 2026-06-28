---
name: project_dg_itr_01
description: DG-ITR-01 ComputeTaxResponse expanded to project all TaxComputationResult fields for admin zod schema; CompareRegimesResponse aligned to RegimeComparisonSchema
metadata:
  type: project
---

## DG-ITR-01 — ComputeTax/CompareRegimes admin contract alignment (2026-06-28)

**Fact:** `ComputeTaxResponse` was missing 9 fields required by admin `ComputationResultSchema` (`deductions`, `taxOnIncome`, `surcharge`, `cessAmount`, `rebate87A`, `grossTaxLiability`, `tdsPaid`, `advanceTaxPaid`, `totalCredits`). `CompareRegimesResponse` used a slim `RegimeComputationDto` (4 fields) when the admin `RegimeComparisonSchema` requires full `ComputationResultSchema` objects for `old`/`new`.

**Files changed:**
- `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/ComputeTax/ComputeTaxCommand.cs`
- `backend/Services/FinanceService/Finance.Application/Itr/Filings/Commands/CompareRegimes/CompareRegimesCommand.cs`

**Field mapping (TaxComputationResult → ComputeTaxResponse JSON):**
- `TotalDeductions` → `deductions`
- `GrossTax` → `taxOnIncome` (slab tax before rebate)
- `Cess4Pct` → `cessAmount`
- `TotalTaxPayable` → `grossTaxLiability` (= TaxAfterRebate + Surcharge + Cess)
- `TdsPaid + AdvanceTaxPaid` → `totalCredits` (computed in handler)
- `SlabWiseBreakdownJson` → deserialized + projected to `slabBreakdown[]{from,to,rate,taxOnSlab}`

**CompareRegimesResponse:** `RegimeComputationDto` (4 fields) REMOVED. Replaced with full `ComputeTaxResponse` in `Old`/`New` props. JSON: `old`, `new`, `recommendedRegime`, `taxSaving` (was `SavingsWithRecommended`).

**SlabBreakdownDto:** New record with `[JsonPropertyName]` attributes forcing `from`/`to`/`rate`/`taxOnSlab` JSON names (engine uses PascalCase internally, deserialized with `PropertyNameCaseInsensitive=true`).

**Why:** Admin `ComputationResultSchema.parse(res.data)` was throwing because required fields were absent. This caused the entire CA tax computation panel (`CaTaxComputationPanelPage.tsx`) to be non-functional.

**How to apply:** When adding/modifying computation-related DTOs in ITR, always cross-check `src/admin/src/lib/itrApi.ts` `ComputationResultSchema` and `RegimeComparisonSchema` for required field names and types. The engine `TaxComputationResult` record is the authoritative source; the handler maps from it.

**Build status:** 0 errors, 22 warnings (pre-existing). No DB migration needed (pure DTO/response shape change).
