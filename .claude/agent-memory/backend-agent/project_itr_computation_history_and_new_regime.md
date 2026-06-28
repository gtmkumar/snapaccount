---
name: itr-computation-history-and-new-regime
description: DG-ITR-07 (computation version history) and DG-ITR-09 (new-regime deductions from catalog) implementation details
metadata:
  type: project
---

# ITR Computation History + New-Regime Deductions (DG-ITR-07 / DG-ITR-09)

## DG-ITR-07: Computation Version History — COMPLETE (2026-06-28)

**Why:** Admin CA panel (ItrFilingDetailPage Col 3) calls `GET /itr/filings/{id}/computation-versions` and renders `ComputationVersionCard`. Without this, the endpoint 404ed and the history column was empty.

**What was built:**
- Domain: `Finance.Domain/Itr/Entities/ComputationVersionEntry.cs` — immutable snapshot entity (filing_id, version, actorName, inputJson, resultJson, label, createdAt)
- EF Config: `Finance.Infrastructure/Itr/Persistence/Configurations/ComputationVersionEntryConfiguration.cs` — maps to `itr.computation_versions`, unique index (filing_id, version)
- Interface: `IItrDbContext.ComputationVersions DbSet<ComputationVersionEntry>` added
- DbContext: `ItrServiceDbContext.ComputationVersions` added
- Query: `Finance.Application/Itr/Filings/Queries/GetComputationVersions/GetComputationVersionsQuery.cs` — IDOR guard, returns `IReadOnlyList<ComputationVersionDto>` with raw JsonElement input/result
- Handler update: `ComputeTaxCommandHandler` now appends a version row after each successful compute (inputJson + resultJson in camelCase matching admin schemas, auto-incremented version, actorName from email or FirebaseUid)
- Endpoint: `GET /itr/filings/{id:guid}/computation-versions` in `Finance.WebApi/Endpoints/Itr/Itr.cs`
- Migration: `database/migrations/104_itr_computation_versions.sql`

**Key contract:** Response is `IReadOnlyList<ComputationVersionDto>` (bare array), each item has `{id, filingId, version, label, actorName, createdAt, input: ComputationInputSchema, result: ComputationResultSchema}`. The admin `getComputationVersions` calls `z.array(ComputationVersionSchema).parse(res.data)` — so it expects a bare array, not a paginated envelope.

## DG-ITR-09: New-Regime Deductions from Catalog — COMPLETE (2026-06-28)

**Why:** TaxComputationEngine.cs hardcoded `deductions = 0m` for new regime. Legally-allowed sections like 80CCD(2) employer NPS (u/s 115BAC) were silently dropped, over-taxing new-regime assessees with employer NPS.

**What was built:**
- `TaxComputationInput` record gets new optional `NewRegimeDeductionClaims IReadOnlyDictionary<string, decimal>?` property
- `TaxComputationEngine.CalculateNewRegimeDeductionsAsync()` — loads `itr.deduction_sections` rows with Regime="NEW" or "BOTH", IsAvailable=true, correct AY+ActVersion; for each section code present in the claims dict, caps claim at MaxLimit and sums. Falls back to IT_ACT_1961 if 2025-Act not seeded.
- `ComputeTaxCommand` record gets `NewRegimeDeductionClaims` optional param
- `CompareRegimesCommand` record gets same param (so compare-regimes new-regime branch uses correct deductions)
- `ComputeTaxRequest` / `CompareRegimesRequest` endpoint DTOs get `Dictionary<string, decimal>? NewRegimeDeductionClaims = null`
- Endpoint handlers pass it through

**Key behavior:** When NewRegimeDeductionClaims is null (default), new-regime deductions = 0 (correct for most salaried assessees). When provided with e.g. `{"80CCD(2)": 50000}`, the engine looks up the section in the catalog and caps at MaxLimit (if set). The set of eligible sections is 100% config-driven from itr.deduction_sections — never hardcoded.

## DG-ITR-08: Income-Head Mapping — ALREADY DONE (prior Wave)

FilingConfiguration.cs:50-58 already removed all Ignore() calls and maps salary_income, house_property_income, business_income, capital_gains, other_income, computation_hash. Verified before this wave.

**How to apply:** When adding future ITR features involving new-regime deductions, they go through the deduction catalog. If adding a new 80CCD(2)-style section, seed it into itr.deduction_sections with Regime='NEW' or 'BOTH' and include the section code in the NewRegimeDeductionClaims request dict.
