---
name: JT Refactor State
description: Final state and deliberate deviations from JT template after the structural refactor aligning all 11 microservices to Jason Taylor Clean Architecture
type: project
---

# JT Structural Refactor — Final State

**Completed**: 2026-04-07
**Plan reference**: `/Users/gtmkumar/.claude/plans/whimsical-sprouting-rossum.md`
**Build state**: 50 projects, 0 errors, 0 warnings, 79/79 tests passing

## Shared Promotions Completed

1. **BaseEntity split** — `BaseEntity` (Id + domain events only) and new `BaseAuditableEntity` (audit columns + soft-delete). All 45 domain entities across 5 services migrated to `BaseAuditableEntity`.
2. **`AuditableEntityInterceptor`** — updated to target `BaseAuditableEntity` instead of `BaseEntity`.
3. **`BaseDbContext`** — soft-delete query filter now only applies to `BaseAuditableEntity` subtypes.
4. **`Shared.Application.Common.Exceptions/`** — `ValidationException`, `NotFoundException`, `ForbiddenAccessException` added.
5. **`SnapAccount.Shared.Api`** — NEW project added to solution with:
   - `EndpointGroupBase.cs` — abstract base with `GroupName` + `Map(RouteGroupBuilder)`.
   - `WebApplicationExtensions.cs` — `MapEndpoints(Assembly)` reflection scanner.
   - `MethodInfoExtensions.cs` — `IsAnonymous` helper.
   - `CustomExceptionHandler.cs` — `IExceptionHandler` dispatching on 4 known exception types.

## Per-Service Changes

### AuthService
- **Application/DependencyInjection.cs** — `AddAuthApplicationServices()` (wraps shared pipeline + PermissionBehavior).
- **Feature folders**: `Otp/`, `Users/`, `Devices/`, `Organizations/`, `RefreshTokens/`, `Preferences/`.
- **Api/Endpoints/Auth.cs** — 10 endpoints, `GroupName = "/auth"`.
- **Program.cs** — stripped inline endpoints, calls `AddAuthApplicationServices()`, `MapEndpoints(Assembly)`, `CustomExceptionHandler`.

### DocumentService
- **Application/DependencyInjection.cs** — `AddDocumentApplicationServices()`.
- **Feature folders**: `Documents/` (commands + queries).
- **Api/Endpoints/Documents.cs** — 6 endpoints, `GroupName = "/documents"`.

### AccountingService
- **Api/Endpoints/Accounting.cs** — 6 stub endpoints, `GroupName = "/accounting"`.
- Program.cs now calls `AddAccountingInfrastructure()` (was previously doing inline Firebase init only).

### GstService
- **Application/DependencyInjection.cs** — `AddGstApplicationServices()`.
- **Feature folders**: `GstReturns/`, `EInvoices/`, `EWayBills/`, `ItcReconciliation/`.
- **Api/Endpoints/Gst.cs** — 13 endpoints, `GroupName = "/gst"`.
- **Note**: `IItcMismatchReadRepository` interface and Infrastructure implementation kept with old namespace (`GstService.Application.Queries.GetItcMismatches`) to avoid type duplication. The new feature-folder `ItcReconciliation/` folder contains only structurally-reorganized copies; the canonical handler is still in `Queries/GetItcMismatches/`.

### LoanService
- **Api/Endpoints/Loans.cs** — 6 stub endpoints, `GroupName = "/loans"`.
- Application-layer-only service (no domain entities).

### ItrService
- **Api/Endpoints/Itr.cs** — 6 stub endpoints, `GroupName = "/itr"`.
- Application-layer-only service (no domain entities).

### ChatService
- **Api/Endpoints/Chat.cs** — 6 stub endpoints, `GroupName = "/chat"`.
- Application-layer-only service.

### NotificationService
- **Api/Endpoints/Notifications.cs** — 5 stub endpoints, `GroupName = "/notifications"`.
- Application-layer-only service.

### ReportService
- **Api/Endpoints/Reports.cs** — 5 stub endpoints, `GroupName = "/reports"`.
- Application-layer-only service.

### SubscriptionService
- **Api/Endpoints/Subscriptions.cs** — 6 endpoints (5 stubs + 1 real Razorpay HMAC webhook), `GroupName = "/subscriptions"`.
- Application-layer-only service.

### AiService
- **Api/Endpoints/Ai.cs** — 5 stub endpoints with `RequireRateLimiting("ai")`, `GroupName = "/ai"`.
- Application-layer-only service.

## Deliberate Deviations from JT Template

