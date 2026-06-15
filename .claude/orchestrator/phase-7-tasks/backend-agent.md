# Phase 7 Tasks — backend-agent

> Ownership: `backend/` only. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md` for full Issue/Impact detail per GAP ID.
> Every task: FluentValidation on inputs, `Result<T>` (no cross-boundary throws), `[RequiresPermission]` where applicable, unit tests + at least one real-Postgres integration test.

## HIGH priority

### B1 — Fix account-deletion failure on Firebase revoke (GAP-003 / NEW-002)
- Make `RevokeRefreshTokensAsync` best-effort: log warning, continue local erasure/anonymization, enqueue revoke retry (Pub/Sub or Hangfire in-request chain).
- Acceptance: deletion succeeds with Firebase unreachable; retry observable in logs; integration test simulating revoke failure.

### B2 — Parameterize RLS session interceptor (GAP-004 / M1-R-001, M1-R-003)
- Replace interpolated `SET LOCAL` with `SELECT set_config('app.current_user_id', @p, true)`; fail-closed or alert on failure (no silent swallow).
- Acceptance: injection-shaped user id values cannot alter SQL; failure path covered by test.

### B3 — Fail-fast on missing SESSION_JWT_SECRET (GAP-005)
- In `FirebaseAuthMiddleware`/startup: throw in non-Development when secret absent; remove reliance on `DefaultLocalSecret` outside dev.
- Acceptance: service refuses to start in Production without the secret; dev unaffected.

### B4 — Re-issue session JWT after organization creation (GAP-007 / BUG-5)
- After business-onboarding org creation, return fresh tokens with `OrganizationId` claim (extend the wizard-completion command response or add `POST /auth/token/refresh-context`).
- Acceptance: invite flow works in the same session immediately after onboarding (matches qa-mobile repro).

### B5 — Real Callback KPI + SLA instrumentation (GAP-012 / SEC-030 / P6-HANDOFF-04 conditions)
- Implement `GET /callbacks/kpi` over `callback.kpi_daily_snapshot` with mandatory `WHERE org_id = @orgId`; write `assignments_log` on every assignment; expose SLA-breach counts consumed by admin dashboard (`workload-by-user`).
- Acceptance: FCR, avg duration, response time, CSAT computed; IDOR integration test (org A cannot read org B KPIs); placeholder JSON removed.

### B6 — Loan consents catalog endpoint (GAP-040 / P6-HANDOFF-25)
- `GET /loans/consents/catalog` returning versioned consent texts per language; record the served version on consent capture.
- Acceptance: mobile hardcoded `1.4` removable; consent record stores exact version+language served.

### B7 — DPDP consent & privacy APIs (GAP-020)
- AuthService: purpose-coded consent records (grant/withdraw, versioned, audited), `GET /auth/me/consents`, `POST /auth/me/consents/{purpose}/withdraw`; data-access export endpoint (`GET /auth/me/data-export` async job) and data-correction request workflow.
- Acceptance: every consent change is immutable-audit-logged with timestamp/IP/device; withdrawal is one call; export job produces a complete per-user JSON bundle.

### B8 — RBI Key Facts Statement + cooling-off (GAP-021)
- LoanService: `KeyFactsStatement` generated server-side (APR, all fees, tenure, repayment schedule), **signed payload** (HMAC) served before consent; cooling-off window metadata on disbursed loans; grievance-officer contact in loan API responses/config.
- Acceptance: consent cannot be submitted without a served+acknowledged KFS id; KFS content immutable and retrievable for audit.

### B9 — Subscription monetization completion (GAP-034)
- Razorpay REST client (orders, subscriptions, plan sync) using admin-configured credentials; wire `PATCH /subscriptions/config/razorpay`; implement `subscription.usage_record` metering (document uploads, AI calls, chat sessions) via middleware/event subscribers; verify/finish trial-period logic.
- Acceptance: end-to-end test-mode checkout → webhook → active subscription; usage rows written per metered action; ghost settings route removed from SEC-056 list.

### B10 — NotificationService EF snake_case configs (GAP-070)
- Proper entity configuration files for all notification entities; remove seeder try/catch band-aid; reconciliation migration coordinated with db-engineer.
- Acceptance: seeder runs clean on empty DB; CI migration-replay (devops D4) green.

## MEDIUM priority

### B11 — Security bundle (GAP-008)
Fix with regression tests: SEC-031 (Redis-backed dedupe), SEC-032 (org ownership on BootstrapCoa), SEC-036 (FCM payload event_code), SEC-037 (remove fallback UUIDs), SEC-041 (server-side PAN encryption on Form16 upload), SEC-056 (implement or delete the 11 ghost settings PATCH routes), NEW-003 (AES-CBC→GCM with key/format migration), M1-R-002 (invite acceptance must match invitee email/phone), M1-R-INFO-001 (rate-limit public invite lookup), I1.1-001 (count soft-deleted role_permission rows), I1.1-002 (case-insensitive permission uniqueness), I1.3-002 (single permission resolve), I1.3-003 (explicit error when initialPassword ignored), I1.4A-001 (default-deny reference-data delete).

### B12 — Permission catalog integrity (GAP-054)
- Persist `is_active` on permissions and enforce in `EffectivePermissionResolver`; return computed `roleCount`.

### B13 — AI Service P7a/P7b (GAP-030)
- P7a: `ai` schema DbSets + pgvector HNSW (with db-engineer), document embedding pipeline (Document AI text → Vertex embeddings), `POST /ai/search` RAG retrieval.
- P7b: `POST /ai/chat` first-response using admin-configured provider (`/auth/config/ai`), escalate-to-CA handoff creating a ChatService thread; map all model output to DTOs (never raw).
- Respect 20 req/min `ai` limiter; per-org usage metering hooks into B9.

### B14 — Notification template management (GAP-037)
- Template entity (event × channel × language) with variable substitution; CRUD endpoints (admin-gated); renderer falls back to code defaults.

### B15 — Document workflow completion (GAP-013/014/015)
- Expose `ArchiveDocumentCommand` route; review-decision endpoints emitting `document.ocr.completed`; SLA config + `overdue` computation on admin queue; persist operator OCR corrections (`ocr_feedback`); document tags + share-grant (signed URL, 1h expiry).

### B16 — Tally XML export (GAP-032)
- ReportService export job (vouchers/ledgers/masters for date range) behind existing feature flag; CSV fallback.

### B17 — WhatsApp Business adapter (GAP-033)
- `WhatsAppBusinessAdapter` (Cloud API) wired to the existing `WHATSAPP` channel + admin settings test-send; flag remains off by default.

### B18 — Appointments & video consultations (GAP-031)
- ChatService additive: Appointment/AppointmentSlot/CaProfile/CaRating entities; book/reschedule/cancel (≥2h rule)/rate endpoints; Google Meet link adapter (adapter pattern); reminder events (30min/5min) to NotificationService. Schema with db-engineer (DB2).

### B19 — Scheduled reminders & refund ops (GAP-042)
- Audit the Cloud Scheduler job matrix vs plan: GST 7/3/1-day, GST "not approved 2 days before deadline" auto-callback, ITR e-verify Day 1/7/15/25(callback)/29(urgent), Form-16-missing-after-3-days callback. Implement missing triggers in CallbackService/NotificationService. Gate mock refund progression behind a flag + manual ops update endpoint.

### B20 — Loan PDF stub removal + fonts (GAP-041 / P6-HANDOFF-32)
- Verify all package generation routes through ReportService QuestPDF; delete `StubLoanPdfGenerator` (or throw outside dev); bundle fonts in `backend/Shared/fonts/` and verify in container.

### B21 — Platform-wide audit trail (GAP-024)
- MediatR behavior publishing audit events from mutating handlers → Pub/Sub → `shared.audit_log` sink (schema with db-engineer DB3); extend audit query endpoint with service/entity filters.

### B22 — Old-device confirmation flow (GAP-047)
- New-device login triggers approval push to existing devices (10-min expiry, approve/deny); deny blocks the new session.

### B23 — API docs regeneration (GAP-090)
- Regenerate `docs/api/endpoints.md` from the 12 services' OpenAPI output (coordinate with api-docs agent); explicitly mark mock-backed endpoints (GSTN/IRP/EWB/refund).

### B24 — Test infrastructure fixes (GAP-081 / P6-INT-01)
- Add `InternalsVisibleTo` to the affected `*Api.csproj`; make combined integration runs green; support qa-web's new DocumentService test projects.

## LOW priority
- Loan offers/comparison endpoints (GAP-039) — after ≥2 bank integrations.
- Chat bookmarks + export-thread-as-PDF (GAP-043).
- Accounting comparative analysis queries (GAP-044).
- Resend-invite mints fresh token (GAP-065).
- Global search Phase-7 fan-out (documents/GST/ITR types) — existing stub in `GlobalSearchQuery`.
