# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SnapAccount — Mobile-first SME financial platform for accounting, GST filing, loan processing, and ITR filing in India. Technology + Human Service model.

## Tech Stack

- Backend: .NET 10, C# 14, Clean Architecture, EF Core 10, .NET Aspire, MediatR, Microservices (12 services)
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
# Run all 12 microservices via Aspire (preferred)
cd backend && dotnet run --project AppHost
# Aspire dashboard: http://localhost:15888

# Run a single service
cd backend/Services/AuthService/AuthService.Api && dotnet run

# Set DB password secret (required once per service before first run)
cd backend/Services/<ServiceName>/<ServiceName>.Api
dotnet user-secrets init && dotnet user-secrets set "DB_PASSWORD" "postgresql"

# Run all backend tests (xUnit)
cd backend && dotnet test
cd backend && dotnet test --filter "Category=Unit"  # Unit tests only

# Run tests for a specific service
cd tests/unit/AuthService && dotnet test
cd tests/integration/AuthService && dotnet test

# Add EF Core migration for a service
cd backend/Services/<ServiceName>/<ServiceName>.Infrastructure
dotnet ef migrations add <MigrationName> --startup-project ../<ServiceName>.Api
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

### Backend — Clean Architecture per Service

Each microservice (`backend/Services/<Name>Service/`) follows this 4-layer structure:
- `<Name>Service.Api` — ASP.NET Core controllers, minimal API endpoints, DI wiring, Hangfire jobs
- `<Name>Service.Application` — MediatR commands/queries, validators, CQRS handlers
- `<Name>Service.Domain` — entities, domain events, value objects (no dependencies)
- `<Name>Service.Infrastructure` — EF Core DbContext, repositories, external service adapters

Shared base types live in `backend/Shared/`:
- `SnapAccount.Shared.Domain` — `BaseEntity`, `Result<T>`, `Error`, `ValueObject`, `IDomainEvent`, `DomainEvent`
- `SnapAccount.Shared.Domain/ValueObjects/` — Indian-format value objects: `PanNumber`, `GstinNumber`, `AadhaarLastFour`, `PhoneNumber`, `Money`
- `SnapAccount.Shared.Application` — `ICommand`, `IQuery`, `ICommandHandler<T>`, `IQueryHandler<T,R>`, `ICurrentUser`, `PaginatedQuery`
- `SnapAccount.Shared.Application/Behaviors/` — MediatR pipeline: `ValidationBehavior` (FluentValidation), `LoggingBehavior`
- `SnapAccount.Shared.Infrastructure` — `BaseDbContext`, `FirebaseAuthMiddleware`, `GoogleCloudStorageService`, `GooglePubSubPublisher`

All services share a single PostgreSQL database with schema-per-service isolation. .NET Aspire (`AppHost`) handles service discovery and wires all services together with named references (`auth-service`, `document-service`, etc.).

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

### Microservices

Auth, Document, Accounting, GST, Loan, ITR, Chat, Notification, Report, Subscription, AI, Callback — each in `backend/Services/<Name>Service/` with the 4-layer Clean Architecture structure. (Callback added 2026-04-25 in Phase 6E.)

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