1. **`Persistence/` not `Data/`** — SnapAccount uses `Infrastructure/Persistence/` consistently. JT uses `Infrastructure/Data/`. No rename — would be churn for zero benefit.
2. **No `ApplicationDbContextInitialiser.cs`** — SnapAccount uses db-engineer-owned SQL migrations under `database/migrations/`. No seeding in service code.
3. **No ASP.NET Identity** — Firebase Auth via `FirebaseAuthMiddleware` + `ICurrentUser`. `IIdentityService` slot is filled by Firebase.
4. **No AutoMapper** — `MappingExtensions.cs` holds only `PaginatedListAsync` extension (no AutoMapper profiles). Manual LINQ projections in handlers.
5. **`RequiresPermissionAttribute` + `PermissionBehavior` instead of JT's `[Authorize]`** — SnapAccount RBAC pattern already in `Shared.Application`.
6. **`GroupName` with absolute path** — `EndpointGroupBase.GroupName` supports `/prefix` (absolute) to preserve pre-refactor routes like `/auth`, `/gst`. JT uses `/api/{groupName}`. Extension checks if GroupName starts with `/` and uses verbatim if so.
7. **6 services without domain entities** (AiService, ChatService, LoanService, NotificationService, ReportService, SubscriptionService) — intentionally application-layer-only today. Domain entity fabrication deferred to product-driven extraction.
8. **GstService ItcReconciliation** — `IItcMismatchReadRepository` interface uses old-namespace DTO to avoid type duplication during refactor. Full namespace consolidation deferred to a dedicated cleanup pass.
9. **Old Commands/Queries folders preserved** — For AuthService, DocumentService, GstService: original flat-folder handlers still exist alongside new feature-folder copies. The new feature-folder files have updated namespaces. A future cleanup pass should remove the old flat folders once all references are confirmed migrated.

## CRUD-Wrapper Removal Pass (2026-04-07)

**Rule applied**: entity methods whose entire body is flat property assignments ± trivial null/empty check ± `AddDomainEvent` were removed. All validation moved to FluentValidation validators; all property assignments and `AddDomainEvent` calls moved to command handlers. Genuine domain behavior (state machine transitions, multi-field invariants, private collection management) was left in entities.

**Key architectural change**: `BaseEntity.AddDomainEvent` changed from `protected` to `public` to allow handlers to raise domain events on newly-constructed entities. This is intentional — the handler is now responsible for both construction and event emission for new aggregates.

### AuthService

**Entities touched**: Organization, User, OtpRequest, RefreshToken, UserProfile, UserPreference

**Methods removed** (call site they moved to):
- `Organization.Create(...)` → `CreateOrganizationCommandHandler`. `IsGstRegistered = !string.IsNullOrEmpty(gstin)` derivation preserved. `OrganizationCreatedEvent` raised in handler.
- `Organization.Update(...)` → SKIPPED (no handler calls it — reported below).
- `User.Create(phoneNumber)` → `RegisterUserCommandHandler` and `VerifyOtpCommandHandler`. `UserRegisteredEvent` raised in handlers.
- `User.UpdateProfile(fullName, email)` → `RegisterUserCommandHandler` (upsert path) and `UpdateUserProfileCommandHandler`. Direct property assignment.
- `User.UpdateLanguage(language)` → `UpdatePreferencesCommandHandler`. Direct property assignment.
- `User.RecordLogin()` → `VerifyOtpCommandHandler`. Direct property assignment.
- `UserProfile.Create(userId, userType)` → `RegisterUserCommandHandler` and `UpdateUserProfileCommandHandler`. Object initializer.
- `UserProfile.Update(...)` → `UpdateUserProfileCommandHandler`. Direct property assignments.
- `UserPreference.Create(userId)` → `RegisterUserCommandHandler`. Object initializer.
- `UserPreference.Update(...)` → `UpdatePreferencesCommandHandler`. Direct property assignments.
- `RefreshToken.Create(...)` → `RefreshTokenCommandHandler`. `ExpiresAt = DateTime.UtcNow.AddDays(30)` derivation preserved. Object initializer.
- `OtpRequest.Create(...)` → `OtpService.SendOtpAsync` (Infrastructure). `ExpiresAt = DateTime.UtcNow.AddMinutes(5)` derivation preserved. Object initializer.

**Methods kept** (justification):
- `User.LinkFirebaseUid(firebaseUid)` — sets `IsPhoneVerified = true` atomically with `FirebaseUid`; coupling that handlers must not bypass.
- `User.SetProfile(profile)` — access mechanism for private `Profile` navigation property.
- `User.AddDevice(...)` — enforces max-2-device limit AND duplicate device ID check against private `_devices` collection.
- `User.RemoveDevice(deviceId)` — searches private `_devices` collection; atomically deactivates.
- `User.RequestAccountDeletion()` — coordinates IsDeleted/DeletedAt/IsActive + `AccountDeletionRequestedEvent` (DPDP Act 2023).
- `OtpRequest.IncrementAttempt()` — guards IsUsed and IsExpired; triggers CooldownUntil derivation.
- `OtpRequest.MarkAsUsed()` — state transition (UNUSED→USED); prevents replay attacks.
- `RefreshToken.Revoke(reason)` — three-field atomic state transition (ACTIVE→REVOKED).
- `RefreshToken.Use()` — timestamp setter; kept for symmetry.
- `UserProfile.VerifyKyc()` / `RejectKyc()` — KYC state machine transitions.
- `UserRole.Deactivate()` / `OrganizationMember.Deactivate()` — state transitions.
- `UserDevice.Deactivate()` — two-field state transition called from `User.RemoveDevice`.

