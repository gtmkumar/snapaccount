# SnapAccount — DevOps & GCP Architecture

> Produced by: devops-engineer
> Date: 2026-04-04 · Updated: 2026-06-28 (3-composite + YARP gateway topology)
> Region: asia-south1 (Mumbai) — DPDP Act 2023 data localization compliance

---

## GCP Architecture Diagram (ASCII)

The codebase consolidates 12 modules into **3 composite .NET services** behind a **YARP API
gateway**. Each composite hosts multiple modules in a single process; module namespaces are
unchanged (e.g. `AuthService.Application`, `GstService.Application`).

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                        GCP PROJECT: snapaccount-prod                            │
  │                        Region: asia-south1 (Mumbai)                             │
  │                                                                                 │
  │  ┌──────────────────────────────────────────────────────────────────────────┐   │
  │  │  Internet                                                                │   │
  │  │                                                                          │   │
  │  │   Mobile App          Web Admin Panel          External APIs             │   │
  │  │  (React Native)      (React 19 / nginx)    (GST Portal, IT Portal,      │   │
  │  │       │                     │               Sarvam AI, etc.)            │   │
  │  └───────┼─────────────────────┼──────────────────────┼────────────────────┘   │
  │          │                     │                       │                        │
  │          ▼                     ▼                       │                        │
  │  ┌─────────────────────────────────────────────────┐  │                        │
  │  │        Cloud Armor WAF + Cloud Load Balancer    │  │                        │
  │  │   (rate limiting, DDoS protection, SSL offload) │  │                        │
  │  └──────┬──────────────────────┬────────────────────┘  │                       │
  │         │ (API traffic)        │ (admin SPA)            │                       │
  │         ▼                      ▼                        │                       │
  │  ┌──────────────────┐  ┌─────────────────────────────┐ │                       │
  │  │  api-gateway     │  │  admin-panel (Cloud Run)    │ │                       │
  │  │  YARP :8080      │  │  React 19 + nginx           │ │                       │
  │  │  min=1, max=5    │  │  min=1, max=5, public       │ │                       │
  │  │  ingress=all     │  │  ingress=all (SPA only)     │ │                       │
  │  │  /healthz        │  │  health: GET /              │ │                       │
  │  └──────┬───────────┘  └─────────────────────────────┘ │                       │
  │         │ (routes to composites via Cloud Run internal DNS)                    │
  │  ┌──────▼──────────────────────────────────────────────────────────────────┐   │
  │  │                 VPC: snapaccount-vpc (10.0.0.0/20)                      │   │
  │  │              Serverless VPC Access Connector                             │   │
  │  │                                                                          │   │
  │  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
  │  │  │          Cloud Run Services (internal-and-cloud-load-balancing)  │   │   │
  │  │  │                                                                  │   │   │
  │  │  │  ┌──────────────────────────────────────────────────────────┐   │   │   │
  │  │  │  │  platform-service (:8080)  min=1 max=10  512Mi           │   │   │   │
  │  │  │  │  Modules: Auth · Subscription · Notification             │   │   │   │
  │  │  │  │  SA: platform-service-sa   health: /healthz              │   │   │   │
  │  │  │  └──────────────────────────────────────────────────────────┘   │   │   │
  │  │  │  ┌──────────────────────────────────────────────────────────┐   │   │   │
  │  │  │  │  finance-service  (:8080)  min=1 max=10  1Gi             │   │   │   │
  │  │  │  │  Modules: Document · Accounting · GST · Loan · ITR ·    │   │   │   │
  │  │  │  │           Report                                         │   │   │   │
  │  │  │  │  SA: finance-service-sa    health: /healthz              │   │   │   │
  │  │  │  └──────────────────────────────────────────────────────────┘   │   │   │
  │  │  │  ┌──────────────────────────────────────────────────────────┐   │   │   │
  │  │  │  │  assist-service   (:8080)  min=1 max=10  1Gi             │   │   │   │
  │  │  │  │  Modules: Chat (SignalR) · AI · Callback                 │   │   │   │
  │  │  │  │  SA: assist-service-sa     health: /healthz              │   │   │   │
  │  │  │  │  session-affinity=ON  (required for SignalR WebSocket)   │   │   │   │
  │  │  │  └──────────────────────────────────────────────────────────┘   │   │   │
  │  │  └──────────────────────────────────────────────────────────────────┘   │   │
  │  │                                                                          │   │
  │  │  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │   │
  │  │  │  Cloud SQL PostgreSQL 17    │  │  Cloud Memorystore Redis 7.2     │  │   │
  │  │  │  (private IP, no public EP) │  │  (private IP, VPC-attached)      │  │   │
  │  │  │  db-f1-micro → db-g1-small  │  │  Basic 1GB → STANDARD_HA prod   │  │   │
  │  │  │  auto-backup 02:00 daily    │  │  Used for: session cache,         │  │   │
  │  │  │  12 schemas (one per module)│  │  SignalR backplane, rate limits   │  │   │
  │  │  └─────────────────────────────┘  └──────────────────────────────────┘  │   │
  │  └──────────────────────────────────────────────────────────────────────────┘   │
  │                                                                                 │
  │  ┌──────────────────────────────────────────────────────────────────────────┐   │
  │  │  Managed GCP Services (outside VPC but same project/region)              │   │
  │  │                                                                          │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │   │
  │  │  │  Cloud Pub/Sub     │  │  Secret Manager  │  │  Artifact Registry   │ │   │
  │  │  │  15+ topics        │  │  ~25 secrets     │  │  asia-south1         │ │   │
  │  │  │  dead-letter queues│  │  regional replica │  │  5 Docker images     │ │   │
  │  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │   │
  │  │  │  Cloud Storage     │  │  Google Document │  │  Vertex AI           │ │   │
  │  │  │  4 buckets         │  │  AI (OCR)        │  │  Gemini 1.5 Pro      │ │   │
  │  │  │  7-yr lifecycle    │  │  asia-south1     │  │  asia-south1         │ │   │
  │  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │   │
  │  │  │  Cloud Monitoring  │  │  Firebase Auth   │  │  Cloud Scheduler     │ │   │
  │  │  │  + Cloud Logging   │  │  Phone OTP       │  │  recurring jobs      │ │   │
  │  │  │  + Alerting        │  │  Google/Apple    │  │  trigger             │ │   │
  │  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │   │
  │  └──────────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────────┘

  External (not in GCP):
    Firebase Crashlytics (mobile crash reporting)
    MSG91 (SMS/OTP)
    SendGrid (transactional email)
    Razorpay (payments)
    Sarvam AI (Indian NLP)
    GST Portal API / NIC E-Invoice / IT Portal (government APIs)

  Artifact Registry images (5 total):
    platform-service   — Platform.WebApi (.NET 10, modules: Auth/Subscription/Notification)
    finance-service    — Finance.WebApi  (.NET 10, modules: Document/Accounting/GST/Loan/ITR/Report)
    assist-service     — Assist.WebApi   (.NET 10, modules: Chat/AI/Callback)
    api-gateway        — Gateway         (.NET 10, YARP reverse proxy)
    admin-panel        — React 19 + nginx (SPA)
