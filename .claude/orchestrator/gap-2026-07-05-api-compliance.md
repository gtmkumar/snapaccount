# Gap Analysis — API Contract + Indian Compliance (2026-07-05)

Read-only audit of `docs/api/endpoints.md` vs backend route registrations, and the root-CLAUDE.md "Indian Compliance" rules vs source. Only CONFIRMED-GAP and PARTIAL items are listed (ALREADY-CLOSED items verified but omitted per request).

Scope verified: all 3 composites' `Endpoints/`, `SnapAccount.Shared.Domain/ValueObjects`, DPDP consent/erasure/localization, GST rate/e-invoicing/tax-slab config+versioning, 7-yr retention.

---

## CONFIRMED-GAP

### GAP-DPDP-CONSENT-01 — No consent-grant path exists at all (HIGH, delegable)
`UserConsent.Grant(...)` is defined at `backend/Services/PlatformService/Platform.Domain/Auth/Entities/UserConsent.cs:65` but is **never invoked anywhere** in the backend. The only factory used is `UserConsent.Withdraw(...)`, called by the withdraw handler at `backend/Services/PlatformService/Platform.Application/Auth/Privacy/Commands/WithdrawConsent/WithdrawConsentCommand.cs:81` (`db.UserConsents.Add(...)` at line 90).

No grant endpoint is registered (only `GET /me/consents` and `POST /me/consents/{purpose}/withdraw` — see `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Privacy.cs:34,38`), and no implicit grant occurs at onboarding/registration/org-creation/invite-accept. Consequently `auth.user_consents` only ever accumulates `withdrawn` rows, and `GET /auth/me/consents` (`GetMyConsentsQuery.cs:86-101`) returns an empty or withdrawn-only list. DPDP Act 2023 requires the fiduciary to capture and retain the affirmative consent record.

- Fix: add `POST /auth/me/consents/{purpose}/grant` (or capture consent at onboarding) wiring the existing `UserConsent.Grant` factory.
- Corresponds to existing task #11.

### GAP-DPDP-CONSENT-02 — Consent purpose-code taxonomy mismatch, contract vs code (MEDIUM, delegable)
Contract documents purposes as UPPER_SNAKE: `ACCOUNT_MANAGEMENT, GST_FILING, ITR_FILING, LOAN_PROCESSING, MARKETING, ANALYTICS` (`docs/api/endpoints.md:108`). The withdraw validator enforces `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$` (`WithdrawConsentCommand.cs:36`) and the handler's `PurposeDescriptions` map uses dot-lowercase codes — `marketing.sms`, `analytics.usage`, `data.sharing.partner`, `loan.creditbureau`, `communication.whatsapp`, `communication.email` (`WithdrawConsentCommand.cs:53-61`).

A client following the documented contract (`POST /auth/me/consents/MARKETING/withdraw`) receives **400** — uppercase/underscore is rejected by the regex, and the documented purpose values don't exist in the handler map.

- Fix: reconcile to a single vocabulary across grant/withdraw/read; do this together with CONSENT-01.

### GAP-CONTRACT-CHAT-SEARCH — Chat search path divergence (LOW, delegable)
Contract documents `GET /chat/threads/search` (`docs/api/endpoints.md:680`). Actual registration is `GET /chat/search` — `GroupName => "/chat"` with `MapGet("/search", …)` at `backend/Services/AssistService/Assist.WebApi/Endpoints/Chat/Chat.cs:33,131`. A client using the documented path 404s.

- Fix: correct the doc to `/chat/search` (or add a `/chat/threads/search` alias).

---

## PARTIAL

### PART-DPDP-DATALOCAL — Data localization correct in code, unverified in infra (LOW; code delegable, infra TL-gated)
Code defaults all GCP/AI regions to `asia-south1` (Mumbai): `backend/Services/AssistService/Assist.Infrastructure/Ai/Providers/VertexAiProvider.cs:41` and `AiProviderResolver.cs:68-72`; audit marks it PASS (`docs/security/security-audit.md:141-143`). But it is a config default enforced only at deployment-time region provisioning, and `docs/security/security-checklist.md:136` still has the "verify no resources created outside asia-south1" check open.

- Code side: done (could be asserted in config/tests — delegable).
- Actual infra-region verification: TL-gated (needs deployed GCP project).

---

