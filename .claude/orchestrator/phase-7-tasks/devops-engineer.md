# Phase 7 Tasks — devops-engineer

> Ownership: `Dockerfile*`, `docker-compose*`, `.github/`, `infra/`, `docs/devops/`. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.

## HIGH priority

### D1 — Secret rotation & hygiene (GAP-001, GAP-005)
- After team-lead authorization: rotate the exposed Firebase service-account key; purge `GoogleService-Info.plist` from git history (filter-repo) once mobile M1 moves it to EAS secrets; add secret scanning (gitleaks/truffleHog) to CI.
- Provision `SESSION_JWT_SECRET` in GCP Secret Manager for all 12 services (staging + prod); document in `docs/devops/`.

### D2 — CI restoration & gates (GAP-002, depends TL-1)
- Re-validate `ci.yml` end-to-end after billing restore; enforce required checks via branch protection; clarify the two FCM secret placeholder names (P6-FLAG-07).

### D3 — External dependency provisioning (GAP-073)
- Prepare Secret Manager slots + config plumbing so GSTN/IRP/EWB, MSG91 DLT, SendGrid DNS, pilot-bank creds drop in with zero code change; execute the HSN/SAC ~12k CBIC dataset load runbook (P6-HANDOFF-17) on staging; GCS Bucket Lock application after TL-6 approval.

### D4 — CI migration-replay + Aspire smoke jobs (GAP-071)
- Job 1: apply all `database/migrations/*.sql` + dev seed to a fresh postgres:17+pgvector service container; fail on any error.
- Job 2: boot AppHost, curl `/healthz` for all 12 services (ports 5101–5112), fail on non-200.

## MEDIUM priority

### D5 — Scheduler job matrix (GAP-012, GAP-042; with backend B5/B19)
- Cloud Scheduler jobs: callback KPI MV refresh (P6-HANDOFF-07); GST 7/3/1-day reminders; GST pre-deadline auto-callback; ITR e-verify Day 1/7/15/25/29; Form-16-missing-3-day trigger; subscription renewal reminders. Document the full matrix in `docs/devops/recurring-jobs-decision.md` (update existing doc).

### D6 — Monitoring proxy for admin System Health (GAP-052)
- Expose a minimal authenticated endpoint/proxy surfacing Cloud Monitoring basics (p95 latency, error rate, OCR queue depth, DB connections) for the admin dashboard; coordinate contract with frontend F6.

### D7 — DPDP/CERT-In operational readiness (GAP-020, GAP-025)
- `docs/devops/incident-response-runbook.md`: parallel CERT-In (6h) / DPB (72h) / RBI supervisory notification paths, roles, evidence templates.
- Configure ≥180-day security log retention in asia-south1 (Indian jurisdiction); document retention policy.

### D8 — Cloud Armor / IAP completion (SEC-017 partial)
- Attach Cloud Armor policy + IAP to the admin panel once the load balancer/NEG exists; close out `docs/devops/admin-panel-security.md` steps.

## LOW priority

### D9 — Misc
- Memorystore tier implementation after TL-8 decision (P6-FLAG-10).
- Container check that QuestPDF fonts render (with backend B20).
- Remove stray root `package.json`/`package-lock.json` (firebase dep) flagged in CHANGE-SUMMARY.