```

---

## Service-to-Service Communication Map

With 3 composites, modules that previously called each other across HTTP boundaries now
call each other **in-process** within the same composite. Cross-composite calls still
traverse VPC. The API gateway (YARP) is the single external entry point.

### Synchronous (HTTP, internal VPC)

External clients call only `api-gateway`. The gateway proxies to composites via Cloud Run
internal DNS. Composites are `ingress=internal-and-cloud-load-balancing` — not directly
reachable from the public internet.

```
Mobile App / Admin Panel
        │ (HTTPS, Firebase JWT)
        ▼
   Cloud Load Balancer
        │
        ▼
  api-gateway (YARP, ingress=all, :8080)
   ├─── /auth/* /subscription/* /notifications/*  ──► platform-service (internal)
   ├─── /documents/* /accounting/* /gst/*          ──► finance-service  (internal)
   │    /loans/* /itr/* /reports/*
   └─── /chat/* /ai/* /callbacks/*                 ──► assist-service   (internal)

Cross-composite sync calls (HTTP over VPC — rare; prefer in-process within composite):
  finance-service  ←── finance-service  (Loan module → GST module: GSTR-3B data)
                       (Report module → Accounting module: ledger for PDF)
  Note: modules within the same composite call each other directly in-process
        (MediatR dispatch within the same DI container), not via HTTP.
```

### Asynchronous (Cloud Pub/Sub)

Module publishers/subscribers remain the same; the physical process sending/receiving
the message is now the composite that hosts the module.

```
Publisher (module → composite)             Topic                              Subscriber (module → composite)
────────────────────────────────────────   ─────────────────────────────────  ─────────────────────────────────
Document (finance-service)  ──►  snapaccount.document.ocr.completed  ──►  Accounting (finance-service)
                                                                       ──►  Gst        (finance-service)
                                                                       ──►  AI         (assist-service)
Document (finance-service)  ──►  snapaccount.document.uploaded        ──►  Notification (platform-service)
Gst      (finance-service)  ──►  snapaccount.gst.return.filed         ──►  Notification (platform-service)
Itr      (finance-service)  ──►  snapaccount.itr.filed                ──►  Notification (platform-service)
Auth     (platform-service) ──►  snapaccount.user.registered          ──►  Notification (platform-service)
Loan     (finance-service)  ──►  snapaccount.loan.status.changed      ──►  Notification (platform-service)
Loan     (finance-service)  ──►  snapaccount.loan.events              ──►  Notification (platform-service)
Chat     (assist-service)   ──►  snapaccount.chat.message.received    ──►  Notification (platform-service)
Subscription (platform-svc) ──►  snapaccount.subscription.expired     ──►  Notification (platform-service)
Subscription (platform-svc) ──►  snapaccount.subscription.changed     ──►  Auth         (platform-service)
Platform-service            ──►  snapaccount.notification.send        ──►  Notification (platform-service)
Assist-service              ──►  snapaccount.callback.events          ──►  Notification (platform-service)
Cloud Scheduler             ──►  snapaccount.recurring-jobs.due       ──►  platform-service + finance-service
Auth     (platform-service) ──►  account-deletion-events              ──►  Loan/Gst/Itr/Notification/
                                                                            Subscription/Chat/Callback modules
```

All Pub/Sub topics have:
- 7-day message retention
- Dead-letter topics (retain 14 days)
- Max 5 delivery attempts before dead-lettering

---

## Security Configuration

### VPC & Network Isolation

```
- VPC: snapaccount-vpc (10.0.0.0/20)
- Subnet: snapaccount-subnet (asia-south1)
- Cloud Run services: vpc-egress=private-ranges-only
  → All outbound traffic (to Cloud SQL, Redis, Pub/Sub) stays within Google's private network
- Ingress: internal-and-cloud-load-balancing
  → Services not directly reachable from public internet
  → Only reachable via Cloud Load Balancer or internal VPC
- Admin panel: ingress=all (public — serves the React SPA)
- Cloud SQL: no public IP assigned, only private IP in VPC
- Redis: Memorystore, private IP only
```

### IAM Roles — Principle of Least Privilege

The 3-composite consolidation replaced 11 per-module service accounts with 3 composite SAs
plus the gateway SA. Per-module SAs still exist in the project (created by `infra/setup.sh`
for backward compatibility) but are no longer assigned to any running Cloud Run service.

| Service Account | Cloud Run Service | Granted Roles |
|----------------|-------------------|--------------|
| platform-service-sa | platform-service | secretmanager.secretAccessor, pubsub.publisher, pubsub.subscriber, run.invoker |
| finance-service-sa | finance-service | secretmanager.secretAccessor, pubsub.publisher, pubsub.subscriber, storage.objectCreator, storage.objectViewer, documentai.apiUser, aiplatform.user |
| assist-service-sa | assist-service | secretmanager.secretAccessor, pubsub.publisher, pubsub.subscriber, aiplatform.user |
| api-gateway-sa | api-gateway | run.invoker (to call internal composites) |
| migration-runner-sa | db-migrate job | cloudsql.client, secretmanager.secretAccessor |
| github-ci-sa | CI/CD (GitHub Actions) | artifactregistry.writer, run.developer, run.jobs.executor, iam.serviceAccountUser, secretmanager.secretAccessor |
| cloud-scheduler-sa | Cloud Scheduler | pubsub.publisher (recurring-jobs topic only) |

Note: No service account has `owner`, `editor`, or `viewer` project-level roles.
Note: `admin-panel` Cloud Run service uses the default compute SA (nginx SPA — no GCP API access needed).

### Secret Manager

All credentials are stored in Secret Manager with:
- Regional replication (asia-south1 only — DPDP Act compliance)
- Accessed by services at runtime via Secret Manager API (never in container image)
- Injected as environment variables via `--set-secrets` in Cloud Run

Secrets catalog:
```
db-connection-string-prod        → PostgreSQL connection string (prod)
db-connection-string-staging     → PostgreSQL connection string (staging)
redis-connection-string-prod     → Redis connection string (prod)
redis-connection-string-staging  → Redis connection string (staging)
firebase-service-account-json    → Firebase Admin SDK SA JSON
firebase-web-api-key-prod        → Firebase web API key (prod)
firebase-web-api-key-staging     → Firebase web API key (staging)
firebase-web-app-id-prod         → Firebase web app ID (prod)
firebase-web-app-id-staging      → Firebase web app ID (staging)
firebase-auth-domain             → Firebase auth domain
jwt-secret-key                   → JWT signing key
msg91-api-key                    → MSG91 SMS API key
sendgrid-api-key                 → SendGrid email API key
razorpay-key-id                  → Razorpay key ID
razorpay-key-secret              → Razorpay key secret
sarvam-ai-api-key                → Sarvam AI API key
gst-portal-client-id             → GST Portal client ID
gst-portal-client-secret         → GST Portal client secret
nic-einvoice-credentials         → NIC e-invoice credentials
it-portal-credentials            → IT Portal credentials
whatsapp-business-token          → WhatsApp Business token (feature-flagged off)
gcs-documents-bucket             → GCS bucket name for documents
```

### Firebase Auth

- Phone OTP, Google Sign-In, Apple Sign-In
- JWT tokens validated by each backend service via Firebase Admin SDK
- Firebase project credentials injected via Secret Manager at runtime
- 50K MAU on free tier — sufficient for zero-budget phase

### DPDP Act 2023 Compliance

- All resources in asia-south1 (Mumbai) — data localization requirement
- Cloud SQL has no public IP
- Cloud Storage buckets have `--public-access-prevention`
- User data deletion: `auth.users.deleted_at` soft-delete + Cloud Run job for hard-delete after 30-day grace period
- Consent stored in `loan.loan_consents` table with timestamp, IP, device
- Audit logs: immutable, stored in `shared.audit_logs` + archived to GCS with COLDLINE/ARCHIVE lifecycle

---

## Scaling Configuration

### Cloud Run — Production

| Service | Min Instances | Max Instances | CPU | Memory | Concurrency | Notes |
|---------|:---:|:---:|-----|--------|:-----------:|-------|
| platform-service | 1 | 10 | 1 | 512Mi | 80 | Hosts Auth + Subscription + Notification; warm — cold start unacceptable for login |
| finance-service | 1 | 10 | 1 | 1Gi | 80 | Hosts Document/Accounting/GST/Loan/ITR/Report; 1Gi for OCR + QuestPDF payloads |
| assist-service | 1 | 10 | 1 | 1Gi | 80 | Hosts Chat/AI/Callback; 1Gi for SignalR + Vertex AI; session-affinity=ON |
| api-gateway | 1 | 5 | 1 | 256Mi | 200 | YARP is stateless; higher concurrency (200) and lighter memory |
| admin-panel | 1 | 5 | 1 | 256Mi | 100 | nginx SPA — very lightweight |

**Peak load notes (inherited from per-module analysis):**
- `finance-service` peaks at GST filing deadlines (20th/10th of month) and Jul–Aug ITR season.
- `assist-service` holds long-lived WebSocket connections — min=1 avoids cold-start on chat.
- `platform-service` peaks at login spikes (OTP SMS volumes) — min=1 keeps it always warm.

### Cloud Run — Staging

All services: min=0, max=3 (scale-to-zero to minimize cost)

### Database (Cloud SQL)

- Initial: `db-f1-micro` (1 vCPU shared, 0.6 GB RAM) — zero-budget phase
- Production: upgrade to `db-g1-small` (1 vCPU, 1.7 GB RAM) at launch
- Auto-storage increase enabled (starts 20GB, grows as needed)
- Automated backups: daily at 02:00 IST, retained 7 days
- Point-in-time recovery: enabled (7-day transaction log retention)

### Redis (Memorystore)

- Initial: BASIC tier, 1GB — sufficient for session cache + SignalR backplane
- Upgrade to STANDARD HA tier when production traffic grows

---

## Cost Estimate — Zero-Budget Phase

> Estimates in INR for low-traffic launch phase. Based on GCP pricing as of 2026.

| Resource | Config | Cost/Month (USD) | Cost/Month (INR) |
|----------|--------|:----------------:|:----------------:|
| Cloud Run (3 composites + gateway + admin) | Scale-to-zero staging; min=1 prod; ~100K req/mo | ~$0 (free tier) | ~0 |
| Cloud SQL PostgreSQL 17 | db-f1-micro, 20GB SSD | ~$10 | ~830 |
| Cloud Memorystore Redis | Basic 1GB | ~$36 | ~3,000 |
| Artifact Registry | ~5GB storage | ~$0.50 | ~42 |
| Cloud Storage | 50GB, STANDARD | ~$1 | ~83 |
| Cloud Pub/Sub | ~1GB messages/mo | ~$0 (free tier) | ~0 |
| Secret Manager | ~25 secrets, 100 access/day | ~$0.15 | ~12 |
| Cloud Monitoring | Basic metrics | ~$0 (free tier) | ~0 |
| VPC Access Connector | e2-micro × 2 | ~$9 | ~750 |
| **Total** | | **~$57/mo** | **~4,720/mo** |

Scale-up costs when production traffic grows:
- Cloud SQL → db-g1-small: +$15/mo
- Redis → STANDARD HA 2GB: +$80/mo
- Cloud Run → 1M+ requests: ~$0.40 per million additional requests

---

## Monitoring & Alerting

### Key Metrics Tracked

| Metric | Service | Alert Threshold |
|--------|---------|----------------|
| Request latency p99 | All Cloud Run | > 2000ms |
| Error rate (5xx) | All Cloud Run | > 1% over 5 min |
| Cloud SQL CPU utilization | Cloud SQL | > 80% for 5 min |
| Cloud SQL disk utilization | Cloud SQL | > 85% |
| Redis memory usage | Memorystore | > 80% |
| Pub/Sub oldest undelivered message age | All topics | > 30 min |
| Cloud Run instance count | GST/ITR services | > 8 instances (cost alert) |
| Firebase Auth errors | Auth | > 10 auth failures/min |

### Alert Notification

- Email: devops@snapaccount.in
- Escalation: PagerDuty / on-call rotation (configure when team is ready)
- Firebase Crashlytics: mobile crash alerts to mobile-dev team

### Log-Based Metrics

Cloud Logging captures all Cloud Run stdout/stderr. Key log-based metrics:
- `audit_log_events_total` — financial data access events
- `otp_failure_count` — OTP failures (fraud detection)
- `gst_filing_errors` — GST portal API failures
- `document_ocr_confidence_low` — OCR below 50% confidence (flag for manual review)

### Uptime Checks

Configure in Cloud Monitoring:
```
API Gateway (entry point):  https://api.snapaccount.in/healthz
Platform composite:         https://platform-service/healthz  (internal; check via LB path)
Finance composite:          https://finance-service/healthz   (internal; check via LB path)
Assist composite:           https://assist-service/healthz    (internal; check via LB path)
Admin panel:                https://admin.snapaccount.in/     (nginx root → 200)
```

Note: the 3 composite health endpoints are not publicly routed — monitor them via Cloud Run
health checks (`gcloud run services describe`) or route a dedicated `/internal/healthz` path
through the gateway for external uptime monitoring.

---

## CI/CD Pipeline Summary

```
Developer push to feature branch
        │
        ▼
  Pull Request to develop/main
        │
        ▼
  ci.yml: Build + Test + Lint + Migrations Dry-Run
    (3 composite .NET builds + admin npm build + mobile expo check)
        │ (all checks must pass)
        ▼
  Merge to develop
        │
        ▼
  cd-staging.yml:
    Build 5 Docker images in parallel:
      platform-service  (backend/Dockerfile, COMPOSITE_NAME=Platform)
      finance-service   (backend/Dockerfile, COMPOSITE_NAME=Finance)
      assist-service    (backend/Dockerfile, COMPOSITE_NAME=Assist)
      api-gateway       (backend/Dockerfile.gateway)
      admin-panel       (src/admin/Dockerfile)
    Push to Artifact Registry (asia-south1)
    Run DB migrations (Cloud Run Job: snapaccount-db-migrate-staging)
    Deploy to Cloud Run staging (min=0, max=3 — scale-to-zero)
        │
        ▼
  Merge to main
        │
        ▼
  cd-production.yml:
    Build same 5 Docker images
    Push to Artifact Registry
    ┌──────────────────────┐
    │  MANUAL APPROVAL     │  ← GitHub Environment "production" reviewers
    │  (GitHub Environments│
    └──────────────────────┘
        │ (approved)
        ▼
    Run DB migrations (Cloud Run Job: snapaccount-db-migrate-prod)
    Deploy 3 composites + gateway to Cloud Run production (max-parallel=3)
    Deploy admin-panel (separate job)
    Post-deploy /healthz checks on all services
```

All GCP authentication uses **GitHub OIDC → Workload Identity Federation**.
Zero service account keys are stored in GitHub.

---

## Database Migration Strategy

Migrations run as **Cloud Run Jobs** (one-shot, not a long-running service):
- Job name: `snapaccount-db-migrate-prod` / `snapaccount-db-migrate-staging`
- Raw SQL files in `database/migrations/*.sql` applied in numeric order (authoritative source)
- All 12 module schemas (`auth.*`, `document.*`, `accounting.*`, `gst.*`, `loan.*`, `itr.*`,
  `chat.*`, `notification.*`, `report.*`, `subscription.*`, `ai.*`, `callback.*`) run in the
  same job — single DB instance, schema-per-module isolation
- Max retries: 0 (fail fast — DBA reviews failed migration before retry)
- Timeout: 600 seconds
- VPC-attached (connects to Cloud SQL via private IP)
- Current migration sequence: through `database/migrations/098_*.sql`

Migration rollback:
- Run the rollback SQL manually via `db-migrate.yml` workflow_dispatch
- For PITR after data corruption: see `docs/devops/backup-restore-runbook.md` Section 1

---

*End of Architecture Document*
