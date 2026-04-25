---
name: JT Clean Architecture Refactor
description: Key decisions from the Jason Taylor Clean Architecture refactor across all 11 microservices — repository layer, pipeline behaviors, shared DI, CurrentUser consolidation
type: project
---

## MediatR Pipeline Order (JT reference pattern)
All services now register behaviors in this order via `SnapAccount.Shared.Application.DependencyInjection.AddApplicationServices()`:
1. UnhandledExceptionBehavior — catch + log, rethrow
2. LoggingBehavior — request name + userId structured logging
3. ValidationBehavior — FluentValidation, returns Result.Failure (never throws)
4. PerformanceBehavior — warns at >500ms

PermissionBehavior (SEC-012 RBAC) is registered **after** by each service's own `Program.cs` via a second `AddMediatR(cfg => cfg.AddOpenBehavior(...))` call.

**Why:** Each service calls `AddApplicationServices(typeof(SomeCommand).Assembly)` to auto-discover commands/queries/validators, then adds PermissionBehavior separately.

## Repository Pattern

**Command side:** Always use `IXxxRepository` interface defined in `<Service>.Application/Interfaces/`. Implementation in `<Service>.Infrastructure/Persistence/Repositories/`.

**Query side (JT CQRS pattern):** Queries may inject `IXxxReadRepository` (lean projection interface) or the write repository if the aggregate is small. Handlers NEVER inject DbContext directly from the Application layer. The read repository returns DTOs, not aggregates.

**Documented DbContext-direct exceptions:** None currently — all queries use repository or read-repository interfaces.

## Repository Interface Locations

- `IGstReturnRepository` — moved from inline in command file to `GstService.Application/Interfaces/`
- `IDocumentRepository` — moved from inline in command file to `DocumentService.Application/Interfaces/`
- `IItcMismatchReadRepository` — new, in `GstService.Application/Interfaces/`, returns ItcMismatchDto
- `IJournalEntryRepository`, `IAccountRepository` — new, in `AccountingService.Application/Interfaces/`
- `ITaxComputationRepository` — new, in `ItrService.Application/Interfaces/`
- `IUserRepository`, `IOrganizationRepository`, `IRefreshTokenRepository` — pre-existing in `AuthService.Application/Interfaces/`

## Shared Infrastructure Changes

- `SnapAccount.Shared.Infrastructure.Auth.CurrentUser` — created as the **canonical CurrentUser** for all services. AuthService's local duplicate removed. All services reference the shared one.
- `RequiresPermissionAttribute` — moved to `SnapAccount.Shared.Application.Behaviors/` so all services can decorate commands.
- `UnhandledExceptionBehavior`, `PerformanceBehavior` — new, in `SnapAccount.Shared.Application/Behaviors/`.
- `SnapAccount.Shared.Application.DependencyInjection.AddApplicationServices()` — new shared extension method.

## DependencyInjection.cs per Service

All services now have `<Service>.Infrastructure/DependencyInjection.cs` with `Add<Service>Infrastructure(IServiceCollection, IConfiguration)`:
- AuthService: pre-existing, updated namespace for CurrentUser
- DocumentService: new, registers IDocumentRepository, ICloudStorageService, IDocumentStorageService, IOcrService
- GstService: new, registers IGstReturnRepository, IItcMismatchReadRepository, IGstCalculationService, IPubSubPublisher
- AccountingService: new, registers IJournalEntryRepository, IAccountRepository
- ItrService: new, registers ITaxComputationRepository
- LoanService, NotificationService, ReportService, SubscriptionService, AiService, ChatService: new stubs with DbContext + CurrentUser, repositories TODOd for Phase 2

## Cleanup

- All `Class1.cs` placeholder files deleted across all 11 services and all Shared layers.
- `Directory.Build.props` created at backend/ root to apply global `PackageReference Update` for EF Core version pins.

## Phase 2 JT Refactor — Interceptors + IXxxDbContext (2026-04-07)

### AuditableEntityInterceptor + DispatchDomainEventsInterceptor
- Both created in `SnapAccount.Shared.Infrastructure/Persistence/Interceptors/`
- `AuditableEntityInterceptor` depends on `ICurrentUser` (scoped) and `TimeProvider` (singleton)
- Replaces the old inline `SetAuditColumns()` override in `BaseDbContext.SaveChanges()`
- `BaseDbContext` now only handles global soft-delete query filters — no manual audit stamping
- Each service's `DependencyInjection.cs` registers:
  ```csharp
  services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
  services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
  services.AddSingleton(TimeProvider.System);
  services.AddDbContext<XxxDbContext>((sp, options) => {
      options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
      ...
  });
  ```

