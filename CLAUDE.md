# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SnapAccount — Mobile-first SME financial platform for accounting, GST filing, loan processing, and ITR filing in India. Technology + Human Service model.

## Tech Stack

- Backend: .NET 10, C# 14, Clean Architecture, EF Core 10, .NET Aspire, MediatR, **3 composite services** (Platform, Finance, Assist — 12 modules merged)
- Frontend: React 19, TypeScript, TanStack Query, React Router v7, Tailwind CSS v4
- Mobile: React Native (Expo SDK 52+), TypeScript, React Navigation v7, NativeWind
- Database: PostgreSQL 17 + pgvector extension, schema-per-service isolation
- Cloud: Google Cloud Platform (Cloud Run, Cloud Storage, Pub/Sub, Secret Manager, Artifact Registry)
- Auth: Firebase Auth (phone OTP, Google/Apple sign-in, 50K MAU free)
- AI: Semantic Kernel SDK + Google Vertex AI / Gemini API, RAG pipeline, Google Document AI (OCR), Sarvam AI (Indian languages)
- Real-time: SignalR (chat, live notifications)
- Background Jobs: Hangfire
- Monitoring: Firebase Crashlytics (mobile), Google Cloud Monitoring (backend)
- Notifications: FCM (push), MSG91 (SMS), SendGrid free tier (email)
- Payments: Razorpay

## Development Commands

### Backend (.NET / Aspire)

```bash
# Run all 3 composite services via Aspire (preferred)
cd backend && dotnet run --project Services/AppHost
# Aspire dashboard: https://localhost:17241

# Run a single composite
cd backend/Services/PlatformService/Platform.WebApi && dotnet run   # :5201
cd backend/Services/FinanceService/Finance.WebApi && dotnet run    # :5202
cd backend/Services/AssistService/Assist.WebApi && dotnet run     # :5203

# Set DB password secret (once per composite WebApi host)
cd backend/Services/PlatformService/Platform.WebApi
dotnet user-secrets init && dotnet user-secrets set "DB_PASSWORD" "postgresql"

# Run all backend tests (xUnit)
cd backend && dotnet test
cd backend && dotnet test --filter "Category=Unit"  # Unit tests only

# Run tests for a specific service
cd tests/unit/AuthService && dotnet test
cd tests/integration/AuthService && dotnet test

# Add EF Core migration for a module (example: Auth under Platform)
cd backend/Services/PlatformService/Platform.Infrastructure
dotnet ef migrations add <MigrationName> --startup-project ../Platform.WebApi
```

### Admin Frontend (React + Vite)

```bash
cd src/admin
npm install
npm run dev          # dev server
npm run build        # type-check + build
npm run lint         # ESLint (zero warnings enforced)
npx vitest           # run tests (jsdom)
npx vitest --coverage  # with coverage report
npx vitest run src/__tests__/SomeTest.test.tsx  # run a single test file
```

### Mobile (Expo / React Native)

```bash
cd mobile
npm install
npm start            # Expo dev server (Expo Go)
npm run ios          # iOS Simulator native build
npm run android      # Android Emulator native build
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
npx jest             # unit + component tests
npx expo-doctor      # config validation
```

### Local Infrastructure (Docker)

```bash
# Start PostgreSQL 17 + Redis only (fastest for backend dev)
docker compose up postgres redis -d

# Start everything (all services + admin UI)
cp .env.example .env   # fill in values first
docker compose up -d
```

## Architecture

### Backend — 3 Composite Services (laundryghar-style)

Each composite (`PlatformService`, `FinanceService`, `AssistService`) has exactly **4 projects**:
- `<Composite>.WebApi` — composite host, endpoints, DI wiring in `Program.cs`
- `<Composite>.Application` — MediatR commands/queries (module subfolders: `Auth/`, `Gst/`, etc.)
- `<Composite>.Domain` — entities, domain events, value objects
- `<Composite>.Infrastructure` — EF Core DbContext per module, repositories, adapters

| Composite | Port | Modules |
|-----------|------|---------|
| **Platform** | 5201 | Auth, Subscription, Notification |
| **Finance** | 5202 | Document, Accounting, GST, Loan, ITR, Report |
| **Assist** | 5203 | Chat, AI, Callback |

Module namespaces are unchanged (`AuthService.Application`, etc.) — only project layout changed.

Shared base types live in `backend/Shared/`:
- `SnapAccount.Shared.Domain` — `BaseEntity`, `Result<T>`, `Error`, `ValueObject`, `IDomainEvent`, `DomainEvent`
- `SnapAccount.Shared.Domain/ValueObjects/` — Indian-format value objects: `PanNumber`, `GstinNumber`, `AadhaarLastFour`, `PhoneNumber`, `Money`
- `SnapAccount.Shared.Application` — `ICommand`, `IQuery`, `ICommandHandler<T>`, `IQueryHandler<T,R>`, `ICurrentUser`, `PaginatedQuery`
- `SnapAccount.Shared.Application/Behaviors/` — MediatR pipeline (order: `LoggingBehavior` → `ValidationBehavior` (FluentValidation) → `PermissionBehavior`). RBAC is enforced by `[RequiresPermission("perm.name")]` on a command/query class
- `SnapAccount.Shared.Infrastructure` — `BaseDbContext`, `FirebaseAuthMiddleware`, `GoogleCloudStorageService`, `GooglePubSubPublisher`

