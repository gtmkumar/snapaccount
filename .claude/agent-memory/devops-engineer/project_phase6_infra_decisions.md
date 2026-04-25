---
name: Phase 6A+6E+6B+6D Infrastructure Decisions
description: Tooling convention (gcloud shell scripts), service counts, new secrets, recurring jobs architecture, GSTN/IRP/EWB secrets, ITR Document AI, feature flags via Secret Manager
type: project
---

The repo uses **gcloud CLI shell scripts** (not Terraform). `infra/setup.sh` bootstraps GCP once; `infra/cloud-run-services.sh` deploys all services. No Terraform files exist.

The backend Dockerfile is a **single shared file** at `backend/Dockerfile` using `--build-arg SERVICE_NAME=<Name>`. No per-service Dockerfiles. Do not create per-service Dockerfiles.

**Phase 6E adds a 12th microservice: CallbackService.** This breaks the "11-service" count in CLAUDE.md and project-brief.md. Flag to orchestrator — backend-agent and orchestrator must update CLAUDE.md.

**Recurring jobs decision (Phase 6E):** Cloud Scheduler + Pub/Sub (NOT Hangfire for recurring jobs). Hangfire stays only for in-request fire-and-forget continuations in AuthService. Decision doc at `docs/devops/recurring-jobs-decision.md`.

**Why:** Cloud Run scale-to-zero incompatible with Hangfire recurring jobs (requires min-instances=1, adds ~$10/month at launch).

**How to apply:** Any future recurring job request → Cloud Scheduler job targeting `snapaccount.recurring-jobs.due` topic. Never add Hangfire recurring jobs to NotificationService.

**New Pub/Sub topics added (Phase 6A+6E):**
- `snapaccount.callback.events` — CallbackService domain events → NotificationService
- `snapaccount.recurring-jobs.due` — Cloud Scheduler trigger → NotificationService

**New secrets added to Secret Manager (Phase 6E):**
- `msg91-sender-id` — DLT-registered 6-char sender ID (needs 2-3 day registration at msg91.com/dlt before SMS go-live)
- `firebase-admin-json` — FCM push dispatch SA JSON for NotificationService (distinct name from `firebase-service-account-json`)

**Phase 6A Pub/Sub verification:** Topic `snapaccount.document.ocr.completed` and subscription `accounting-service-ocr-sub` were already present in `infra/setup.sh` before Phase 6A. No new topic needed.

**Phase 6A Document AI secret:** `google-document-ai-config` was referenced in Phase 6A but was missing from `infra/setup.sh`. Added in Phase 6B pass. Contains processor IDs per document type (JSON). Processors must be created manually in GCP Console — no CLI provisioning exists.

**Phase 6B: GSTN/IRP/EWB secrets** added to `infra/setup.sh`:
- `gstn-client-id`, `gstn-client-secret` — GSTN API (developer.gst.gov.in). Sandbox onboarding takes 5-10 business days. P6-FLAG-04 tracks status.
- `gstn-credentials-template` — documents the per-GSTIN JSON shape; ops creates `gstn-credentials-<GSTIN>` secrets individually.
- `irp-client-id`, `irp-client-secret` — IRP e-invoicing API (mandatory B2B turnover > 5 Cr).
- `ewb-client-id`, `ewb-client-secret` — e-Way Bill API.

**Phase 6B: Feature flags via Secret Manager** — flag `feature-flag-gst-production-apis-enabled` defaults to `"false"` (mock adapter). Pattern: store flags as Secret Manager secrets (string `"true"`/`"false"`) so they update without Cloud Run redeployment. GstService reads with 5-minute cache TTL.

**Phase 6B: GST Cloud Run updated** to mount all 5 new GSTN/IRP/EWB secrets plus the feature flag. GstService env vars: `GSTN_CLIENT_ID`, `GSTN_CLIENT_SECRET`, `IRP_CLIENT_ID`, `IRP_CLIENT_SECRET`, `EWB_CLIENT_ID`, `EWB_CLIENT_SECRET`, `GST_PRODUCTION_APIS_ENABLED`.

**Phase 6D: ITR Cloud Run updated** to mount `GOOGLE_DOCUMENT_AI_CONFIG` from `google-document-ai-config` secret.

**Phase 6D: Cloud Scheduler job schedule corrections** (from Phase 6E initial values):
- `itr-deadline-reminders`: 07:00 IST → 09:00 IST
- `itr-refund-polling`: 09:00 IST → 10:00 IST
- gcloud does not support seasonal cron; backend-agent gates May–September fan-out in ItrService.

**Phase 6D: Tax slab rollover runbook** at `docs/devops/itr-tax-slab-rollover-runbook.md`. Annual April 1 task: ops inserts new AY rows into `itr.tax_slab_versions` — NEVER UPDATE existing rows.

**Phase 6D: Document AI quota runbook** at `docs/devops/document-ai-quota-itr.md`. Peak: 50/hour baseline, 150/hour target for June–July Form 16 season. Alert threshold: > 5% error rate over 10 min.

**Phase 6F: SignalR + Redis + Observability (2026-04-25)**