## Verified ALREADY-CLOSED (not detailed, listed so they aren't re-opened)
PAN/GSTIN/Aadhaar validators enforce exact formats (`PanNumber.cs:8`, `GstinNumber.cs:8-10`, `AadhaarLastFour.cs:11,31`); GST rates DB-config-driven (`GstCalculationService.cs`, `CreateTaxRateCommand.cs:40`); e-invoicing >5Cr threshold config-driven (`GstServiceOptions.cs:18,31`, `GstOrgProfile.cs:63`); tax slabs versioned by AY+regime from `TaxSlabVersions` (`GetTaxSlabsQuery.cs:86-90`, `Filing.PinComputation`); ITR-form/act versioning (migration 072, `act_version`/`tax_year`); 7-yr retention (`DocumentArchive.cs:23`, trigger `trg_consents_no_delete`); right-to-erasure (`DELETE /auth/account` + `AccountDeletionSubscriber` anonymization); data-export/correction endpoints (`Privacy.cs:43-59`). Broad API-contract sample across all 12 areas matched — implementation is a superset of the doc; confidence high that untested routes also match.

---

## REMEDIATION — backend-agent (2026-07-05) — task #11

### GAP-DPDP-CONSENT-01 — FIXED (grant path added)
- New command `AuthService.Application.Privacy.Commands.GrantConsent.GrantConsentCommand` wires the previously-dead `UserConsent.Grant(...)` factory. Idempotent for an already-granted purpose; re-granting a withdrawn purpose appends a fresh granted row (append-only audit trail preserved).
- New endpoint `POST /auth/me/consents/{purpose}/grant` (`Endpoints/Auth/Privacy.cs`) → `200 OK`. `RequireAuthorization()` only (self-service; no permission gate — matches withdraw).
- Consent-audit IP now resolved from `X-Forwarded-For` (first hop) with `RemoteIpAddress` fallback for BOTH grant and withdraw — behind the YARP gateway the socket peer is the gateway, so the previous code recorded the gateway IP instead of the client's. `ResolveClientIp` helper in Privacy.cs.

### GAP-DPDP-CONSENT-02 — FIXED (taxonomy reconciled to one vocabulary)
- Decision: **dot-lowercase is authoritative** (`marketing.sms`, `analytics.usage`, `data.sharing.partner`, `loan.creditbureau`, `communication.whatsapp`, `communication.email`). It is the implemented/validated vocabulary; the skipped integration tests already pinned it (`.../marketing.sms/grant`); and the mobile client (`mobile/src/api/privacy.ts`) is an open type that displays whatever codes the backend returns (round-trip is backend-sourced), so no mobile change is required. The UPPER_SNAKE doc list was the wrong side.
- Shared `AuthService.Application.Privacy.Common.ConsentPurposes` now holds the single regex + descriptions map; grant and withdraw both reference it (cannot drift). Both endpoints now map a validation failure to `400` with `{error, code}` (previously a bad purpose surfaced as a 500 from `Results.Problem`).
- `docs/api/endpoints.md` consent section corrected: dot-lowercase purpose list, the validation regex, and the new grant row.

### Tests
- Un-skipped the 3 `ConsentPrivacyIntegrationTests` and corrected two expectations: withdraw asserts `204` (contract per endpoints.md + mobile privacy.ts, was wrongly `200`), and the test client sends `X-Forwarded-For` so the audit-IP capture path is exercised deterministically (TestServer leaves `RemoteIpAddress` null).
- New unit suite `tests/unit/AuthService/GrantConsentCommandTests.cs` (8 cases): grant writes one granted row with captured IP + resolved description; idempotent re-grant; re-grant after withdrawal appends a third row; validator accepts dot-lowercase and rejects UPPER_SNAKE / mixed-case.

### Verification
- `dotnet build SnapAccount.slnx` → 0 errors. AuthService unit suite → 707/707 pass (incl. the 8 new). Grant route confirmed registered live (`POST .../grant` → 401 without a token, 404 for a bogus sub-path).
- Integration suite could NOT be executed: (a) `tests/integration/AuthService/AddUserApiTests.cs` currently fails to compile (`AddRoleEntity` signature) — another agent's in-progress fixture overhaul, unrelated to this change; (b) an unrelated `wavio-postgres` container seized port 5432 mid-session. Re-run the AuthService integration suite once the fixture project compiles and a clean snapaccount Postgres is on 5432.
