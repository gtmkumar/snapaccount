---
name: project-dg-sec-01-02-03
description: DG-SEC-01/02/03 security gaps closed (2026-06-28): RLS GUC interceptor shared, org PAN encrypted, Document DPDP erasure subscriber.
metadata:
  type: project
---

# DG-SEC-01 / 02 / 03 Security Gap Closure (2026-06-28)

**Branch:** feature/repository-refactor  
**Build result:** 0 errors, 22 warnings (pre-existing MessagePack NuGet advisories)  
**Tests:** 1968 unit tests passing (0 failed)

---

## DG-SEC-01: RLS GUC Interceptor — Shared across ALL DbContexts

**What:** Promoted `RlsSessionInterceptor` from Auth-only to `Shared.Infrastructure/Persistence/Interceptors/RlsSessionInterceptor.cs`. Added it to every user-owned DbContext in Finance and Assist.

**Files changed:**
- `backend/Shared/SnapAccount.Shared.Infrastructure/Persistence/Interceptors/RlsSessionInterceptor.cs` — NEW (uses `"platform.orgs.read"` string, not Auth-domain constant)
- Auth `DependencyInjection.cs` — qualified local interceptor as `AuthService.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor` to resolve ambiguity
- Finance: Document, Accounting, Gst, Itr, Loan, Report DI — each gets `AddScoped<RlsSessionInterceptor>()` + `options.AddInterceptors(...)` 
- Assist: Chat, Ai, Callback DI — same pattern

**Key pattern:** Always `AddScoped<SharedRlsInterceptor>()` BEFORE `AddDbContext(...)`. Inject via `sp.GetRequiredService<RlsSessionInterceptor>()` (fully qualified in namespaces that have both).

---

## DG-SEC-02: Organization PAN Encrypted at Rest

**What:** `auth.organization.pan_number` was stored plaintext. Now encrypted with AES-256-GCM (same `IPanEncryptionService` path as user PAN).

**Files changed:**
- `Platform.Application/Auth/Organizations/Commands/CreateOrganization/CreateOrganizationCommand.cs` — handler now injects `IPanEncryptionService`, encrypts on write
- `Platform.Application/Auth/Organizations/Queries/GetOrganizations/GetOrganizationsQuery.cs` — handler injects `IPanEncryptionService`, decrypts on read with legacy-plaintext fallback
- `Platform.Application/Auth/Admin/Queries/GetUserDetail/GetUserDetailQuery.cs` — org PAN now goes through existing `MaskPan()` helper (was raw before)
- `Platform.Infrastructure/Auth/Persistence/Configurations/OrganizationConfiguration.cs` — `HasMaxLength(10)` → `HasMaxLength(512)`
- `database/migrations/092_org_pan_encrypt.sql` — widens `VARCHAR(10)` → `VARCHAR(512)`, drops useless exact-match index

**Why:** **Backfill NOT done in migration** — key only available at runtime. `DecryptPan()` helper in GetOrganizations catches decrypt exceptions and returns the raw value for legacy plaintext rows. A one-time backfill job should be run after deploy.

---

## DG-SEC-03: Document Module DPDP Erasure Subscriber

**What:** Document module had no account-deletion subscriber. Added one matching the Loan/Gst/Itr pattern.

**Domain changes:**
- `Finance.Domain/Document/Entities/Document.cs` — `UserId` changed `Guid` → `Guid?` (set; not init), `OriginalFileName` changed from `init` to `set`. Added `AnonymizedAt DateTime?` and `AnonymizationReason string?`. Domain event calls use `?? Guid.Empty` for the `Guid` parameters.
- `Finance.Application/Document/Documents/Queries/GetDocument/GetDocumentQuery.cs` — `DocumentDto.UserId` changed `Guid` → `Guid?`

**New file:**
- `Finance.Infrastructure/Document/Messaging/AccountDeletionSubscriber.cs` — subscribes to `document-service-account-deletion-sub`, NULLs `user_id` + `original_file_name`, sets `anonymized_at`/`anonymization_reason='DPDP_USER_ERASURE'`

**DI registration:** Added `services.AddHostedService<AccountDeletionSubscriber>()` inside the `if (gcpEnabled)` block in Document's `DependencyInjection.cs`.

**Migration:** `database/migrations/093_document_dpdp_erasure.sql` — drops NOT NULL on `user_id`, adds `anonymized_at`/`anonymization_reason` columns, recreates partial index with `WHERE user_id IS NOT NULL`.

**Why:** `UserId` is `Guid?` now (not `Guid`) — any code that treats it as non-nullable needs a `?? Guid.Empty` guard.

---

## Infra note (DG-INFRA-02 still open)

The Pub/Sub subscription `document-service-account-deletion-sub` must be provisioned in `infra/setup.sh` for the subscriber to activate in prod. This is a devops-engineer task. The subscriber self-disables gracefully if the subscription doesn't exist.
