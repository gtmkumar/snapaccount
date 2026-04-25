# Clean Architecture — Folder & File Reference Guide

## Context

You want a reusable reference document (intended to be shared as a README / agent-instruction file) that describes the folder and file layout of this Clean Architecture .NET solution, and explains **what each file/folder is responsible for**. The goal: when you start another project using the same architecture, you (or an AI agent) can follow this document and place code in the correct layer without confusion.

This is based on the actual structure of `YourProjectName` (a Jason Taylor–style Clean Architecture .NET solution: Domain → Application → Infrastructure → Web).

---

## The Four Layers (Dependency Rule)

```
Web  ───►  Application  ───►  Domain
  │            ▲
  └─►  Infrastructure ──┘
```

- **Domain** depends on nothing.
- **Application** depends only on Domain.
- **Infrastructure** depends on Application (implements its interfaces).
- **Web** depends on Application + Infrastructure (composition root).

---

## Top-Level Layout

```
YourProjectName/
├── src/
│   ├── Domain/            # Enterprise business rules (innermost)
│   ├── Application/       # Use cases / CQRS handlers
│   ├── Infrastructure/    # EF Core, Identity, external services
│   └── Web/               # ASP.NET Core Minimal API host
├── tests/
│   ├── Domain.UnitTests/
│   ├── Application.UnitTests/
│   ├── Application.FunctionalTests/
│   └── Infrastructure.IntegrationTests/
├── infra/                 # Bicep / Azure infrastructure-as-code
├── Directory.Build.props
├── Directory.Packages.props   # Central package management
├── global.json
├── YourProjectName.slnx
└── README.md
```

---

## 1. `src/Domain/` — Enterprise Core

**Rule:** No dependencies. Pure C#. No EF Core, no MediatR, no ASP.NET.

| Folder            | Purpose                                                                       | Example file                    |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `Entities/`       | Aggregate roots & entities with business behavior                             | `TodoItem.cs`, `TodoList.cs`    |
| `ValueObjects/`   | Immutable value types with equality by value                                  | `Colour.cs`                     |
| `Events/`         | Domain events raised by entities                                              | `TodoItemCreatedEvent.cs`       |
| `Enums/`          | Domain enumerations                                                           | `PriorityLevel.cs`              |
| `Constants/`      | Domain-wide constants (roles, policies)                                       | `Roles.cs`, `Policies.cs`       |
| `Exceptions/`     | Domain-specific exceptions                                                    | `UnsupportedColourException.cs` |
| `Common/`         | Base classes: `BaseEntity`, `BaseAuditableEntity`, `BaseEvent`, `ValueObject` | `BaseEntity.cs`                 |
| `GlobalUsings.cs` | Implicit usings for the project                                               | —                               |
| `Domain.csproj`   | Project file (no external refs)                                               | —                               |

---

## 2. `src/Application/` — Use Cases (CQRS + MediatR)

**Rule:** References only `Domain`. Defines **interfaces** that Infrastructure implements.

Organized by **feature folder**, each containing `Commands/`, `Queries/`, and `EventHandlers/`.

| Folder                              | Purpose                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Feature>/Commands/<CommandName>/` | One folder per command. Contains the command record, handler, and validator.                                                                            |
| `<Feature>/Queries/<QueryName>/`    | One folder per query. Contains query, handler, DTOs, ViewModels, validator.                                                                             |
| `<Feature>/EventHandlers/`          | Handlers for domain events                                                                                                                              |
| `Common/Interfaces/`                | Abstractions for external concerns (`IApplicationDbContext`, `IIdentityService`, `IUser`)                                                               |
| `Common/Behaviours/`                | MediatR pipeline behaviours: `ValidationBehaviour`, `LoggingBehaviour`, `AuthorizationBehaviour`, `PerformanceBehaviour`, `UnhandledExceptionBehaviour` |
| `Common/Models/`                    | Shared DTOs/models: `PaginatedList`, `Result`, `LookupDto`                                                                                              |
| `Common/Mappings/`                  | AutoMapper extensions (`MappingExtensions.cs`)                                                                                                          |
| `Common/Exceptions/`                | App-level exceptions: `ValidationException`, `ForbiddenAccessException`                                                                                 |
| `Common/Security/`                  | `AuthorizeAttribute` for marking commands/queries                                                                                                       |
| `DependencyInjection.cs`            | `AddApplicationServices()` — registers MediatR, FluentValidation, AutoMapper, behaviours                                                                |

**Per-feature file pattern (example: `TodoItems/Commands/CreateTodoItem/`):**

- `CreateTodoItem.cs` — the `CreateTodoItemCommand` record + `CreateTodoItemCommandHandler` in one file
- `CreateTodoItemCommandValidator.cs` — FluentValidation rules

**Per-query file pattern (example: `TodoLists/Queries/GetTodos/`):**

- `GetTodos.cs` — query + handler
- `TodosVm.cs` — view model returned to client
- `TodoListDto.cs`, `TodoItemDto.cs` — DTOs with AutoMapper profiles

---

## 3. `src/Infrastructure/` — Implementation Details

**Rule:** Implements interfaces from `Application/Common/Interfaces/`. Holds EF Core, identity, external service clients.

| Folder                   | Purpose                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Data/`                  | `ApplicationDbContext.cs` (implements `IApplicationDbContext`), `ApplicationDbContextInitialiser.cs` (seed data)   |
| `Data/Configurations/`   | EF Core `IEntityTypeConfiguration<T>` per entity (`TodoItemConfiguration.cs`)                                      |
| `Data/Interceptors/`     | EF SaveChanges interceptors: `AuditableEntityInterceptor`, `DispatchDomainEventsInterceptor`                       |
| `Identity/`              | ASP.NET Identity: `ApplicationUser`, `IdentityService` (implements `IIdentityService`), `IdentityResultExtensions` |
| `DependencyInjection.cs` | `AddInfrastructureServices()` — registers DbContext, Identity, interceptors, repositories                          |