### IXxxDbContext (JT ApplicationDbContext pattern, per service)
Each service now has `Application/Common/Interfaces/IXxxDbContext.cs` containing all DbSet<T> properties and `SaveChangesAsync`. Concrete DbContext in Infrastructure implements it.

| Service | Interface | Concrete |
|---------|-----------|----------|
| AuthService | `IAuthDbContext` | `AuthDbContext` |
| DocumentService | `IDocumentDbContext` | `DocumentDbContext` |
| AccountingService | `IAccountingDbContext` | `AccountingDbContext` |
| GstService | `IGstDbContext` | `GstDbContext` |
| ItrService | `IItrDbContext` | `ItrServiceDbContext` |
| LoanService | `ILoanServiceDbContext` | `LoanServiceDbContext` (stub) |
| ChatService | `IChatServiceDbContext` | `ChatServiceDbContext` (stub) |
| NotificationService | `INotificationServiceDbContext` | `NotificationServiceDbContext` (stub) |
| ReportService | `IReportServiceDbContext` | `ReportServiceDbContext` (stub) |
| SubscriptionService | `ISubscriptionServiceDbContext` | `SubscriptionServiceDbContext` (stub) |
| AiService | `IAiServiceDbContext` | `AiServiceDbContext` (stub) |

DI wire-up: `services.AddScoped<IXxxDbContext>(sp => sp.GetRequiredService<XxxDbContext>())`

### Single-file JT Command/Query Pattern
All split command+handler files merged: command record + validator + handler all in one `.cs` file per feature. Handler files (`XxxCommandHandler.cs`) deleted.
- AuthService: 8 commands + 4 queries merged
- DocumentService: 1 command merged (UploadDocument)
- GstService: 1 command merged (CreateGstReturn)

### Shared.Application PaginatedList + MappingExtensions
- `SnapAccount.Shared.Application/Models/PaginatedList<T>` — JT PaginatedList, uses EFCore `AsNoTracking()`
- `SnapAccount.Shared.Application/Mappings/MappingExtensions.cs` — `PaginatedListAsync<T>` extension
- Required adding `Microsoft.EntityFrameworkCore` to `SnapAccount.Shared.Application.csproj`
- Updated `Microsoft.Extensions.Logging.Abstractions` from 9.* to 10.* in all Application csproj files

### BaseEntity Changes
- Added `RemoveDomainEvent(IDomainEvent)` method (JT pattern)
- `CreatedAt`/`UpdatedAt` no longer initialized in constructor — interceptor sets them on SaveChanges
- `CreatedBy`/`UpdatedBy` changed from `Guid?` to `string?` (stores Firebase UID or null)

## Feature-Folder Layout (post-cleanup, 2026-04-07)

The deferred cleanup (deviation #3 from prior report) is now complete. Old top-level `Commands/` and `Queries/` folders have been deleted from all three affected services:

| Service | Deleted folders | Files removed |
|---------|----------------|---------------|
| AuthService.Application | `Commands/` (10 files), `Queries/` (4 files) | 14 |
| DocumentService.Application | `Commands/` (5 files), `Queries/` (2 files) | 7 |
| GstService.Application | `Commands/` (7 files), `Queries/` (2 files) | 9 |

All 26 pairs were namespace-only diffs — no body differences found.

### External references fixed before deletion

- `DocumentService.Api/Endpoints/Documents.cs` — `using DocumentService.Application.Commands.UploadDocument` → `using DocumentService.Application.Documents.Commands.UploadDocument`
- `GstService.Api/Endpoints/Gst.cs` — 6 using directives updated to GstReturns/EWayBills/EInvoices/ItcReconciliation feature namespaces
- `GstService.Application/Interfaces/IItcMismatchReadRepository.cs` — updated to ItcReconciliation namespace
- `GstService.Infrastructure/Persistence/Repositories/ItcMismatchReadRepository.cs` — updated to ItcReconciliation namespace
- `tests/unit/AuthService/SendOtpCommandValidatorTests.cs` — updated to Otp.Commands.SendOtp namespace

### Missing feature-folder file created

`GstService.Application/ItcReconciliation/Queries/GetItcMismatches/GetItcMismatchesQuery.cs` — the directory existed but was empty; file created with namespace `GstService.Application.ItcReconciliation.Queries.GetItcMismatches`.

### Remaining 8 services

AccountingService, LoanService, ItrService, ChatService, NotificationService, ReportService, SubscriptionService, AiService — confirmed no top-level Commands/ or Queries/ folders present. No action required.

## Build State

After full refactor + cleanup: full solution build = 0 errors, 0 warnings. 79/79 unit tests pass.
MSB3277 suppressed via `<NoWarn>MSB3277</NoWarn>` in all Api.csproj files.
Integration tests build clean (require live DB to run).
Deviation #3 (deferred duplicate folder cleanup) is fully resolved.