**SKIPPED (no handler exists)**:
- `Organization.Update(...)` — method removed from entity but no `UpdateOrganizationCommandHandler` exists; properties remain `private set`.
- `Role.Create`, `Permission.Create`, `RolePermission.Create`, `UserRole.Create`, `OrganizationMember.Create` — no command handlers call these.

**Validator changes**: None — `CreateOrganizationCommandValidator` already had `BusinessName.NotEmpty()` covering the null check.

**Domain events**: 3 removed from entities (`OrganizationCreatedEvent`, `UserRegisteredEvent` x2), all reappear in handlers before repository calls. Count unchanged.

**Property access changes**: Construction-time-only properties → `init`. Post-construction-mutable profile/preference fields → `public set`. Private state machine fields → `private set` unchanged.

**Tests updated** (in `tests/unit/AuthService/`):
- `UserDeviceTests.cs`: `User.Create("9876543210")` → `new User { PhoneNumber = "9876543210" }`
- `OtpServiceTests.cs`: `OtpRequest.Create(phone, hash, "AUTH")` → object initializer with `ExpiresAt`

### DocumentService

**Entities touched**: Document

**Methods removed**:
- `Document.Create(...)` → `UploadDocumentCommandHandler`. `DocumentUploadedEvent` raised in handler. Object initializer.
- `Document.Categorize(categoryId)` → `UploadDocumentCommandHandler`. `CategoryId` property changed to `public set`.

**Methods kept**:
- `Document.StartOcr()` — state transition.
- `Document.CompleteOcr(...)` — multi-field state transition + `OcrCompletedEvent`.
- `Document.MarkProcessed()` — state transition + `DocumentProcessedEvent`.
- `Document.Archive()` — two-field state transition.
- `Document.Reject()` — state transition.

**SKIPPED (no handler or handler not implemented)**:
- `DocumentArchive.Create`, `DocumentCategory.Create`, `DocumentPage.Create`, `OcrFeedback.Create`, `OcrResult.Create` — no handlers call these.
- `DocumentShare.Create` — KEPT: computes `AccessToken` conditionally based on `ShareType`; derivation handler must not bypass.

### AccountingService

No changes — no command handlers implemented; all entity factories uncalled.

### GstService

**Entities touched**: GstReturn

**Methods removed**:
- `GstReturn.Create(...)` → `CreateGstReturnCommandHandler`. Object initializer. The `!Contains(returnType)` check was already covered by the validator; removed from entity.

**Methods kept**:
- `GstReturn.SubmitForApproval(...)` — state machine guard (DRAFT only).
- `GstReturn.Approve(...)` — state machine guard (PENDING_APPROVAL only).
- `GstReturn.File(...)` — state machine guard (APPROVED only) + `GstReturnFiledEvent`.
- `GstReturn.RequestRevision(...)` — state machine guard (PENDING_APPROVAL or APPROVED).
- `GstReturn.UpdateTotals(...)` — multi-field assignment (no handler calls it; left in place).
- `GstReturn.AddLineItem(...)` — manages private `_lineItems` collection.

**SKIPPED (no handler)**:
- `GstNotice.Create`, `GstReconciliation.Create`, `GstRefund.Create`, `GstInvoice.Create`, `EInvoice.Create`, `EWayBill.Create`, `GstAnnualReturn.Create`, `GstTaxRate.Create`, `HsnSacCode.Create`, `ItcRecord.Create`, `LutFiling.Create`.
- `ItcMismatch.Detect` — KEPT: raises `ItcMismatchDetectedEvent` (domain event).

### ItrService

No changes — no command handlers call any entity factory; all ITR entities (`TaxComputation`, `AdvanceTax`, `EqualisationLevy`, `LowerTdsCertificate`, `SpecifiedPersonCheck`, `TransferPricingReport`) have uncalled Create factories. `TaxComputation.Create` KEPT because it computes a SHA-256 integrity hash of all inputs (SEC-020) — this is non-trivial computation that handlers must not bypass.

### Build + Test Result

- `dotnet build SnapAccount.slnx` → 50 projects, **0 errors, 0 warnings**
- `dotnet test tests/unit/AuthService/AuthService.Tests.csproj` → **79/79 passing**
- Pre-existing warning: xUnit1026 in `tests/unit/AuthService/SendOtpCommandValidatorTests.cs` (QA-owned, not introduced by this pass)

## File Ownership
All changes in `backend/`. No edits outside this directory.
