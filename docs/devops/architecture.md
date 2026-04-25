# SnapAccount — DevOps & GCP Architecture

> Produced by: devops-engineer
> Date: 2026-04-04
> Region: asia-south1 (Mumbai) — DPDP Act 2023 data localization compliance

---

## GCP Architecture Diagram (ASCII)

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
  │  └──────────────────────┬──────────────────────────┘  │                        │
  │                         │                             │                        │
  │  ┌──────────────────────▼──────────────────────────┐  │                        │
  │  │              admin-panel (Cloud Run)             │  │                        │
  │  │              React 19 + nginx                    │  │                        │
  │  │              min=1, max=5, public                │  │                        │
  │  └──────────────────────┬──────────────────────────┘  │                        │
  │                         │ (API calls, JWT from Firebase)                       │
  │  ┌──────────────────────▼──────────────────────────────────────────────────┐   │
  │  │                 VPC: snapaccount-vpc (10.0.0.0/20)                      │   │
  │  │              Serverless VPC Access Connector                             │   │
  │  │                                                                          │   │
  │  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
  │  │  │                  Cloud Run Services (internal)                   │   │   │
  │  │  │                                                                  │   │   │
  │  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │   │
  │  │  │  │ auth-service│  │doc-service  │  │   accounting-service    │ │   │   │
  │  │  │  │ min=1 max=10│  │ min=1 max=10│  │    min=1 max=8          │ │   │   │
  │  │  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │   │   │
  │  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │   │
  │  │  │  │  gst-service│  │ loan-service│  │     itr-service         │ │   │   │
  │  │  │  │ min=1 max=10│  │ min=1 max=5 │  │    min=1 max=8          │ │   │   │
  │  │  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │   │   │
  │  │  │  ┌─────────────┐  ┌─────────────────┐  ┌────────────────────┐  │   │   │
  │  │  │  │ chat-service│  │notif-service    │  │  report-service    │  │   │   │
  │  │  │  │ min=1 max=10│  │ min=1 max=5     │  │  min=0 max=5       │  │   │   │
  │  │  │  └─────────────┘  └─────────────────┘  └────────────────────┘  │   │   │
  │  │  │  ┌───────────────────┐  ┌─────────────────────────────────────┐ │   │   │
  │  │  │  │subscription-svc   │  │          ai-service                 │ │   │   │
  │  │  │  │ min=1 max=5       │  │  min=0 max=8 (GPU-ready)            │ │   │   │
  │  │  │  └───────────────────┘  └─────────────────────────────────────┘ │   │   │
  │  │  └──────────────────────────────────────────────────────────────────┘   │   │
  │  │                                                                          │   │
  │  │  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │   │
  │  │  │  Cloud SQL PostgreSQL 17    │  │  Cloud Memorystore Redis 7.2     │  │   │
  │  │  │  (private IP, no public EP) │  │  (private IP, VPC-attached)      │  │   │
  │  │  │  db-f1-micro → db-g1-small  │  │  Basic 1GB → upgrade as needed   │  │   │
  │  │  │  auto-backup 02:00 daily    │  │  Used for: session cache,         │  │   │
  │  │  │  11 schemas (one per svc)   │  │  SignalR backplane, rate limits   │  │   │
  │  │  └─────────────────────────────┘  └──────────────────────────────────┘  │   │
  │  └──────────────────────────────────────────────────────────────────────────┘   │
  │                                                                                 │
  │  ┌──────────────────────────────────────────────────────────────────────────┐   │
  │  │  Managed GCP Services (outside VPC but same project/region)              │   │
  │  │                                                                          │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │   │
  │  │  │  Cloud Pub/Sub     │  │  Secret Manager  │  │  Artifact Registry   │ │   │
  │  │  │  10 topics         │  │  ~20 secrets     │  │  asia-south1         │ │   │
  │  │  │  dead-letter queues│  │  CMEK encrypted  │  │  Docker images       │ │   │
  │  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │   │
  │  │  │  Cloud Storage     │  │  Google Document │  │  Vertex AI           │ │   │
  │  │  │  3 buckets         │  │  AI (OCR)        │  │  Gemini 1.5 Pro      │ │   │
  │  │  │  7-yr lifecycle    │  │                  │  │  asia-south1         │ │   │
  │  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │   │
  │  │  ┌────────────────────┐  ┌──────────────────┐                            │   │
  │  │  │  Cloud Monitoring  │  │  Firebase Auth   │                            │   │
  │  │  │  + Cloud Logging   │  │  Phone OTP       │                            │   │
  │  │  │  + Alerting        │  │  Google/Apple    │                            │   │
  │  │  └────────────────────┘  └──────────────────┘                            │   │
  │  └──────────────────────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────────────────────┘

  External (not in GCP):
    Firebase Crashlytics (mobile crash reporting)
    MSG91 (SMS/OTP)
    SendGrid (transactional email)
    Razorpay (payments)
    Sarvam AI (Indian NLP)
    GST Portal API / NIC E-Invoice / IT Portal (government APIs)
```

---

## Service-to-Service Communication Map

### Synchronous (HTTP, internal VPC)

All inter-service HTTP calls go via internal VPC using .NET Aspire service discovery. Cloud Run services are **not** publicly accessible to each other — calls route through private VPC.

```
Mobile App / Admin Panel
        │ (HTTPS, Firebase JWT)
        ▼
   Cloud Load Balancer
        │
        ▼
  [Each microservice endpoint — ingress=internal-and-cloud-load-balancing]