**ChatService Cloud Run** updated in `infra/cloud-run-services.sh` with:
- `--session-affinity` (Cloud Run cookie-based sticky sessions, required for SignalR WebSocket)
- `min-instances=1` (SignalR connections die on scale-to-zero)
- `memory=1Gi` (from 512Mi — ~2,000 concurrent SignalR connections per instance)
- `REDIS_CONNECTION_STRING` env var from Secret Manager (StackExchange.Redis backplane)
- Custom deploy block (not using the shared `deploy_service` function) because `--session-affinity` is not a standard parameter in that function

**Redis setup** updated in `infra/setup.sh` Step 6:
- Connection string format changed to StackExchange.Redis format: `<host>:<port>,abortConnect=false,connectTimeout=5000,syncTimeout=5000`
- `REDIS_TIER` env var controls tier: `BASIC` (staging, ~$50/mo) vs `STANDARD_HA` (production, ~$280/mo)
- Default remains BASIC — operator must set `export REDIS_TIER=STANDARD_HA` before running for production
- Network parameter updated to full resource name format: `projects/${GCP_PROJECT_ID}/global/networks/${VPC_NAME}`
- New generic secret `redis-connection-string` placeholder added for ad-hoc use

**New Secret Manager secret (Phase 6F):** `redis-connection-string` — generic placeholder. Production/staging use `-prod`/`-staging` suffixed variants created in Step 6.

**New infra script:** `infra/cloud-monitoring-dashboards.sh` — provisions per-service RED metric dashboards (13 total: 12 services + overview) and SLO alert policies (latency + error rate, 24 total). Run after `setup.sh`. Idempotent.

**New docs (Phase 6F):**
- `docs/devops/signalr-backplane-decision.md` — why Redis backplane, backplane architecture, failure modes, backend-agent wiring instructions
- `docs/devops/observability-slos.md` — RED metrics, SLO targets per service, dashboard structure, Chat-specific metrics
- `docs/devops/backup-restore-runbook.md` — quarterly drill procedure: Cloud SQL PITR, GCS versioning, Pub/Sub retention, Secret Manager inventory
- `docs/devops/staging-to-prod-promotion.md` — 5 pre-promotion gates (QA, security, DPDP, flags, infra), blue-green Cloud Run deployment, rollback triggers + procedure

**SignalR note pre-filed for Phase 6F:** implemented. `docs/devops/signalr-cloud-run-note.md` — Cloud Run session affinity + Redis backplane now live.

**Phase 6C: Loan Hub infra additions (2026-04-25):**

- **New GCS bucket:** `{GCP_PROJECT_ID}-loan-packages` — separate from general documents bucket for RBI retention isolation. Lifecycle: COLDLINE after 90 days, DELETE after 2,557 days (7 years). Secret Manager: `gcs-loan-packages-bucket`. Do NOT use the general documents bucket for loan packages.

- **New Pub/Sub topic:** `snapaccount.loan.events` — loan domain events (Approved, Disbursed, Rejected, Reversed, EMI Due). Dead-letter: `snapaccount.loan.events.dead-letter`. Subscriber: `notification-service-loan-events-sub` (NotificationService).

- **Partner bank credentials pattern:** Secrets follow `partner-bank-creds-{bankId}` naming. Template secret `partner-bank-creds-template` documents JSON shape. LoanService reads all `partner-bank-creds-*` secrets at runtime via Secret Manager API (not mounted as env vars). Pilot banks: `icici`, `hdfc`.

- **Webhook secrets pattern:** `partner-bank-webhook-secret-{bankId}` — HMAC-SHA256 shared secret per bank. Template: `partner-bank-webhook-secret-template`. Endpoint: `POST /loans/webhooks/{bankId}/disbursement`. Doc: `docs/devops/loan-disbursement-webhook.md`.

- **LoanService Cloud Run updated:** memory bumped to 1Gi (QuestPDF generation), mounts `GCS_LOAN_PACKAGES_BUCKET` and `PARTNER_BANK_CREDS_TEMPLATE` secrets, env var `LOAN_EVENTS_TOPIC=snapaccount.loan.events`. IAM: added `storage.objectCreator` + `storage.objectViewer` to `loan-service-sa`.

- **ReportService Cloud Run updated:** now mounts both `gcs-documents-bucket` and `gcs-loan-packages-bucket` secrets. IAM: added `storage.objectViewer` to `report-service-sa` (was objectCreator only).

- **QuestPDF fonts:** Inter + Noto Sans Devanagari + Noto Sans Bengali must be bundled in LoanService and ReportService Docker images at `backend/Shared/fonts/`. backend-agent owns adding font files. Infra doc: `docs/devops/questpdf-font-bundling.md`. Font layer goes before source copy in Dockerfile for cache efficiency.

- **Bucket Lock NOT enabled by default:** Bucket Lock (object immutability) requires team lead approval — it is irreversible. See `docs/devops/loan-package-bucket-lifecycle.md` §bucket-lock.

- **7-year clock starts at loan closure, not origination:** LoanService must write executed documents to loan-packages bucket only at loan closure. Pre-sanction drafts go in the general documents bucket with shorter TTL. This is a cross-agent handoff to backend-agent.
