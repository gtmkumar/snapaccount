# Phase 6A — Aspire AppHost Handoff Note for backend-agent

**Scope:** Phase 6A (OCR → Accounting Pipeline)
**Owner:** devops-engineer (authoring) → backend-agent (applying to AppHost)
**File:** `backend/AppHost/Program.cs` — owned by backend-agent; do NOT edit from devops-engineer.

---

## What backend-agent must wire in AppHost/Program.cs

The AccountingService needs three Aspire resource references added to `AppHost/Program.cs`.
Mirror the pattern already used by other services (e.g., DocumentService, GstService).

### 1. PostgreSQL database reference

AccountingService shares the single `snapaccount` PostgreSQL instance with all other services,
using the `accounting` schema for isolation (schema-per-service pattern per CLAUDE.md).

```csharp
// In AppHost/Program.cs — wire AccountingService to the shared postgres resource
var accountingService = builder.AddProject<Projects.AccountingService_Api>("accounting-service")
    .WithReference(postgres)           // shared snapaccount DB; EF Core uses schema=accounting
    .WithReference(redis)              // for distributed cache / SignalR backplane if needed
    .WaitFor(postgres);
```

The EF Core `AccountingDbContext` must configure:
- Schema: `accounting`
- MigrationsHistoryTable: `__ef_migrations_history` in schema `accounting`
- Connection string placeholder: `#{DB_PASSWORD}#` (resolved at runtime per the custom config provider)

### 2. Pub/Sub subscription reference

AccountingService subscribes to the OCR completion topic to auto-post journal entries.

**GCP resource names (already provisioned in `infra/setup.sh`):**

| Resource | GCP Name |
|---|---|
| Topic | `snapaccount.document.ocr.completed` |
| Subscription (Accounting) | `accounting-service-ocr-sub` |
| Dead-letter topic | `snapaccount.document.ocr.completed.dead-letter` |

In Aspire local dev, the `GooglePubSubPublisher` / subscriber in `SnapAccount.Shared.Infrastructure`
reads the topic/subscription from config. Set via environment variable in AppHost:

```csharp
.WithEnvironment("PUBSUB_SUBSCRIPTION_OCR", "accounting-service-ocr-sub")
.WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
.WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "local-dev")
```

For local dev with the Pub/Sub emulator (or fake-gcp-server), ensure the emulator endpoint
is set via `PUBSUB_EMULATOR_HOST=localhost:8085` in docker-compose.override.yml (already present
if using the standard local stack).

### 3. Secret references

AccountingService requires these secrets (resolved from GCP Secret Manager in prod;
from `dotnet user-secrets` in local dev):

| Secret name (GCP Secret Manager) | Local dev env var | Purpose |
|---|---|---|
| `db-connection-string-prod` | `DB_PASSWORD` (via user-secrets) | PostgreSQL connection |

No additional secrets beyond the standard DB connection are required for AccountingService
in Phase 6A. The Pub/Sub subscriber uses the service account's ambient GCP credentials
(Workload Identity on Cloud Run; ADC locally).

### 4. Service port assignment

Assign AccountingService a local dev port that does not collide with other services.
Suggested: **5005** (verify against AppHost resource list — no conflicts observed in existing code).

```csharp
.WithHttpsEndpoint(port: 5005, name: "https")
.WithHttpEndpoint(port: 5006, name: "http")
```

---

## Cloud Run service (already in infra/cloud-run-services.sh)

The `accounting-service` Cloud Run deployment is already defined in `infra/cloud-run-services.sh`
(line 143-150). The service account `accounting-service-sa` is provisioned with
`roles/pubsub.subscriber` and `roles/pubsub.publisher` in `infra/setup.sh` (line 513-517).

No changes needed to Cloud Run scripts for AccountingService in Phase 6A.

---

## Summary of what devops-engineer has verified/provisioned (Phase 6A)

| Item | Status | Where |
|---|---|---|
| Pub/Sub topic `snapaccount.document.ocr.completed` | Provisioned in setup.sh (Step 8) | `infra/setup.sh` line 353 |
| Subscription `accounting-service-ocr-sub` | Provisioned in setup.sh (Step 8) | `infra/setup.sh` line 390 |
| Dead-letter topic | Provisioned (auto-created per topic loop) | `infra/setup.sh` line 371 |
| AccountingService Cloud Run definition | Provisioned | `infra/cloud-run-services.sh` line 143 |
| `accounting-service-sa` IAM roles | Provisioned (pubsub.publisher, subscriber, secretmanager.secretAccessor) | `infra/setup.sh` line 513 |
| Dockerfile (shared `backend/Dockerfile`) | Existing — use `--build-arg COMPOSITE_NAME=AccountingService` | `backend/Dockerfile` |

---

*Phase 6A devops-engineer handoff complete. backend-agent: apply AppHost wiring per above.*
