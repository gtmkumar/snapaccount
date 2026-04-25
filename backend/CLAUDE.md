# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This is the backend directory for SnapAccount — 11 .NET 10 microservices using Clean Architecture, MediatR CQRS, and EF Core 10. The root `CLAUDE.md` has the full project overview; this file adds backend-specific detail.

## Commands

```bash
# Run all services via Aspire (preferred — starts postgres + redis automatically)
dotnet run --project AppHost
# Dashboard: http://localhost:15888

# Run a single service (requires postgres + redis already running)
cd Services/AuthService/AuthService.Api && dotnet run

# Set DB password secret (once per service, required before first run)
cd Services/<ServiceName>/<ServiceName>.Api
dotnet user-secrets init && dotnet user-secrets set "DB_PASSWORD" "postgresql"

# Run all tests
dotnet test

# Run unit tests only
dotnet test --filter "Category=Unit"

# Run tests for a specific service
dotnet test Services/<ServiceName>/<ServiceName>.Tests/

# Add an EF Core migration for a service
cd Services/<ServiceName>/<ServiceName>.Infrastructure
dotnet ef migrations add <MigrationName> --startup-project ../<ServiceName>.Api
```

## Solution Structure

```
AppHost/            — .NET Aspire orchestrator (wires all 11 services + postgres + redis)
ServiceDefaults/    — shared Aspire defaults (health checks, telemetry, service discovery)
Services/           — 11 microservices, each with 4-layer Clean Architecture
Shared/
  SnapAccount.Shared.Domain/        — BaseEntity, Result<T>, Error, ValueObject, IDomainEvent
  SnapAccount.Shared.Application/   — ICommand, IQuery, ICommandHandler, IQueryHandler, ICurrentUser, pipeline behaviors
  SnapAccount.Shared.Infrastructure/ — BaseDbContext, FirebaseAuthMiddleware, GoogleCloudStorageService, GooglePubSubPublisher
```

Each service follows this exact 4-layer pattern:
- `<Name>Service.Api` — Minimal API endpoints (no controllers), DI wiring in `Program.cs`, Hangfire jobs, request/response record DTOs defined at bottom of `Program.cs`
- `<Name>Service.Application` — MediatR commands/queries/handlers, FluentValidation validators, CQRS behaviors
- `<Name>Service.Domain` — Entities, domain events, value objects (zero external dependencies)
- `<Name>Service.Infrastructure` — EF Core DbContext, entity configurations, repositories, external service adapters, `DependencyInjection.cs` extension method

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
