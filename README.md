# SnapAccount

Mobile-first SME financial platform for India: accounting from a photo, GST filing (GSTR‑1, GSTR‑3B, e‑invoicing, e‑way bill), business loan packaging with partner banks, ITR filing for individuals and SMEs, plus a human-in-the-loop CA/ops workflow (chat, callbacks, notice tracking). Designed around the "Technology + Human Service" model — users capture documents on mobile; OCR + ledger automation prepares the data; CAs and operators review, approve, and file via the admin web app.

The platform is built as **3 .NET 10 composite services** (Platform, Finance, Assist) hosting 12 business modules, a React 19 admin web app, an Expo SDK 52 React Native mobile app, and a single PostgreSQL 17 database with schema-per-service isolation. Cloud target is Google Cloud (asia-south1, Mumbai) for DPDP Act 2023 compliance.

---

## Tech Stack

**Backend** — .NET 10, C# 14, Clean Architecture, EF Core 10, .NET Aspire, YARP API Gateway (:5000), MediatR, FluentValidation, xUnit. **3 composites** (Platform :5201, Finance :5202, Assist :5203) hosting 12 modules; clients use the gateway on :5000.

**Frontend (admin)** — React 19, TypeScript (strict), Vite 5, TanStack Query v5, React Router v7, Tailwind CSS v4, Zod, vitest + Testing Library, react-i18next (en/hi/bn).

**Mobile** — Expo SDK 52+, React Native, TypeScript, React Navigation v7, NativeWind, react-i18next, Expo SecureStore (tokens), expo-local-authentication (biometric), expo-notifications (FCM), Jest.

**Database** — PostgreSQL 17 + pgvector. Schema-per-service. 30 migrations.

**Cloud** — Google Cloud Platform: Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Cloud Scheduler, Memorystore Redis (SignalR backplane), Secret Manager, Artifact Registry. Region: asia-south1 (Mumbai).

**Auth** — Firebase Auth (phone OTP, Google/Apple sign-in).

**AI / OCR** — Google Document AI (OCR), Vertex AI / Gemini, Sarvam AI (Indian-language NLP).

**Real-time** — SignalR over WebSocket with Redis backplane (ChatService).

**Background jobs** — Cloud Scheduler + Pub/Sub (preferred) for recurring jobs; Hangfire for in-request continuations.

**Notifications** — FCM (push), MSG91 (SMS, TRAI DLT-registered), SendGrid (email).

**Payments** — Razorpay (HMAC-verified webhooks).

**Monitoring** — Firebase Crashlytics (mobile), Cloud Monitoring (backend).

---

## Prerequisites

| Tool | Required version |
|---|---|
| .NET SDK | 10.0+ |
| Node.js | 20 LTS or newer |
| npm | 10+ |
| PostgreSQL | 17 (with pgvector extension) |
| Docker + Docker Compose | latest |
| Expo CLI | bundled (`npx expo`) |
| Xcode | 15+ (only for iOS Simulator builds) |
| Android Studio | Hedgehog+ (only for Android Emulator builds) |
| gcloud CLI | latest (only for GCP work) |

Optional but recommended: `dotnet ef` global tool (`dotnet tool install --global dotnet-ef`).

---

## Local Setup

### a. Clone the repo

```bash
git clone https://github.com/<org>/snapaccount.git
cd snapaccount
```

### b. Copy `.env.example` → `.env.local` and fill values

```bash
cp .env.example .env.local
# (Repeat for sub-project envs that the components need)
cp src/admin/.env.example src/admin/.env.local      # if a component-specific example exists
```

`.env.local` is **gitignored**. Never commit it. The `.env.example` file lists every variable required by the platform with comments explaining the source for each (Firebase Console / GCP Secret Manager name / vendor portal URL). Leave external API credentials (`GSTN_*`, `IRP_*`, `EWB_*`, `MSG91_*`, `SENDGRID_*`, `RAZORPAY_*`) blank during local development — services fall back to mock adapters when keys are absent.

For default seeded developer credentials see **`CREDENTIALS.local.md`** (gitignored — kept locally for your own reference).

### c. Install dependencies

```bash
# Backend
cd backend && dotnet restore && cd ..

# Admin frontend
cd src/admin && npm install && cd ../..

# Mobile
cd mobile && npm install && cd ..
```

### d. Run database migrations + seed

```bash
# Start Postgres + Redis only (fastest path for backend dev)
docker compose up postgres redis -d

# Wait for postgres to be healthy
docker compose ps

# Set DB password secret (once per composite WebApi)
cd backend/Services/PlatformService/Platform.WebApi
dotnet user-secrets init
dotnet user-secrets set "DB_PASSWORD" "postgresql"
cd ../../../..

# EF migrations (example — Auth module under Platform)
cd backend/Services/PlatformService/Platform.Infrastructure
dotnet ef database update --startup-project ../Platform.WebApi
cd ../../../..

# Seed reference data (idempotent)
psql -h localhost -U postgres -d snapaccount -f database/migrations/999_seed_reference_data.sql
```

