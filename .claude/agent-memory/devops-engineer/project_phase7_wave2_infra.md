---
name: Phase 7 Wave 2 Infrastructure (D3/D4/D5)
description: Key decisions and discoveries from Phase 7 Wave 2 devops work — secret slots, CI migration-replay, scheduler matrix
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
