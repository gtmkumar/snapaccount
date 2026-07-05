---
name: dg-itr-10-form-auto-determination
description: DG-ITR-10 ITR form auto-determination from income sources + assessee type with override support
type: project
---

# DG-ITR-10: ITR Form Auto-Determination (2026-06-28)

## What was implemented

Added server-side ITR form determination so StartFiling no longer requires the caller to supply the form type — it can be auto-derived from income heads and assessee type per Indian IT rules.

## Files created

- `Finance.Application/Itr/Common/Interfaces/IItrFormResolver.cs` — interface + input/output record types
- `Finance.Application/Itr/Services/ItrFormResolverService.cs` — pure-logic implementation (config-driven thresholds)
- `Finance.Application/Itr/Filings/Queries/SuggestItrForm/SuggestItrFormQuery.cs` — MediatR query + response DTOs + handler

## Files modified

- `Finance.Application/Itr/Filings/Commands/StartFiling/StartFilingCommand.cs` — ItrFormType now nullable; auto-derives when null; validates caller form via IItrFormResolver; returns ResolvedItrFormType + FormWarnings in response
- `Finance.Application/Itr/DependencyInjection.cs` — registers `ItrFormResolverService` as Singleton
- `Finance.WebApi/Endpoints/Itr/Itr.cs` — new `GET /itr/filings/suggest-form` endpoint; StartFilingRequest DTO made additive (ItrFormType optional, income fields default 0)

## New endpoint

`GET /itr/filings/suggest-form?assesseeType=INDIVIDUAL&assessmentYear=AY2025-26&salaryIncome=...`
- Returns `{ suggestedForm, isOutsideAutoScope, reasons, validation? }`
- Optional `callerSuppliedForm` query param adds eligibility validation

## IT Rules encoded (config-driven thresholds)

- ITR-1: Individual, no capital gains, no business, no foreign assets, no multiple HP, total ≤ ₹50L
- ITR-2: Individual/HUF with capital gains OR multiple HP OR foreign assets
- ITR-3: Individual/HUF with business income (non-presumptive or over-threshold presumptive)
- ITR-4: Individual/HUF/Firm, presumptive taxation, total ≤ ₹50L, within 44AD/44ADA turnover limits

## Config keys

All under `Itr:FormResolver:`:
- `Itr1IncomeThresholdCr` (default 0.50 = ₹50L)
- `Itr4IncomeThresholdCr` (default 0.50 = ₹50L)
- `Sec44AdTurnoverLimitCr` (default 2.00 = ₹2Cr)
- `Sec44AdaTurnoverLimitCr` (default 0.50 = ₹50L)

## Key patterns

- `IConfiguration["key"]` with manual decimal parse used instead of `GetValue<T>` (Application project has only Abstractions package, not Binder)
- Registered as Singleton (pure logic, reads config on each call via property accessors)
- Additive DTO change: StartFilingRequest `ItrFormType` is now `string?` with default null; income fields have default 0 — existing callers pass 3-arg `StartFilingRequest(AssesseeId, AssessmentYear, Regime)` compat
- Hard ineligibility → 400 Validation error; sub-optimal → 200 with FormWarnings

**Why:** ItrFormType was accepted blindly from caller; a user with capital gains could file ITR-1 (invalid per IT Act). Now the handler derives/validates the form. CA review is still the human backstop.

**Build:** 0 errors (verified `dotnet build Services/AppHost/AppHost.csproj -clp:ErrorsOnly`)