The `database/migrations/` folder contains 30 numbered SQL files (001 → 030) and a `999_seed_reference_data.sql`. They are additive and idempotent — safe to re-run.

### e. Start the backend

```bash
# Recommended: run all 3 composites + API gateway via .NET Aspire
cd backend
dotnet run --project Services/AppHost
# API Gateway: http://localhost:5000/healthz
# Aspire dashboard: https://localhost:17241
```

Clients call **one URL** — `http://localhost:5000` — not the composite ports directly:

| Client | Config |
|--------|--------|
| Admin (`src/admin`) | Vite proxies `/api` → gateway :5000 |
| Mobile (`mobile/app.json`) | `extra.apiBaseUrl`: `http://localhost:5000` (use LAN IP on physical device) |

To run a single composite (debug only):

```bash
cd backend/Services/PlatformService/Platform.WebApi && dotnet run   # :5201
cd backend/Services/FinanceService/Finance.WebApi && dotnet run    # :5202
cd backend/Services/AssistService/Assist.WebApi && dotnet run     # :5203
```

Legacy note — do not use old per-module Api paths; all hosts are composite WebApi projects.

### f. Start the frontend(s)

```bash
# Admin web (Vite dev server)
cd src/admin
npm run dev
# → http://localhost:5173

# Mobile (Expo dev server)
cd mobile
npm start              # then press i (iOS sim), a (Android emu), or scan QR with Expo Go
```

### g. Run tests

```bash
# Backend (xUnit)
cd backend && dotnet test

# Admin (vitest + Testing Library)
cd src/admin && npx vitest run

# Mobile (Jest)
cd mobile && npx jest
```

Lint + type checks:

```bash
cd src/admin && npm run lint && npm run build       # vite build catches TS errors
cd mobile && npm run lint && npm run type-check
```

---

## Default Seeded Users

Seed data creates accounts for these roles for local development:

- **User** — standard end-user (SME owner).
- **Admin** — operations / CA-side reviewer.
- **Super Admin** — platform administrator.

> Credentials are set via `.env.local`. See `.env.example` for the required variables and seed defaults. Contact the team lead for production / staging credentials. Local developer credentials for your own reference are kept in `CREDENTIALS.local.md` (gitignored — not committed).

---

## Project Structure

```
snapaccount/
├── backend/                       # .NET 10 — 3 composites + gateway
│   ├── Services/
│   │   ├── AppHost/               # .NET Aspire orchestration entry point
│   │   ├── Gateway/               # YARP API gateway (:5000)
│   │   ├── PlatformService/       # Auth, Subscription, Notification (:5201)
│   │   ├── FinanceService/        # Document, Accounting, GST, Loan, ITR, Report (:5202)
│   │   └── AssistService/         # Chat, AI, Callback (:5203)
│   ├── ServiceDefaults/           # Aspire shared defaults
│   └── Shared/                    # Common base types, value objects (PAN/GSTIN/Money)
│
├── src/admin/                     # React 19 admin panel (Vite)
│   ├── src/
│   │   ├── pages/                 # Dashboard, callbacks, gst, itr, loans, chat, …
│   │   ├── components/            # ui/, shared/, widgets/
│   │   ├── lib/                   # API clients (TanStack Query) + Zod schemas
│   │   ├── contexts/              # ThemeContext, AuthContext
│   │   ├── i18n/                  # en/hi/bn JSON
│   │   └── __tests__/             # vitest specs
│   └── vite.config.ts
│
├── mobile/                        # Expo SDK 52 React Native
│   ├── src/
│   │   ├── screens/               # 40+ screens across auth, documents, gst, itr, loans, chat
│   │   ├── components/            # Reusable RN components
│   │   ├── api/                   # API clients
│   │   ├── hooks/                 # useDocumentQueue, useHaptics, useSensitiveScreen
│   │   ├── notifications/         # pushTokenManager, notificationRouter (deep-links)
│   │   ├── navigation/            # React Navigation stacks
│   │   └── i18n/
│   ├── __tests__/                 # Jest specs
│   ├── ios/                       # Native iOS project
│   └── App.tsx
│
├── database/
│   ├── migrations/                # 30 numbered .sql files (additive, idempotent)
│   └── init/                      # Init scripts for first-time bootstrap
│
├── docs/
│   ├── api/endpoints.md           # API contract (authoritative)
│   ├── database/                  # Schema overview + ER diagrams
│   ├── design/                    # UI/UX specs (admin/, mobile/, component-library.md)
│   ├── devops/                    # Runbooks, decision docs, observability SLOs
│   └── security/                  # Security review history + DPDP cascade specs
│
├── infra/                         # gcloud CLI provisioning scripts
│   ├── setup.sh                   # One-time GCP bootstrap (Secrets, Pub/Sub, GCS, IAM)
│   ├── cloud-run-services.sh      # Per-service Cloud Run deployment
│   ├── pubsub-scheduler-recurring-jobs.sh
│   └── cloud-monitoring-dashboards.sh
│
├── tests/
│   ├── unit/                      # Per-service xUnit projects
│   └── integration/               # Real-Postgres integration tests (testcontainers)
│
├── .github/workflows/             # CI/CD (ci.yml, cd-staging.yml, cd-production.yml, db-migrate.yml)
├── docker-compose.yml             # Local Postgres, Redis, services
├── .env.example                   # Documented environment variables (commit this)
├── CLAUDE.md                      # Engineering conventions / agent instructions
└── README.md                      # ← you are here
```