All services share a single PostgreSQL database with schema-per-service isolation. .NET Aspire (`AppHost`) runs **5 runtime processes** (same consolidation *pattern* as LaundryGhar, SnapAccount's own names/ports):

```
                    ┌──────────────────┐
                    │  Aspire AppHost  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   API Gateway    │
                    │   YARP :5000     │
                    └────────┬─────────┘
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Platform :5201  │ │ Finance :5202   │ │ Assist :5203    │
│ Auth            │ │ Document        │ │ Chat            │
│ Subscription    │ │ Accounting      │ │ AI              │
│ Notification    │ │ GST, Loan, ITR  │ │ Callback        │
│                 │ │ Report          │ │                 │
└────────┬────────┴────────┬──────────┴────────┬──────────┘
         └─────────────────┼───────────────────┘
                           ▼
                 PostgreSQL / Redis
```

| Process | Port | Absorbed modules |
|---------|------|------------------|
| **API Gateway** | 5000 | Single client entry (admin, mobile) |
| **Platform** | 5201 | Auth, Subscription, Notification |
| **Finance** | 5202 | Document, Accounting, GST, Loan, ITR, Report |
| **Assist** | 5203 | Chat, AI, Callback |

Gateway: `backend/Services/Gateway/`. Aspire service names: `platform-service`, `finance-service`, `assist-service`.

For deeper backend conventions (full MediatR pipeline order, `DependencyInjection.cs` patterns, DTO placement) see `backend/CLAUDE.md`.

**Local auth bypass:** Setting `DEV_AUTH_BYPASS=true` short-circuits `FirebaseAuthMiddleware` so the admin frontend can call the backend without Firebase tokens (local dev only — never enable in deployed environments).

### Code Conventions

**Backend (.NET/C#):**
- C# 14 with primary constructors, collection expressions
- CQRS via MediatR — Commands and Queries must never be mixed
- `Result<T>` pattern for error handling — never throw exceptions across boundaries
- FluentValidation for all input validation
- snake_case for database columns; PascalCase for C# properties
- EF Core: entity configs in separate files, never data annotations

**Frontend (React/TypeScript):**
- TypeScript strict mode, functional components only
- TanStack Query for all server state — no manual fetch/useEffect patterns
- All API calls through `src/admin/src/lib/` — never raw fetch elsewhere
- All user-visible text through react-i18next `t()` — no hardcoded strings
- Tailwind CSS v4 for styling — no inline styles or CSS modules

**Mobile (React Native/Expo):**
- Expo SecureStore for auth tokens — NEVER AsyncStorage for sensitive data
- All user-visible text through react-i18next `t()`
- Minimum touch target: 44x44pt
- NativeWind (Tailwind for RN) for styling

### Composites & Modules

**3 composites** (Platform, Finance, Assist) each with 4 layer projects. **12 modules** retain their schemas and namespaces:

- **Platform** (:5201): Auth, Subscription, Notification
- **Finance** (:5202): Document, Accounting, GST, Loan, ITR, Report
- **Assist** (:5203): Chat, AI, Callback

## Database

- Connection (local dev): `Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql`
- The `appsettings.json` connection strings use `#{DB_PASSWORD}#` placeholder — set via `dotnet user-secrets set "DB_PASSWORD" "postgresql"` or env var `DB_PASSWORD`
- Schema-per-service: `auth.*`, `document.*`, `accounting.*`, `gst.*`, `loan.*`, `itr.*`, `chat.*`, `notification.*`, `report.*`, `subscription.*`, `ai.*`
- All tables: `snake_case`, UUID PKs, `created_at`/`updated_at`/`deleted_at` columns (soft delete)
- Indexes on all foreign keys and frequently queried columns
- pgvector enabled with HNSW index for RAG embeddings
- RLS on user-owned tables
- Migration SQL files in `database/migrations/`; init scripts in `database/init/`

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` — build + test on PR
- `cd-staging.yml` — deploy to staging
- `cd-production.yml` — deploy to production
- `db-migrate.yml` — run database migrations

## Agent Communication

- All agents report to: orchestrator
- Do NOT message the team lead (user) directly
- Use SendMessage with a summary field for all string messages

## File Ownership (no cross-agent edits)

- orchestrator -> .claude/orchestrator/
- db-engineer -> database/, docs/database/
- ui-ux-agent -> docs/design/
- backend-agent -> backend/
- frontend-dev -> src/admin/
- mobile-dev -> mobile/
- devops-engineer -> Dockerfile*, docker-compose*, .github/, infra/
- qa-web -> tests/, src/admin/src/**tests**/, .claude/qa/
- qa-mobile -> mobile/**tests**/, mobile/e2e/, .claude/qa/
- security-reviewer -> docs/security/ (read-only everywhere else)

## Indian Compliance

- GST rates: 0%, 5%, 12%, 18%, 28% (must be configurable — rates change with government policy)
- Tax slabs: Old Regime + New Regime (versioned — slabs change annually)
- ITR forms (ITR-1 through ITR-7) change each assessment year
- E-invoicing: Mandatory for turnover > 5 Crore (threshold changes)
- PAN format: XXXXX9999X / GSTIN: 15-character format / Aadhaar: OTP-based verification
- DPDP Act 2023: Right to erasure, data localization, consent management
- Document retention: 7 years minimum
- All tax/compliance logic must be configuration-driven with versioning by financial year
