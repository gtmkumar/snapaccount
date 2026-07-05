# AGENTS.md

## Project Overview

SnapAccount is a mobile-first SaaS platform for Indian SMEs that simplifies accounting, GST filing, loan processing, and ITR filing. Users photograph bills and invoices; the backend team (humans + AI) processes them into proper accounting entries.

Architecture: **3 composite services** (.NET 10) hosting 12 modules, React 19 admin panel, React Native (Expo) mobile app, PostgreSQL 17 with schema-per-service isolation. Cloud: Google Cloud Platform + Firebase (zero-budget friendly).

## Setup Commands

```bash
# Prerequisites
dotnet --version    # .NET 10 SDK
node --version      # Node.js 22+ LTS
pnpm --version      # pnpm 9+
docker --version    # Docker Desktop

# Backend
cd backend && dotnet restore && dotnet build
dotnet run --project Services/AppHost  # Starts all services via .NET Aspire

# Frontend (Admin Panel)
cd src/admin && pnpm install && pnpm dev  # http://localhost:5173

# Mobile
cd mobile && pnpm install && npx expo start

# Database (local)
docker-compose up -d postgres  # PostgreSQL 17 on localhost:5432
# Connection: Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql

# Full local stack
docker-compose up -d
```

## Code Style

### Backend (.NET / C#)
- C# 14 with primary constructors, collection expressions
- Clean Architecture: Domain -> Application -> Infrastructure -> WebApi
- CQRS via MediatR (Commands + Queries, never mix)
- Result<T> pattern for error handling — never throw exceptions across boundaries
- All public methods must have XML doc comments
- FluentValidation for input validation
- snake_case for database columns; PascalCase for C# properties
- EF Core conventions: entity configs in separate files, never data annotations

### Frontend (React / TypeScript)
- TypeScript strict mode
- Functional components only, no class components
- TanStack Query for all server state — no manual fetch/useEffect patterns
- All API calls through src/admin/src/api/ — never raw fetch elsewhere
- Zod for runtime API response validation
- All user-visible text through react-i18next t() — no hardcoded strings
- Tailwind CSS v4 for styling — no inline styles or CSS modules
- ESLint + Prettier enforced via Husky pre-commit

### Mobile (React Native / Expo)
- Expo SDK 52+ with TypeScript
- React Navigation v7 for routing
- NativeWind (Tailwind for RN) for styling
- Expo SecureStore for auth tokens — NEVER AsyncStorage for sensitive data
- All user-visible text through react-i18next t()
- Minimum touch target: 44x44pt

### Database (PostgreSQL 17)
- snake_case for all table and column names
- UUID primary keys on all tables
- Every entity table: created_at, updated_at, deleted_at (soft delete)
- Indexes on all foreign keys and frequently queried columns
- Schema-per-service: auth.*, document.*, accounting.*, gst.*, loan.*, itr.*, chat.*, notification.*, report.*, subscription.*, ai.*
- RLS enabled on user-owned tables
- pgvector with HNSW index for embedding columns

## Testing Instructions

```bash
# Backend tests
cd backend && dotnet test                          # All unit + integration tests
cd backend && dotnet test --filter "Category=Unit"  # Unit tests only

# Frontend tests
cd src/admin && pnpm test          # Vitest + React Testing Library
cd src/admin && pnpm run lint      # ESLint check
cd src/admin && pnpm run typecheck # TypeScript check

# Mobile tests
cd mobile && npx jest              # Unit + component tests
cd mobile && npx expo-doctor       # Config validation

# E2E tests
cd tests/e2e && npx playwright test  # Browser E2E (Playwright)
```

## Project Structure

```
snapaccount/
  backend/
    ServiceDefaults/      # Shared Aspire defaults
    Services/
      AppHost/            # .NET Aspire orchestrator
      Gateway/            # YARP API gateway (:5000)
      PlatformService/    # Platform.{Domain,Application,Infrastructure,WebApi}
      FinanceService/     # Finance.{Domain,Application,Infrastructure,WebApi}
      AssistService/      # Assist.{Domain,Application,Infrastructure,WebApi}
    Shared/               # SnapAccount.Shared.{Domain,Application,Infrastructure,Api}
  src/admin/              # React 19 admin panel (web)
  mobile/                 # React Native (Expo) mobile app
  database/               # SQL migrations per service schema
  .claude/                # Agent team setup, orchestrator state, QA reports
    agent-team-setup.md   # Team configuration and agent prompts
    agent-teams-reference.md # Agent teams reference guide
    orchestrator/         # Project brief, status, phase summaries
    qa/                   # QA test reports
  docs/                   # Project documentation (design, database, devops, security)
  infra/                  # GCP Terraform / gcloud CLI scripts
  .github/                # CI/CD workflows
  tests/                  # Integration + E2E tests
```

## Dev Environment Tips

- Use .NET Aspire AppHost to run all backend services locally — it handles service discovery, health checks, and telemetry automatically
- PostgreSQL runs in Docker; each microservice uses its own schema within the single `snapaccount` database
- Never hardcode API URLs or secrets — use environment variables (VITE_API_BASE_URL for frontend, app.config.ts extras for mobile)
- All Azure credentials must use DefaultAzureCredential — never hardcode keys
- For local Azure emulation, Azurite runs in docker-compose for Blob Storage and Queues

## Security Considerations

- JWT auth via Firebase Auth — phone OTP primary, Google/Apple sign-in secondary
- All secrets in Google Secret Manager (production) or environment variables (local dev)
- Firebase Auth tokens validated server-side via Firebase Admin SDK
- Input validation on every API endpoint before processing
- Rate limiting: 20 req/min per user for AI endpoints, 100 req/min for standard
- File uploads: validate type + size (5MB max) before processing
- Google Cloud Storage: signed URLs with expiry, IAM-based access control
- PII fields encrypted at rest, never logged, never in API error responses
- DPDP Act 2023 compliance: right to erasure, consent management, data localization
- No raw AI model responses to API consumers — always map to application DTOs

## Indian Government Compliance

This app is heavily dependent on Indian government policy. Key areas:
- **GST rates** (0/5/12/18/28%) change with government notifications — must be configurable, not hardcoded
- **Tax slabs** change annually in the Union Budget — version and store historically
- **ITR forms** (ITR-1 through ITR-7) change each assessment year
- **E-invoicing** thresholds change (currently mandatory > 5Cr turnover)
- **GSTN API** specifications update periodically
- **Income Tax portal** APIs change with new portal versions

Design all tax/compliance logic to be configuration-driven with versioning by financial year.

## PR Instructions

- Title: imperative mood, under 70 characters (e.g., "Add GST 2A/2B reconciliation endpoint")
- Include test coverage for all new endpoints
- Run `dotnet build` (zero warnings), `pnpm lint`, `pnpm test` before submitting
- Never commit .env files, credentials, or API keys