**Add here:** email senders, file storage clients, message bus publishers, third-party API wrappers — anything talking to the outside world.

---

## 4. `src/Web/` — Presentation (ASP.NET Core Minimal API)

**Rule:** Composition root. References Application + Infrastructure. Thin — delegates to MediatR.

| Folder / File                                      | Purpose                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Program.cs`                                       | App entry. Wires up DI, middleware, endpoints.                                                                                    |
| `DependencyInjection.cs`                           | `AddWebServices()` — web-specific services (CORS, OpenAPI, exception handler)                                                     |
| `Endpoints/`                                       | Minimal API endpoint groups, one file per feature: `TodoItems.cs`, `TodoLists.cs`, `Users.cs`. Each inherits `EndpointGroupBase`. |
| `Infrastructure/EndpointGroupBase.cs`              | Base class for endpoint groups                                                                                                    |
| `Infrastructure/WebApplicationExtensions.cs`       | Extension methods to map endpoint groups                                                                                          |
| `Infrastructure/CustomExceptionHandler.cs`         | Maps app exceptions → HTTP responses                                                                                              |
| `Services/CurrentUser.cs`                          | Implements `IUser` from `HttpContext`                                                                                             |
| `wwwroot/`                                         | Static files; `api/specification.json` is the OpenAPI spec                                                                        |
| `appsettings.json`, `appsettings.Development.json` | Configuration                                                                                                                     |
| `config.nswag`                                     | NSwag client generation config                                                                                                    |
| `Web.http`                                         | HTTP request samples for testing                                                                                                  |

---

## 5. `tests/` — Test Projects (mirror src layers)

| Project                            | Purpose                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Domain.UnitTests/`                | Pure unit tests for entities/value objects (e.g. `ColourTests.cs`)                                                                     |
| `Application.UnitTests/`           | Tests for behaviours, validators, mappings — no DB                                                                                     |
| `Application.FunctionalTests/`     | End-to-end against real DB via `CustomWebApplicationFactory`, `Testing.cs`, Testcontainers (`PostgreSQLTestcontainersTestDatabase.cs`) |
| `Infrastructure.IntegrationTests/` | Integration tests for Infrastructure components                                                                                        |

---

## 6. `infra/` — Azure Bicep IaC

- `main.bicep` + `main.parameters.json` — entry point
- `core/` — reusable Bicep modules grouped by service: `database/`, `host/`, `monitor/`, `security/`, `networking/`, `storage/`, `ai/`, `gateway/`, `search/`
- `services/web.bicep` — app-specific service deployment
- `azure.yaml` (root) — `azd` configuration

---

## How to Add a New Feature (Workflow)

When adding e.g. a `Products` feature, the agent should create files in this exact order:

1. **Domain** — `src/Domain/Entities/Product.cs` (+ events in `Events/`, value objects if needed)
2. **Infrastructure** — `src/Infrastructure/Data/Configurations/ProductConfiguration.cs` and add `DbSet<Product>` to `ApplicationDbContext` (+ to `IApplicationDbContext`)
3. **Application** — create `src/Application/Products/` with:
   - `Commands/CreateProduct/CreateProduct.cs` + validator
   - `Queries/GetProducts/GetProducts.cs` + DTOs + VM
4. **Web** — `src/Web/Endpoints/Products.cs` inheriting `EndpointGroupBase`, mapping each command/query
5. **Tests** — add functional tests under `tests/Application.FunctionalTests/Products/`
6. **Migration** — `dotnet ef migrations add AddProducts -p src/Infrastructure -s src/Web`

---

## Golden Rules for the Agent

1. **Never** reference Infrastructure or Web from Application or Domain.
2. **Never** put EF Core attributes/types on Domain entities — use `IEntityTypeConfiguration` in Infrastructure instead.
3. Every command/query lives in **its own folder** under a feature folder.
4. Validation = FluentValidation, dispatched by `ValidationBehaviour` — do not validate inside handlers.
5. Authorization = `[Authorize]` attribute on the command/query, enforced by `AuthorizationBehaviour`.
6. Endpoints stay thin — they only call `sender.Send(command)`.
7. Cross-cutting concerns (logging, perf, exceptions) belong in `Application/Common/Behaviours/`, not in handlers.
8. New external dependencies → add interface in `Application/Common/Interfaces/`, implement in `Infrastructure/`.

---

## Verification (when reusing this structure)

- `dotnet build YourProjectName.slnx` — must compile with the dependency rule intact
- `dotnet test` — all 4 test projects pass
- Inspect references: `Domain.csproj` has zero `ProjectReference` entries; `Application.csproj` references only Domain.
- `dotnet run --project src/Web` — app starts, OpenAPI at `/api/specification.json`.

---

## Critical Files to Keep in Sync When Cloning This Architecture

- `Directory.Build.props` / `Directory.Packages.props` — central versioning
- `global.json` — pinned SDK
- `src/Application/DependencyInjection.cs`
- `src/Infrastructure/DependencyInjection.cs`
- `src/Web/DependencyInjection.cs` + `Program.cs`
- `src/Application/Common/Interfaces/IApplicationDbContext.cs` (contract bridge)
- `src/Infrastructure/Data/ApplicationDbContext.cs` (its implementation)
