# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This is the backend directory for SnapAccount — **3 composite services** (.NET 10) using Clean Architecture, MediatR CQRS, and EF Core 10. The root `CLAUDE.md` has the full project overview; this file adds backend-specific detail.

## Commands

```bash
# Run all services via Aspire (preferred — starts postgres + redis automatically)
dotnet run --project Services/AppHost
# Dashboard: https://localhost:17241

# Run a single composite
cd Services/PlatformService/Platform.WebApi && dotnet run   # :5201
cd Services/FinanceService/Finance.WebApi && dotnet run    # :5202
cd Services/AssistService/Assist.WebApi && dotnet run     # :5203

# Set DB password secret (once per composite WebApi)
cd Services/PlatformService/Platform.WebApi
dotnet user-secrets init && dotnet user-secrets set "DB_PASSWORD" "postgresql"

# Run all tests
dotnet test

# Add an EF Core migration (example: Auth under Platform)
cd Services/PlatformService/Platform.Infrastructure
dotnet ef migrations add <MigrationName> --startup-project ../Platform.WebApi
```

## Solution Structure

```
Services/
  AppHost/          — Aspire orchestrator (api-gateway + platform + finance + assist)
  Gateway/          — YARP reverse proxy (:5000)
  PlatformService/  — Platform.{Domain,Application,Infrastructure,WebApi} (:5201)
  FinanceService/   — Finance.* (:5202)
  AssistService/    — Assist.* (:5203)
ServiceDefaults/    — shared Aspire defaults
Shared/
  SnapAccount.Shared.Domain/
  SnapAccount.Shared.Application/
  SnapAccount.Shared.Infrastructure/
  SnapAccount.Shared.Api/
```

Each composite has 4 layer projects; module code lives in subfolders (`Auth/`, `Gst/`, etc.) with original namespaces preserved.

## MediatR Pipeline Order

Every service registers the pipeline in this order (see `Program.cs`):
1. `LoggingBehavior` — request/response logging (from Shared)
2. `ValidationBehavior` — FluentValidation, returns `Result.Failure` instead of throwing (from Shared)
3. `PermissionBehavior` — RBAC via `[RequiresPermission("permission.name")]` attribute on command/query class (per-service)

Commands and queries must return `Result<T>` or `Result`. Handlers never throw across boundaries — always return `Result.Failure(error)`.

## Key Patterns

**Command/Query structure** — each lives in its own folder with all related types:
```
Commands/SendOtp/
  SendOtpCommand.cs       — record command + validator + response record, all in one file
  SendOtpCommandHandler.cs
```

**Result pattern:**
```csharp
// Success
return Result<MyResponse>.Success(new MyResponse(...));
// or implicit
return new MyResponse(...);

// Failure
return Result<MyResponse>.Failure(new Error("Domain.ErrorCode", "Human message", ErrorType.Validation));
// or using Error static factory
return Error.NotFound("User.NotFound", "User not found.");
```

**RBAC:** Decorate a command/query class with `[RequiresPermission("permission.name")]` — `PermissionBehavior` enforces it automatically without any code in the handler.

**Authentication:** `FirebaseAuthMiddleware` (Shared.Infrastructure) validates Firebase JWT tokens on every request and populates `HttpContext.Items["FirebaseDecodedToken"]`. Services access the current user via `ICurrentUser` (scoped), which reads from `IHttpContextAccessor`. Endpoints use `.RequireAuthorization()` — the middleware sets the ClaimsPrincipal.

**EF Core conventions:**
- Migrations history table scoped per schema: `npgsql.MigrationsHistoryTable("__ef_migrations_history", "<schema>")`
- Entity type configurations in `Infrastructure/Persistence/Configurations/` — never data annotations
- snake_case column names via EF Core naming convention (configured in `BaseDbContext`)
- Soft deletes via `DeletedAt` nullable column on `BaseEntity` — apply global query filter in DbContext

**Cross-service events:** Services publish domain events via `IEventPublisher` → `PubSubEventPublisher` → `GooglePubSubPublisher` (Google Pub/Sub). Consumers are `EventHandler` classes in `Application/EventHandlers/`.

**DI registration:** Each service has a single `DependencyInjection.cs` in `Infrastructure/` with one extension method (`AddXxxInfrastructure`) called from `Program.cs`.

## Security Reference

Security controls are tracked with SEC-NNN codes in comments:
- SEC-002: CORS — never `AllowAnyOrigin()`, always explicit origins from config
- SEC-007: Cross-service events via Pub/Sub (not direct HTTP calls)
- SEC-011: Rate limiting on OTP endpoints (5 req / 10 min sliding window per IP)
- SEC-012: RBAC via `PermissionBehavior` + `[RequiresPermission]`
- SEC-013: PAN encrypted at rest with AES-256 (`AesPanEncryptionService`), key from GCP Secret Manager
- SEC-018: DB password via `dotnet user-secrets` / env var `DB_PASSWORD`, never in `appsettings.json`
- SEC-022: Invalid Firebase token logs a warning but does not short-circuit — endpoint's `RequireAuthorization()` handles rejection

## Local Secrets Summary

| Variable | How to set locally |
|---|---|
| `DB_PASSWORD` | `dotnet user-secrets set "DB_PASSWORD" "postgresql"` |
| `PanEncryption__Key` | `dotnet user-secrets set "PanEncryption:Key" "<base64-32-bytes>"` |
| `Firebase__ServiceAccountJson` | `dotnet user-secrets set "Firebase:ServiceAccountJson" "<json>"` |
| `RAZORPAY_WEBHOOK_SECRET` | `dotnet user-secrets set "RAZORPAY_WEBHOOK_SECRET" "<secret>"` |

The placeholder `#{DB_PASSWORD}#` in `appsettings.json` is replaced at runtime by a custom config provider — do not change this pattern.
