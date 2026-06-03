---
name: task-24-gov-verification-documents
description: Task #24 — Org GovernmentVerification toggle (Part A) + 4-doc save/verify (Part B). 444 tests pass.
metadata:
  type: project
---

Task #24 complete (2026-06-03). DB migration 053 was pre-applied by db-engineer.

## Part A — GovernmentVerificationEnabled setting

- `Organization.GovernmentVerificationEnabled` (bool, private setter, default false) added to domain entity.
- `SetGovernmentVerification(bool)` domain method exposed.
- EF config: `government_verification_enabled` column mapped in `OrganizationConfiguration.cs`.
- New permission: `platform.orgs.write` (`Permissions.PlatformOrgsWrite`) added to `Permissions.cs`.
- `UpdateOrganizationSettingsCommand` + handler in `AuthService.Application/PlatformAdmin/Commands/UpdateOrganizationSettings/`.
- Endpoint: `PATCH /auth/admin/organizations/{orgId:guid}/settings` (RequireAuthorization, [RequiresPermission("platform.orgs.write")]).
- `governmentVerificationEnabled` added to `OrganizationDto` (GetOrganizations response) and `PlatformOrgDto` (ListPlatformOrganizations response).
- `GetVerificationPolicyQuery` → `GET /auth/me/organization/verification-policy` (RequireAuthorization, no permission attribute — any logged-in user). Returns `{ governmentVerificationEnabled: bool }` for the current user's active org membership; false if no org.

## Part B — Document verification (PAN, AADHAAR, GSTIN, TAN)

**New value object:** `TanNumber` in `SnapAccount.Shared.Domain/ValueObjects/TanNumber.cs`. Format `^[A-Z]{4}[0-9]{5}[A-Z]{1}$`.

**KycKind extended:** Added `Gstin = "GSTIN"`, `Tan = "TAN"`, plus `All` set and `Parse(string)` method.

**KycStatus extended:** Added `Saved = "SAVED"` (used when gov-verification OFF).

**New interface:** `IDocumentVerificationProvider` with `SendOtpAsync(kind, number)` + `VerifyOtpAsync(kind, txId, otp)`.

**`MockDocumentVerificationProvider`** (replaces `MockKycProvider` in DI): implements BOTH `IDocumentVerificationProvider` AND `IKycProvider` so legacy `/auth/me/kyc/*` endpoints continue working unchanged. OTP "000000" always fails; any other value succeeds. TransactionId = `MOCK-{kind}-{guid:N}`.

**DI wiring:** `services.AddScoped<MockDocumentVerificationProvider>()` + both interface registrations pointing to the same concrete instance.

**New endpoints under `/auth/me/documents` (RequireAuthorization, no additional permission):**
- `GET /auth/me/organization/verification-policy` → `{ governmentVerificationEnabled: bool }`
- `GET /auth/me/documents` → `DocumentDto[]` (kind, referenceNumber, status, verifiedAt)
- `POST /auth/me/documents/{kind}` body `{ number, holderName? }` → `{ kind, referenceNumber, status }`
- `POST /auth/me/documents/{kind}/verify/otp/send` body `{ number }` → `{ transactionId }`
- `POST /auth/me/documents/{kind}/verify/otp/confirm` body `{ transactionId, otp }` → `{ kind, status, verifiedAt, otpAccepted }`

**Upsert semantics:** soft-delete existing record for user+kind, insert new one (respects partial unique index).
**Aadhaar masking:** stored as `XXXX-XXXX-{last4}` (DPDP Act 2023); full Aadhaar never persisted.

**Legacy KYC endpoints:** `/auth/me/kyc/pan/verify`, `/auth/me/kyc/aadhaar/otp/send`, `/auth/me/kyc/aadhaar/otp/verify` kept AS-IS; they delegate to `IKycProvider` which is now implemented by `MockDocumentVerificationProvider`.

## Tests
- 444 unit tests total (up from 367).
- New test files: `TanNumberValueObjectTests.cs` (9 tests), `KycKindParserTests.cs` (11 tests), `OrganizationGovernmentVerificationTests.cs` (9 tests), `DocumentVerificationTests.cs` (28 tests).
- Key pattern: upsert test uses `.IgnoreQueryFilters()` to see soft-deleted records (global soft-delete filter in BaseDbContext hides them from normal queries).

**Why:** GovernmentVerificationEnabled is an org-level setting that gates whether document saves require OTP verification before being trusted.
**How to apply:** When adding new document kinds or verification flows, extend `KycKind.Parse()`, `IDocumentVerificationProvider`, and `MockDocumentVerificationProvider`; no handler changes needed.
