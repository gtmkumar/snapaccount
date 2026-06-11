---
name: Phase 7 Wave 2 + Wave 6 Infrastructure
description: Key decisions from Wave 2 (D3/D4/D5) and Wave 6 (GAP-107/025/038) — secret slots, scheduler matrix, data residency, incident response, log retention, HSN staging
type: project
---

Phase 7 Wave 2 completed 2026-06-10. Key facts:

**Migration chain verified:** All 62 migration files (000–061 + 999) replay cleanly on fresh postgres:17 + pgvector (local Docker test). `callback.kpi_daily_snapshot` MV exists with unique index on `(org_id, snapshot_date)` — confirmed REFRESH CONCURRENTLY is possible.

**Why:** Wave 1 delivered migration 061 (loan consent catalog alignment) and the callback KPI MV. The migration-replay job (D4) catches the class of regression found in the 2026-05-16 audit (4 broken migrations).

**How to apply:** CI job `migration-replay` in `.github/workflows/ci.yml` replays all migrations on every PR.

**Secret key naming conventions discovered from code audit:**
- GSTN/IRP/EWB: env vars `GSTN_CLIENT_ID`, `GSTN_CLIENT_SECRET`, `IRP_CLIENT_ID`, `IRP_CLIENT_SECRET`, `EWB_CLIENT_ID`, `EWB_CLIENT_SECRET` (GstService Production*Client classes)
- MSG91: `Msg91:ApiKey` (colon-separated IConfiguration section)
- SendGrid: `SendGrid:ApiKey`, `SendGrid:FromEmail`, `SendGrid:FromName`
- Firebase FCM: `Firebase:ServiceAccountJson` (shared by AuthService and NotificationService)
- Pilot bank creds: NOT env vars — CredentialEncryptionService fetches from Secret Manager using keyRef stored in `loan.partner_banks.api_config_key_ref` column, with GCP_PROJECT_ID from env
- Session JWT: `SESSION_JWT_SECRET` (GAP-005 HIGH — hardcoded fallback exists)

**Scheduler job matrix (7 jobs total):**
- Phase 6 (4 jobs): gst-deadline-check (06:00), itr-deadline-reminders (09:00), itr-refund-polling (10:00), subscription-renewal-check (08:00)
- Phase 7 new (3 jobs, PENDING-B19 backends): callback-kpi-mv-refresh (00:30), gst-pre-deadline-callback (07:00), itr-form16-missing (11:00)

**PENDING-B19:** Three new scheduler jobs need backend Wave 3 implementations: POST /callbacks/internal/refresh-kpi-mv, POST /callbacks/internal/gst-pre-deadline, ITR_FORM16_MISSING handler.

**Aspire smoke test constraint:** Full AppHost boot in CI is impractical (RAM, GCP creds, dynamic ports). Per-service healthz matrix was implemented instead. Full Aspire boot needs self-hosted runners ≥16 GB.

**GCS Bucket Lock (TL-6):** Script at infra/gcs-bucket-lock.sh. Requires APPROVED_BY + APPROVAL_TICKET env vars + typing 'LOCK-CONFIRMED'. IRREVERSIBLE.

**HSN/SAC data:** ~12k rows from CBIC, load runbook at docs/devops/hsn-sac-dataset-load-runbook.md. Blocked on staging DB access (team lead must grant). ON CONFLICT clause uses `code WHERE deleted_at IS NULL` partial unique index.

**NEW-D07 Razorpay webhook secret (2026-06-11):**
- Secret name: `razorpay-webhook-secret`, env var: `RAZORPAY_WEBHOOK_SECRET`
- Provisioned as Section 9 in `infra/secret-manager-external-deps.sh`
- WITHOUT it: `POST /subscriptions/webhooks/razorpay` returns 503 (fail-closed, by design in RazorpayWebhook.cs)
- Obtain from: Razorpay Dashboard → Account & Settings → Webhooks → Edit → Secret
- Documented in: `docs/devops/subscription-razorpay-setup.md`, `docs/devops/external-deps-secret-mapping.md`
- DI fact: MockRazorpayClient is ALWAYS the startup default. Switch to RazorpayHttpClient is runtime-only (admin calls PATCH /subscriptions/config/razorpay with IsEnabled=true). No Dockerfile change needed.

**NEW-D17 CI font verify job (2026-06-11):**
- Job `report-font-verify` added to `.github/workflows/ci.yml`
- Builds ReportService image, runs `docker run --entrypoint sh` to verify 8 font files at `/app/fonts/`
- Also runs a dotnet QuestPDF font-registration smoke test (in-process, not container) using QUESTPDF_FONTS_PATH env var
- Separate from docker-smoke-test matrix to avoid matrix overhead for one-service concern

**NEW-D05/D06 SLO + PITR (2026-06-11):**
- PITR drill: `infra/scripts/pitr-drill.sh` (executable, bash -n verified). BLOCKER: gcloud not authenticated locally; first operator must `gcloud auth login` before running.
- SLO alerts: `infra/monitoring-alert-policies.sh` — 12 services × 2 alert types + 2 Pub/Sub lag alerts = 26 alert policies total. Uses `gcloud alpha monitoring policies` API. Idempotent (delete + recreate by display name).
- SLO data source: `docs/devops/observability-slos.md` (all thresholds preserved verbatim).

**Wave 6 Batch D (2026-06-11):**
- GAP-107 data-residency map: `docs/devops/data-residency-map.md` — complete enumeration of all stores with RBI verdict. Key findings: Firebase Auth region unverified (must check project default); Firebase Crashlytics is US-resident (must never receive PII/payment); Vertex AI must use `asia-south1-aiplatform.googleapis.com`; Document AI processors must be verified in `asia-south1`; SendGrid is US-resident (email template audit required). Org policy `gcp.resourceLocations → asia-south1` documented in §5 — needs `infra/setup.sh` Step 1b addition (TL action).
- GAP-025 incident response: `docs/devops/incident-response.md` — S1–S4 severity matrix, on-call SLAs, CERT-In 6h clock, DPB 72h clock (DPDP), RBI supervisory 24h, PIR template, log retention policy with exact day counts (security 180d, financial 2555d=7yr, incident 1095d=3yr).
- GAP-025 log retention script: `infra/scripts/log-retention-setup.sh` — creates 3 custom Cloud Logging buckets with sinks; idempotent; bash -n verified.
- GAP-038 HSN staging script: `infra/scripts/hsn-sac-dataset-stage.sh` — end-to-end pipeline: CBIC download → Excel→CSV Python → idempotent SQL gen → Cloud SQL Proxy → load + verify. DRY_RUN=true supported. bash -n verified. Still BLOCKED on staging DB access TL grant (same blocker as runbook).
- CI guard for payment-data residency: documented in data-residency-map.md §7 (grep pattern for Crashlytics + log leakage). Add to ci.yml when CI billing (TL-1) is restored.
