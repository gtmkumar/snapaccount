---
name: dg-loan-04-05-consent-revoke-and-kfs-extended
description: DG-LOAN-04 (DPDP consent revocation) and DG-LOAN-05 (KFS extended fields + acknowledge endpoint) implemented; migration 103
metadata:
  type: project
---

## DG-LOAN-04 — Consent Revocation (DPDP Act 2023 s.6)

Implemented append-only revocation on the `loan.consents` table (DB trigger already blocks hard-delete).

- Migration 103 (Part 1): `revoked_at TIMESTAMPTZ NULL`, `revocation_reason VARCHAR(500) NULL` on `loan.consents`; index `(application_id, revoked_at)`.
- Domain: `Consent.Revoke(reason)` — idempotent, sets `RevokedAt`/`RevocationReason`.
- EF config: `ConsentConfiguration.cs` maps both columns.
- Command: `RevokeConsentCommand` — `[RequiresPermission("loan.application.consent")]`; IDOR guard; idempotent (returns existing revocation if already set).
- List query: `ListConsentsQuery` — `ConsentRecordDto` extended with `RevokedAt` / `RevocationReason`.
- Endpoint: `POST /loans/applications/{id}/consents/{consentId}/revoke` (body: `{reason?}`)

## DG-LOAN-05 — KFS Extended Fields + Acknowledge Endpoint

Mobile KFS screen (`KeyFactsStatementScreen`) needs server-computed fields and a standalone acknowledge step.

- Migration 103 (Part 2): 7 new columns on `loan.key_facts_statement`: `nominal_interest_rate`, `interest_type`, `total_fees`, `net_disbursal_amount`, `total_amount_payable`, `cooling_off_terms`, `grievance_officer_json`. Immutability trigger `fn_kfs_immutable_signed_fields()` recreated to guard these new signed-artifact columns.
- Domain: `KeyFactsStatement` gets 7 new nullable properties + `Create()` factory extended.
- EF config: `KeyFactsStatementConfiguration.cs` maps all 7 new columns (JSONB for `grievance_officer_json`).
- Config: `ILoanKfsConfig` extended with `GrievanceOfficerJson`, `NominalInterestRate`, `InterestType`, `GetCoolingOffTerms(locale, days)`. `LoanKfsConfig` reads from config with sensible dev fallbacks (derives structured JSON from flat `GrievanceOfficerContact` string).
- GenerateKfs command: computes `totalFees`, `netDisbursalAmount`, `totalAmountPayable` from fee array; reads `nominalInterestRate`, `interestType`, `coolingOffTerms`, `grievanceOfficerJson` from config; passes all 7 to `KeyFactsStatement.Create()`.
- GetKfs query: switched from EF projection (`Select`) to `FirstOrDefaultAsync()` + in-memory `MapToDto()` to allow C# computation of `Verified`/`SignatureLast8`; full HMAC retained for backward compat with mobile callers that compute these fields client-side.
- `KfsDto`: added `Verified`, `SignatureLast8`, `NominalInterestRate`, `InterestType`, `TotalFees`, `NetDisbursalAmount`, `TotalAmountPayable`, `CoolingOffTerms`, `GrievanceOfficerJson`.
- AcknowledgeKfs command: `POST /loans/applications/{id}/kfs/{kfsId}/acknowledge` (body: `{deviceId?}`) → `{acknowledgementId, acknowledgedAt}`; idempotent.
- Endpoints in `Loans.cs`: both new endpoints registered.

## Build Status

`dotnet build Services/AppHost/AppHost.csproj -clp:ErrorsOnly --nologo` → **0 Errors, 24 Warnings** (pre-existing NuGet advisories only).

**Why:** DPDP Act 2023 s.6 requires right to withdraw consent; RBI Digital Lending Guidelines 2022 require KFS with full disclosure fields before consent.

**How to apply:** `loan.consents` revocation is append-only (never hard-delete); KFS immutability trigger must be updated every time new columns are added to `loan.key_facts_statement`.