---

## Available Scripts / Commands

### Backend

```bash
cd backend
dotnet run --project Services/AppHost                    # all 12 services via Aspire
dotnet test                                     # all xUnit tests
dotnet test --filter "Category=Unit"            # unit only
dotnet build                                    # 0-warnings policy
```

EF Core migrations (per service):

```bash
cd backend/Services/<Name>Service/<Name>Service.Infrastructure
dotnet ef migrations add <MigrationName> --startup-project ../<Name>Service.Api
dotnet ef database update --startup-project ../<Name>Service.Api
```

### Admin frontend

```bash
cd src/admin
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # type-check + production bundle
npm run lint         # ESLint (zero-warnings enforced)
npx vitest           # interactive test runner
npx vitest run       # single CI run
npx vitest --coverage
```

### Mobile

```bash
cd mobile
npm start            # Expo Go dev server
npm run ios          # native iOS simulator build
npm run android      # native Android emulator build
npm run lint
npm run type-check   # tsc --noEmit
npx jest             # unit + component tests
npx expo-doctor      # config validation
```

### Local infrastructure

```bash
docker compose up postgres redis -d              # minimum for backend dev
docker compose up -d                             # everything (services + admin)
docker compose down -v                           # nuke + remove volumes
```

---

## Contributing Notes

- **Conventions live in `CLAUDE.md`** — read it before opening a PR. Highlights:
  - Backend: CQRS via MediatR; never throw exceptions across boundaries — return `Result<T>`. FluentValidation for all input. EF entity configs in separate files (no data annotations). C# 14 primary constructors + collection expressions.
  - Frontend: TypeScript strict; functional components only; TanStack Query for all server state (no manual fetch+useEffect); all API calls via `src/admin/src/lib/`; all user-visible text via `t()` (en/hi/bn).
  - Mobile: SecureStore for auth tokens (NEVER AsyncStorage for sensitive data); minimum touch target 44×44 pt; NativeWind for styling.
  - Database: snake_case columns, UUID PKs, soft delete (`deleted_at`), indexes on every FK + frequently-queried column, RLS on user-scoped tables, DPDP cascade for any new PII column.

- **File ownership boundaries** are documented in `CLAUDE.md` to prevent merge conflicts during multi-agent / multi-developer work. Stay within your area of ownership.

- **Indian compliance is non-negotiable.** GST rates, ITR slabs, and ITR forms change with each Finance Act — keep these config-driven (`itr.tax_slab_versions`, GST rate tables) and never hard-code. DPDP Act 2023 (right to erasure, 7-year retention, data localization to asia-south1) is enforced at the database layer with `BEFORE DELETE` triggers and at the application layer with `AccountDeletionSubscriber` background services per microservice.

- **Tests:**
  - Backend ≥ 80% unit-test coverage per service; integration tests must hit real Postgres (no mocks — testcontainers).
  - Frontend ≥ 80% on new pages; Zod fixtures for every API client.
  - Mobile: Jest + Testing Library; snapshot tests acceptable when simulator is unavailable.

- **Security review** is part of every phase gate. Findings are tracked in `docs/security/security-report.md`. Common pattern carry-forward: ICurrentUser injection, EF inline org filter on queries, post-fetch NotFound on commands, PermissionBehavior pipeline, AccountDeletionSubscriber, idempotency, HMAC with `CryptographicOperations.FixedTimeEquals`, signed URL TTL ≤ 15 min.

- **Phase / plan documents** live under `.claude/orchestrator/`. Read `phase-6-gap-analysis.md` for current production-readiness state and `bug-log.md` for live security findings + cross-agent handoff items.

---

## License

Proprietary — © 2026 SnapAccount. All rights reserved.

This repository is private and contains confidential code and design. Do not redistribute, copy, or share access without explicit written permission from the team lead.