Service-to-service sync calls (HTTP/gRPC over VPC):
  auth-service         ←── all services (JWT validation helper calls)
  accounting-service   ←── report-service (pull financial data for reports)
  document-service     ←── accounting-service (fetch document metadata)
  gst-service          ←── accounting-service (pull ledger data)
  itr-service          ←── accounting-service (pull P&L for tax computation)
  loan-service         ←── accounting-service (pull financials for loan package)
  loan-service         ←── gst-service (pull GSTR-3B data)
  ai-service           ←── document-service (fetch document content for RAG)
  ai-service           ←── accounting-service (pull data for cash flow forecasting)
```

### Asynchronous (Cloud Pub/Sub)

```
Publisher                 Topic                            Subscriber(s)
──────────────────────    ───────────────────────────────  ──────────────────────────
document-service    ──►  snapaccount.document.ocr.completed ──► accounting-service
                                                              ──► gst-service
document-service    ──►  snapaccount.document.uploaded       ──► notification-service
gst-service         ──►  snapaccount.gst.return.filed        ──► notification-service
itr-service         ──►  snapaccount.itr.filed               ──► notification-service
auth-service        ──►  snapaccount.user.registered         ──► notification-service
loan-service        ──►  snapaccount.loan.status.changed     ──► notification-service
chat-service        ──►  snapaccount.chat.message.received   ──► notification-service
subscription-service──►  snapaccount.subscription.expired    ──► notification-service
subscription-service──►  snapaccount.subscription.changed    ──► auth-service
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

| Service Account | Granted Roles |
|----------------|--------------|
| auth-service-sa | secretmanager.secretAccessor, pubsub.publisher, pubsub.subscriber, run.invoker |
| document-service-sa | storage.objectAdmin, documentai.apiUser, pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| accounting-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| gst-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| loan-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| itr-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| chat-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| notification-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| report-service-sa | storage.objectCreator, pubsub.subscriber, secretmanager.secretAccessor |
| subscription-service-sa | pubsub.publisher, pubsub.subscriber, secretmanager.secretAccessor |
| ai-service-sa | aiplatform.user, pubsub.subscriber, secretmanager.secretAccessor |
| migration-runner-sa | cloudsql.client, secretmanager.secretAccessor |
| github-ci-sa | artifactregistry.writer, run.developer, run.jobs.executor, iam.serviceAccountUser, secretmanager.secretAccessor |

Note: No service account has `owner`, `editor`, or `viewer` project-level roles.

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
| auth-service | 1 | 10 | 1 | 512Mi | 80 | Always warm — cold start unacceptable for login |
| document-service | 1 | 10 | 1 | 1Gi | 80 | Extra memory for OCR payload handling |
| accounting-service | 1 | 8 | 1 | 512Mi | 80 | |
| gst-service | 1 | 10 | 1 | 512Mi | 80 | Peaks at GST filing deadlines (20th/10th of month) |
| loan-service | 1 | 5 | 1 | 512Mi | 80 | |
| itr-service | 1 | 8 | 1 | 512Mi | 80 | Peaks Jul–Aug ITR season |
| chat-service | 1 | 10 | 1 | 512Mi | 80 | SignalR WebSocket — long-lived connections |
| notification-service | 1 | 5 | 1 | 512Mi | 80 | |
| report-service | 0 | 5 | 1 | 1Gi | 80 | Scale-to-zero OK; reports are async |
| subscription-service | 1 | 5 | 1 | 512Mi | 80 | |
| ai-service | 0 | 8 | 1 | 1Gi | 80 | Scale-to-zero OK; AI calls tolerate startup latency |
| admin-panel | 1 | 5 | 1 | 256Mi | 100 | Nginx — very lightweight |

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
| Cloud Run (all 11 services + admin) | Scale-to-zero, ~100K req/mo | ~$0 (free tier) | ~0 |
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
auth-service health: https://api.snapaccount.in/auth/healthz
admin panel:         https://admin.snapaccount.in/health
```

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
        │ (all checks must pass)
        ▼
  Merge to develop
        │
        ▼
  cd-staging.yml:
    Build Docker images (11 services + admin)
    Push to Artifact Registry (asia-south1)
    Run DB migrations (Cloud Run Job)
    Deploy to Cloud Run staging (min=0)
        │
        ▼
  Merge to main
        │
        ▼
  cd-production.yml:
    Build Docker images
    Push to Artifact Registry
    ┌──────────────────────┐
    │  MANUAL APPROVAL     │  ← GitHub Environment "production" reviewers
    │  (GitHub Environments│
    └──────────────────────┘
        │ (approved)
        ▼
    Run DB migrations (Cloud Run Job, prod)
    Deploy to Cloud Run production (rolling, max 4 parallel)
    Post-deploy health checks
```

All GCP authentication uses **GitHub OIDC → Workload Identity Federation**.
Zero service account keys are stored in GitHub.

---

## Database Migration Strategy

Migrations run as **Cloud Run Jobs** (one-shot, not a long-running service):
- Job name: `snapaccount-db-migrate-prod` / `snapaccount-db-migrate-staging`
- EF Core `database update` with `--idempotent` scripts
- All 11 service migrations run sequentially in the same job
- Max retries: 0 (fail fast — DBA reviews failed migration before retry)
- Timeout: 600 seconds
- VPC-attached (connects to Cloud SQL via private IP)

Migration rollback:
- EF Core supports `database update <PreviousMigration>` for rollback
- Run manually via `db-migrate.yml` workflow_dispatch with a rollback script

---

*End of Architecture Document*
