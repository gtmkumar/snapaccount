# SnapAccount — Comprehensive Gap Analysis & Review

> **⚠️ ADDENDUM 2026-06-11:** See `gap-analysis-2026-06-11-delta.md` for the current state. Code-verified CLOSED since this document: GAP-003, 004, 005, 007, 010, 011, 012, 040, 070, 061 (Wave 1) and GAP-020/021 backend halves, B7–B12, M2–M4, D4–D5 (Wave 2). GAP-060 partial (ProfileScreen stubs remain). The delta adds 22 new sweep findings (NEW-Dxx / NEW-W2-xxx) and 12 new regulatory/industry gaps (GAP-100..111), three with regulatory clocks already running (IMS mandatory Apr 2026, accessibility mandate, IT Act 2025 cutover).

> Produced by: Orchestrator (Post-Phase-6 / Pre-Phase-7 Review)
> Date: 2026-06-10
> Inputs: `SnapAccount_Complete_Project_Plan.md` (v2.0), `SnapAccount_User_Hierarchy.md`, `project-brief.md`, all `docs/`, all handoffs in `.claude/orchestrator/`, all QA reports in `.claude/qa/`, `docs/security/security-report.md` (authoritative security baseline), live-smoke audit `.claude/screenshots/live-2026-06-06/`, code-verified audits of `backend/`, `src/admin/`, `mobile/`, and external research (Indian SME accounting market benchmarks, DPDP Rules 2025, RBI Digital Lending 2025, CERT-In directions).
> Companion task files: `.claude/orchestrator/phase-7-tasks/` (one per agent)

---

## How to read this document

Every gap has:
- **ID** — `GAP-xxx` (stable; referenced from per-agent task files)
- **Issue** — what is wrong or missing (code-verified where possible)
- **Impact** — why it matters (user, compliance, revenue, risk)
- **Proposed solution** — concrete remediation
- **Owner** — responsible agent(s) per file-ownership rules in `CLAUDE.md`
- **Priority** — High / Medium / Low (High = pre-production or core-USP blocking)

Verified-state summary (2026-06-10): backend has 12 services, ~236 endpoints, ~756 tests; AiService is 100% 501-stubs; GSTN/IRP/EWB/ITR-refund integrations are mock-by-default; admin panel has 55 pages but Document Queue/Review and ITC Mismatch run on inline mock data; mobile has 57 screens with full i18n parity but several "Coming Soon" stubs; admin i18n lags (hi −60 keys, bn −341 keys).

---

## Category A — Critical & Pre-Production Blockers

### GAP-001 — Committed Firebase production config + leaked service-account key (M1-001)
- **Issue:** Production Firebase config committed at `mobile/ios/SnapAccount/GoogleService-Info.plist`; a Firebase service-account key id was exposed in a session transcript (per `CHANGE-SUMMARY-auth-kyc-firebase-session-jwt.md`). Currently "backlogged".
- **Impact:** Credential compromise of the production Firebase project → auth takeover, push abuse, data exposure. This is the single highest-risk open item.
- **Solution:** Rotate the Firebase service-account key and any API keys immediately; move plist delivery to EAS secrets/build-time injection; purge from git history (filter-repo); add secret-scanning to CI.
- **Owner:** devops-engineer (rotation/CI), mobile-dev (plist injection) — team lead must authorize rotation.
- **Priority:** **High (Critical — act now)**

### GAP-002 — GitHub Actions CI disabled (billing failure)
- **Issue:** CI blocked since the 2026-05-16 audit ("recent account payments have failed"). PRs are merging without CI (`audit-2026-05-16/HANDOFF.md`).
- **Impact:** No build/test/lint gate on any merge; regression risk across all 3 apps; the "zero warnings" PR policy is unenforced.
- **Solution:** Team lead restores billing; devops re-validates `ci.yml` end-to-end and adds a required-checks branch protection.
- **Owner:** team lead + devops-engineer
- **Priority:** **High (Critical)**

### GAP-003 — DPDP right-to-erasure broken when Firebase revoke fails (NEW-002)
- **Issue:** Account deletion returns failure if `RevokeRefreshTokensAsync` throws, despite a comment saying it should be non-fatal (`docs/security/security-report.md`).
- **Impact:** Users can be unable to delete their accounts → direct DPDP Act 2023 violation (penalties up to ₹250 Cr under DPDP Rules 2025 enforcement).
- **Solution:** Make Firebase revoke best-effort (log + continue), complete local erasure/anonymization, queue a retry for the revoke.
- **Owner:** backend-agent
- **Priority:** **High**

### GAP-004 — RLS session variable set via string interpolation (M1-R-001)
- **Issue:** `RlsSessionInterceptor` builds `SET LOCAL app.current_user_id = '...'` by interpolation instead of parameterized `set_config()`; failures are also silently swallowed (M1-R-003).
- **Impact:** Defense-in-depth weakness; if any caller-controlled value reaches the interceptor it becomes SQL injection into the security layer itself; silent failure degrades RLS without alert.
- **Solution:** Switch to `SELECT set_config('app.current_user_id', @p0, true)`; fail-closed (throw) or alert on set failure.
- **Owner:** backend-agent
- **Priority:** **High**

### GAP-005 — Hardcoded fallback JWT secret + SESSION_JWT_SECRET not provisioned
- **Issue:** `FirebaseAuthMiddleware.DefaultLocalSecret` ships a hardcoded HS256 fallback (`snapaccount-local-dev-secret-change-me-32++chars`); `SESSION_JWT_SECRET` is not yet in Secret Manager for deployed services.
- **Impact:** If any deployed service starts without the env var it silently accepts tokens signed with a public, in-repo secret → full auth bypass.
- **Solution:** Fail-fast at startup in non-Development environments when the secret is missing; provision `SESSION_JWT_SECRET` in GCP Secret Manager for all 12 services; add a startup assertion test.
- **Owner:** backend-agent (fail-fast) + devops-engineer (Secret Manager)
- **Priority:** **High**

### GAP-006 — Mobile production hardening incomplete (INFO-001, INFO-007, EAS)
- **Issue:** TLS pinning uses placeholder SHA-256 hashes (`mobile/src/lib/pinnedHttpClient.ts`); `mobile/src/lib/firebase.ts` is a mock module for Expo Go; Firebase native plugins disabled in `app.json`; no EAS dev-client/production build pipeline.
- **Impact:** App cannot ship: no real Firebase auth on device, pinning is decorative, push notifications unverified on hardware.
- **Solution:** Stand up EAS build profile, re-enable `@react-native-firebase/*` plugins, pin real leaf/intermediate hashes with rotation plan (per RBI/industry guidance: pin deliberately, design for rotation), verify FCM on physical devices.
- **Owner:** mobile-dev + devops-engineer
- **Priority:** **High**

### GAP-007 — Session JWT missing orgId after onboarding (BUG-5)
- **Issue:** JWT issued at login (before org creation) lacks `OrganizationId`; `POST /auth/team/invite` then 409s `Org.InvalidContext` until re-login (`.claude/qa/mobile-report.md`, live smoke 2026-06-06).
- **Impact:** Every new business owner hits a broken Team/Invite flow on first session — first-run experience failure of a core flow.
- **Solution:** Re-issue (or refresh) the session JWT after organization creation completes in the onboarding wizard; mobile must swap tokens transparently.
- **Owner:** backend-agent (token re-issue endpoint/claims) + mobile-dev (rotate after wizard)
- **Priority:** **High**

### GAP-008 — Open security bundle (Phase 7 deferred + Module 1 increments)
- **Issue:** Still open per `docs/security/security-report.md`: SEC-030 (callback assignments_log not written), SEC-031 (in-process dedupe resets), SEC-032 (BootstrapCoa org ownership), SEC-036 (FCM cleartext event_code), SEC-037 (hardcoded fallback UUIDs in OcrResultSubscriber), SEC-041 (client-supplied PAN cipher stored), SEC-042 (GST notice drafts in localStorage), SEC-056 (11 ghost settings PATCH routes), NEW-001 (HMAC hex compare — accepted), NEW-003 (PAN AES-CBC→GCM), M1-R-002 (invite acceptance identity not verified — IDOR), I1.1-001 (permission resurrection via soft-deleted rows), I1.3-002 (TOCTOU double permission resolve), plus Low/Info items (M1-R-INFO-001/002, I1.1-002, I1.3-003, I1.4A-001, output-encoding notes).
- **Impact:** Aggregate audit-trail, IDOR, and crypto-hygiene risk; several items (M1-R-002, SEC-041, I1.1-001) are exploitable in multi-tenant scenarios.
- **Solution:** Single hardening sprint; each fix carries a regression test. AES-GCM migration aligns with current RBI/industry guidance (Jetpack crypto deprecation, AES/GCM baseline).
- **Owner:** backend-agent (majority), frontend-dev (SEC-042, output encoding)
- **Priority:** **Medium** (bundle; M1-R-002 and SEC-041 are High individually)

---

## Category B — Core Workflow Gaps (the human-in-the-loop USP)

### GAP-010 — Admin Document Queue & Review run entirely on mock data
- **Issue:** `DocumentQueuePage.tsx` uses `mockDocuments`; `DocumentReviewPage.tsx` uses `mockFields` + fake `useQuery`; **no `documentApi.ts` exists** in `src/admin/src/lib/`. Backend endpoints exist (`/documents` group: list/get/categorize/OCR/admin stats). `docs/dev/static-data-debt.md` incorrectly claims all pages migrated.
- **Impact:** **The core product loop is non-functional in the admin panel.** SnapAccount's USP is "user photographs a bill → human operator reviews OCR → posts to ledger". Operators cannot actually review real documents. Highest functional-severity gap in the project.
- **Solution:** Create Zod-validated `documentApi.ts`; wire queue (filters, SLA indicators, pagination) and split-screen review (real OCR fields with green/yellow/red confidence at 80/50 thresholds per plan C2.2, signed-URL image display, approve/reject/clarify mutations); server-side gating of queue by role. Backend: expose the existing-but-unrouted `ArchiveDocumentCommand`, add review-decision endpoints if missing, and emit the `document.ocr.completed → accounting` event on approval (verify path).
- **Owner:** frontend-dev (primary), backend-agent (missing endpoints), ui-ux-agent (confirm split-screen spec current)
- **Priority:** **High**

### GAP-011 — ITC Mismatch admin page is mock despite real backend reconciliation
- **Issue:** `ItcMismatchPage.tsx` renders `mockMismatches`; backend already has `ReconcileItcCommand`, `GetItcMismatchesQuery`, `ItcMismatchReadRepository`.
- **Impact:** GSTR-2A/2B reconciliation is the standout feature of the market leader in compliance tooling (ClearTax-class ITC reconciliation); ours exists server-side but is invisible to operators. ITC-mismatch callbacks (plan E4.1) can't be triaged.
- **Solution:** Wire the page to `/gst` reconciliation endpoints; add mismatch-cause grouping (timing, rounding, GSTIN error, genuine discrepancy — industry pattern), link "create callback" action.
- **Owner:** frontend-dev (+ backend-agent if grouping fields missing)
- **Priority:** **High**

### GAP-012 — Callback KPI endpoint is a placeholder; SLA breaches hardcoded to 0
- **Issue:** `GET /callbacks/kpi` returns placeholder JSON ("MV query pending", `Callbacks.cs` ~238–248); admin `dashboardApi.ts` hardcodes `slaBreaches: 0`. Also SEC-030: `assignments_log` never written. MV refresh job not scheduled (P6-HANDOFF-07); KPI MV org-filter conditions from the accepted P6-HANDOFF-04 decision are still open.
- **Impact:** The plan defines hard KPI targets (GST FCR > 75%, ITR FCR > 70%, response < 4h, CSAT > 4.5/5, deadline filing > 99%). None are measurable. Ops Manager role can't do its job; the "human service" model has no quality instrumentation.
- **Solution:** Implement the real KPI query over `callback.kpi_daily_snapshot` with `WHERE org_id = @orgId`, write `assignments_log` at runtime, schedule MV refresh (Cloud Scheduler), surface SLA breach counts to the dashboard, add the IDOR integration test required by the P6-HANDOFF-04 acceptance.
- **Owner:** backend-agent + devops-engineer (scheduler) + qa-web (IDOR test)
- **Priority:** **High**

### GAP-013 — Document SLA tracking / overdue alerts missing (plan J2)
- **Issue:** No SLA timer fields/queries on the document queue; no overdue alerting.
- **Impact:** Plan J2 requires "time since upload, overdue alerts"; operators can't prioritize; deadline-driven GST work (7/3/1-day reminders) depends on documents being processed in time.
- **Solution:** Add SLA config (per category) + computed `overdue` flag on the admin queue endpoint; notification event for SLA breach; queue sort by SLA.
- **Owner:** backend-agent + frontend-dev
- **Priority:** **Medium**

### GAP-014 — OCR feedback loop not implemented (plan C2.2 / brief 2.6)
- **Issue:** No `OcrFeedback` flow found; operator corrections are not captured as training/quality signal.
- **Impact:** Brief promises "corrections feed OCR improvement over time"; without capture we can't measure field-level OCR accuracy or improve prompts/processors.
- **Solution:** Persist operator corrections (field, original value, corrected value, confidence) on review-save; monthly accuracy report query; feed Document AI processor evaluation later.
- **Owner:** backend-agent (+ frontend-dev to send deltas)
- **Priority:** **Medium**

### GAP-015 — Document Vault feature set incomplete (brief 2.3/2.12/2.13)
- **Issue:** `ArchiveDocumentCommand` exists but has no HTTP route; no document tagging; no document sharing (with CA/bank); bulk upload UX not verified; search by amount/vendor not verified.
- **Impact:** Vault parity with market baseline (tagging/sharing are table stakes in Zoho-class tools); 7-year retention without archive surface is awkward.
- **Solution:** Expose archive endpoint; add `document_tag`, share-grant entity + signed-URL share flow (1-hour expiry per plan C3.1); verify/finish search filters.
- **Owner:** backend-agent + mobile-dev (vault UI) + frontend-dev (admin filters)
- **Priority:** **Medium**

---

## Category C — Compliance & Regulatory Gaps (2026 baseline)

### GAP-020 — DPDP Rules 2025 operational compliance missing
- **Issue:** DPDP Rules were notified 2025-11-14 (substantive provisions phased to 2027). We have right-to-erasure (broken — GAP-003) and consent capture for loans, but missing: (a) granular, versioned, **withdrawable** consent records for each processing purpose with audit trail; (b) a user-facing **privacy center** (data access / correction / erasure self-service) on mobile; (c) published DPO / grievance-officer contact in-app; (d) itemized privacy notices in English + Hindi (+ regional); (e) breach-notification runbook (72h to Data Protection Board, in parallel with CERT-In 6h); (f) ≥180-day India-resident security log retention.
- **Impact:** Regulatory exposure up to ₹250 Cr per breach class; Significant-Data-Fiduciary obligations very likely apply to a tax+lending platform.
- **Solution:** New `consent` capability in AuthService (purpose-coded, versioned, withdraw API + UI), mobile Privacy Center screen group, notice templates per language, security log retention policy in GCP (asia-south1), incident-response runbook in `docs/devops/` + `docs/security/`.
- **Owner:** backend-agent (consent APIs), mobile-dev (privacy center), ui-ux-agent (specs), devops-engineer (log retention, runbook), security-reviewer (verification)
- **Priority:** **High**

### GAP-021 — RBI Digital Lending guidelines not implemented in Loan Hub
- **Issue:** Code search confirms **no Key Facts Statement (KFS)** anywhere; no cooling-off period handling; no in-app grievance-redressal officer display for lending; no documented LSP/partner-bank audit checklist; app permission perimeter (camera/mic/location only — no contacts/SMS/call-log) not formally verified.
- **Impact:** RBI Master Direction on Digital Lending (2025) makes the regulated entity accountable for the DLA. Submitting borrower data to partner banks without a standardized KFS (APR, all fees, tenure) and cooling-off support risks the partner-bank relationships themselves — banks will not integrate a non-compliant LSP.
- **Solution:** (1) KFS entity rendered from a **server-signed payload** shown before the consent screen; (2) cooling-off window with penalty-free exit on disbursed loans metadata; (3) grievance officer details on loan screens; (4) consent revocation already exists — surface revocation history; (5) permission-perimeter audit of `app.json`/AndroidManifest; (6) `docs/security/` lending compliance checklist.
- **Owner:** backend-agent (KFS, cooling-off), mobile-dev (screens), ui-ux-agent (KFS screen spec), security-reviewer (audit)
- **Priority:** **High**

### GAP-022 — GST 2.0 slab rationalization readiness + no Tax Rate Config admin UI
- **Issue:** 2026 "GST 2.0" reforms move toward a simplified 5%/18% structure plus IMS (Invoice Management System) requirements. Our rates are config-driven in `gst.tax_rates` (versioned) — good — but there is **no admin UI** (planned screen 96 "Tax Rate Configuration (versioned)") to enact a rate change without a DB migration, and no IMS-awareness in the reconciliation design.
- **Impact:** The #1 stated design principle ("rates change with government policy — must be configurable, zero code deployments") is not deliverable today: a rate change requires db-engineer intervention.
- **Solution:** Admin Tax Rate Config page (effective-dated versions, preview, audit trail) backed by existing temporal tables; track IMS spec and add to GSTR-2B reconciliation backlog; same pattern for ITR slab versions (rollover runbook exists at `docs/devops/itr-tax-slab-rollover-runbook.md` — wire it to UI).
- **Owner:** frontend-dev + backend-agent (config endpoints) + db-engineer (review)
- **Priority:** **Medium**

### GAP-023 — TDS Management module (brief Module 12) entirely absent
- **Issue:** No TDS computation, no quarterly returns (24Q/26Q/27Q), no Form 16/16A generation, no 26AS reconciliation. (ITR-side TDS credits exist — Form16Extract, LowerTdsCertificate — but the deductor-side module does not.)
- **Impact:** Committed scope in the project brief; SMEs above thresholds must deduct/file TDS; absence limits the "zero accounting knowledge" promise for larger SMEs.
- **Solution:** Scope as Phase 8 module (new `tds` capability inside GST or ITR service bounded context — decide at scoping); start with computation + 26Q.
- **Owner:** orchestrator (scoping), backend-agent
- **Priority:** **Medium** (explicitly post-Phase-7)

### GAP-024 — Audit logging is Auth-only; no platform-wide immutable financial audit trail (brief 10.1/10.4)
- **Issue:** `AuditLogEntry` + viewer exist only in AuthService. Accounting has internal audit entities, but there is no cross-service, immutable "who changed what financial record when" trail or compliance dashboard (brief 10.5).
- **Impact:** ICAI/CA professional-standards expectations and the brief's own Module 10 require an audit trail for all financial mutations; investigations across services are currently impossible.
- **Solution:** Standardize an audit event contract published to Pub/Sub from every service's mutating handlers (MediatR behavior), sink to a partitioned `shared.audit_log` (append-only, RLS), extend the existing admin Audit Log viewer with service/entity filters.
- **Owner:** backend-agent + db-engineer (schema) + frontend-dev (viewer filters)
- **Priority:** **Medium**

### GAP-025 — Security operations cadence absent (VAPT, incident response, CERT-In)
- **Issue:** No VAPT schedule (RBI: 6-monthly critical / annual non-critical), no incident-response runbook covering CERT-In 6-hour reporting, no 180-day India-jurisdiction log retention statement.
- **Impact:** Regulated-entity partners (banks) will ask for these artifacts during onboarding; CERT-In applies to us directly.
- **Solution:** `docs/security/vapt-plan.md` + `docs/devops/incident-response-runbook.md` (CERT-In 6h / DPB 72h / RBI supervisory parallel paths), GCP log-retention config.
- **Owner:** security-reviewer (plans) + devops-engineer (runbook, retention)
- **Priority:** **Medium**

---

## Category D — Missing / Incomplete Features vs Requirements

### GAP-030 — AI Service is 100% unimplemented (5 endpoints all return 501)
- **Issue:** `Assist.WebApi/Endpoints/Ai/Ai.cs` — chat, message, embed, search, tax-advice all 501. No handlers, no DbSets, no pgvector wiring, no Semantic Kernel, no Vertex/Gemini client, no Sarvam client. Dependent features dead: AI first-response chat (7.7), RAG document search, AI smart ITR checklist (6.3), cash-flow forecasting (3.10), anomaly detection, regime-recommendation AI augmentation.
- **Impact:** A whole differentiating module from the brief is missing; market leaders (2026) ship AI receipt-scanning + reconciliation as standard. The 20 req/min `ai` rate limiter and admin AI-config UI exist with nothing behind them.
- **Solution:** Phased build: (P7a) embeddings + pgvector HNSW + document RAG search; (P7b) AI chat first-response with escalate-to-CA handoff into ChatService; (P7c) smart checklist + anomaly flags. Use the existing admin-configurable AI provider settings (`/auth/config/ai`). Never return raw model output (per AGENTS.md rule — map to DTOs).
- **Owner:** backend-agent (+ db-engineer for `ai` schema DbSets/HNSW)
- **Priority:** **High** (P7a/P7b), Medium (P7c)

### GAP-031 — Expert video-call booking & appointments missing (plan H2, screens 44–45, 82)
- **Issue:** No Google Meet/Zoom integration, no Appointment/AppointmentSlot/CaProfile entities in ChatService, no booking screens (mobile) or calendar (admin).
- **Impact:** The "CA consultation" half of Module 7 is absent; reminders (30min/5min), 2-hour cancellation rule, and 1–5 star CA rating are all unimplemented.
- **Solution:** ChatService additive: appointment entities + slots + booking/reschedule/cancel (≥2h rule) + rating; Google Meet link creation via Calendar API (adapter pattern, Zoom optional later); Notification events for reminders.
- **Owner:** backend-agent + mobile-dev + frontend-dev + ui-ux-agent (specs first) + db-engineer (chat schema additive)
- **Priority:** **Medium**

### GAP-032 — Tally XML export missing (Decision #5: "included, feature-flagged")
- **Issue:** No Tally export code anywhere.
- **Impact:** CA compatibility is decisive in the Indian market (every CA knows Tally); "Data Export for CA/Auditor" (brief 3.8) unfulfilled; decision log committed to full implementation behind a flag.
- **Solution:** ReportService export job: Tally XML (vouchers, ledgers, masters) for a date range; feature flag via existing admin settings; CSV fallback.
- **Owner:** backend-agent (+ frontend-dev export button on Reports)
- **Priority:** **Medium**

### GAP-033 — WhatsApp Business adapter missing (Decision #2: "full implementation, flagged off")
- **Issue:** Notification schema supports a `WHATSAPP` channel; no adapter class exists.
- **Impact:** Decision log committed to full implementation toggled off; WhatsApp is the dominant SME communication channel in India (invoice sharing/reminders via WhatsApp are table stakes in competitor apps).
- **Solution:** `WhatsAppBusinessAdapter` (Cloud API), template management hooks, admin settings already present — wire test-send; keep flag off by default.
- **Owner:** backend-agent
- **Priority:** **Medium**

### GAP-034 — Subscription/monetization stack incomplete (Module 9)
- **Issue:** (a) No Razorpay REST client — only webhook verification; cannot create orders/subscriptions server-side. (b) Admin `PaymentGatewaySettings` form is local-state with a TODO (`PATCH /subscriptions/config/razorpay` not wired). (c) Settings "Subscription Tiers" tab shows hardcoded stats (4 plans / 1,247 subscribers / ₹8.4L MRR). (d) No usage metering (`UsageRecord` absent — brief 9.4). (e) Trial-period management (9.6) unverified. (f) No subscriber-list or invoice-management admin UI (screens 92/94) though APIs exist. (g) No mobile billing screen (GAP-035).
- **Impact:** **The platform cannot charge money end-to-end.** Revenue dashboard shows fiction in settings; plan upgrades can't be initiated server-side; feature-gating by tier (Decision #7) has no metering substrate.
- **Solution:** Razorpay client (orders, subscriptions, plan sync) with admin-configured credentials; wire config PATCH; usage-metering middleware (document uploads, AI calls, chat sessions) into `subscription.usage_record`; subscriber list + invoice pages; replace hardcoded stats with `/subscriptions/mrr` + counts.
- **Owner:** backend-agent (client/metering), frontend-dev (settings wiring, subscriber/invoice pages)
- **Priority:** **High**

### GAP-035 — Mobile Subscription & Billing screen missing (screen 53)
- **Issue:** Profile menu "Billing" shows an `Alert.alert` stub; no `mobile/src/api/subscription.ts`.
- **Impact:** Users cannot view plan, upgrade, or see invoices — conversion funnel dead-ends on mobile (the primary surface).
- **Solution:** Subscription screen (current plan, usage, upgrade CTA → Razorpay checkout, invoice list) + API client.
- **Owner:** mobile-dev (after GAP-034 backend), ui-ux-agent (spec)
- **Priority:** **Medium**

### GAP-036 — Admin Subscriber List & Invoice Management pages missing (screens 92, 94)
- **Issue:** `subscriptionApi.listInvoices` exists unused; no subscriber-list UI.
- **Impact:** Support/ops can't look up a paying customer's state or resend an invoice.
- **Solution:** Two pages under `/subscriptions` with filters/pagination/CSV export.
- **Owner:** frontend-dev
- **Priority:** **Medium**

### GAP-037 — Notification Template Manager missing (brief 8.7, screen 95)
- **Issue:** 26-event catalog is code-defined; no admin CRUD for templates/variable substitution.
- **Impact:** Copy changes (per language) require deployments — violates the "admin-configurable, zero code deployments" design principle.
- **Solution:** Template entity per event×channel×language with variable placeholders; admin editor with preview + test-send; fall back to code defaults.
- **Owner:** backend-agent + frontend-dev + db-engineer (notification schema additive)
- **Priority:** **Medium**

### GAP-038 — HSN/SAC Manager page missing + production dataset not loaded (screen 97, P6-HANDOFF-17)
- **Issue:** Only a typeahead exists inside GST return review; the ~12k-row CBIC HSN/SAC dataset ops migration is pending.
- **Impact:** GSTR-1 requires HSN on every item; CA confirmation flow (plan E3.2) needs a browsable manager; empty dataset = broken typeahead in production.
- **Solution:** Standalone admin page (search, edit description, activate/deactivate) + devops one-time data load runbook execution.
- **Owner:** frontend-dev (page) + devops-engineer (dataset load)
- **Priority:** **Medium**

### GAP-039 — Loan comparison & offers not implemented (brief 5.7)
- **Issue:** `loan.loan_offers` table exists in migrations; no backend endpoints, no UI.
- **Impact:** "Compare offers from multiple partner banks" was an ADDED differentiator; currently users see a single path.
- **Solution:** Offers CRUD from partner-bank webhook/manual entry; comparison screen (rate/EMI/tenure side-by-side, uses existing EMI calculator math).
- **Owner:** backend-agent + mobile-dev
- **Priority:** **Low** (needs ≥2 live bank integrations to matter)

### GAP-040 — Loan consents catalog endpoint missing (P6-HANDOFF-25)
- **Issue:** `GET /loans/consents/catalog` not implemented; mobile hardcodes consent version `1.4`.
- **Impact:** Consent versioning is a legal artifact (RBI + DPDP); a hardcoded client version can mis-record what the user actually agreed to.
- **Solution:** Implement the catalog endpoint (versioned consent texts per language); mobile fetches at consent screen mount.
- **Owner:** backend-agent + mobile-dev (remove hardcode)
- **Priority:** **High**

### GAP-041 — StubLoanPdfGenerator still registered in LoanService
- **Issue:** `StubLoanPdfGenerator.cs` remains; the real QuestPDF LoanPackage generator lives in ReportService. Also QuestPDF font bundling open (P6-HANDOFF-32 — fonts must ship in `backend/Shared/fonts/` or Cloud Run renders garbage).
- **Impact:** Risk that a code path emits a stub PDF into a real bank submission; missing fonts break all PDF output in containers.
- **Solution:** Verify every package-generation path routes through ReportService; delete the stub or make it throw in non-dev; bundle fonts + container test.
- **Owner:** backend-agent (+ devops container check)
- **Priority:** **Medium** (font bundling High if PDFs ship)

### GAP-042 — ITR refund tracking is mock; reminder schedules unverified
- **Issue:** `ItrRefundPollingHandler` is an explicit mock progression; e-verification reminder cadence (Day 1/7/15/25-callback/29-urgent) and GST 7/3/1-day reminders need verification against the Cloud Scheduler job set.
- **Impact:** Refund timeline (a major user-delight moment, incl. celebration screen) shows fabricated states; missed e-verification = invalid return (30-day statutory window).
- **Solution:** Keep mock behind a flag; document manual ops procedure for refund status updates until IT-portal integration; audit + implement the full reminder job matrix; add the Day-25 auto-callback trigger (plan G8.1) into CallbackService.
- **Owner:** backend-agent + devops-engineer (scheduler jobs)
- **Priority:** **Medium**

### GAP-043 — Chat history export to PDF & message bookmarks missing (plan H1.3)
- **Issue:** Not implemented in ChatService or clients.
- **Impact:** Users keep CA advice as records (tax positions); export/bookmarks were explicit plan items.
- **Solution:** Bookmark flag on messages + "export thread as PDF" via ReportService.
- **Owner:** backend-agent + mobile-dev
- **Priority:** **Low**

### GAP-044 — Comparative analysis & cash-flow forecasting absent (brief 3.9/3.10)
- **Issue:** No YoY/MoM comparison endpoints; forecasting depends on AI service (GAP-030).
- **Impact:** Dashboard parity with market tools; "Share with Bank" narratives benefit from trends.
- **Solution:** Accounting comparative queries first (pure SQL); forecasting after GAP-030 P7a.
- **Owner:** backend-agent + mobile-dev (charts)
- **Priority:** **Low**

### GAP-045 — Multi-organization switching UX unverified (brief 1.7)
- **Issue:** Backend supports orgs/membership; mobile org-switcher flow not verified end-to-end (JWT org claim interacts with GAP-007).
- **Impact:** Users managing 2+ businesses (common for traders) may be unable to switch context.
- **Solution:** Verify/implement org switcher in mobile More/Profile; token re-issue per org context.
- **Owner:** mobile-dev + qa-mobile (verification first)
- **Priority:** **Medium**

### GAP-046 — Account Aggregator (AA) framework integration (industry best practice; not in brief)
- **Issue:** Bank statements arrive only as uploaded PDFs/images. India's AA ecosystem (Sahamati) is the 2026-standard way to fetch consented bank data for lending.
- **Impact:** Competitor lending journeys auto-fetch statements via AA; our loan document package quality and conversion would improve materially.
- **Solution:** Backlog item — evaluate AA TSP integration (consent-driven) for Loan Hub Phase 8+.
- **Owner:** orchestrator (evaluate), backend-agent (later)
- **Priority:** **Low** (recorded as researched recommendation)

### GAP-047 — Old-device confirmation on new-device login not implemented (plan B1.3)
- **Issue:** Max-2-devices is enforced in the domain (`User.AddDevice`), but the plan also requires "new device → OTP + confirmation on old device". No push-to-old-device approval flow found.
- **Impact:** Account-takeover resistance below spec for a financial app; OTP alone is phishable.
- **Solution:** On new-device login send an approval push to existing devices (approve/deny with 10-min expiry); deny → block + force re-verify.
- **Owner:** backend-agent + mobile-dev
- **Priority:** **Medium**

---

## Category E — Admin Frontend Gaps

### GAP-050 — Admin i18n materially incomplete; hardcoded strings widespread
- **Issue:** vs `en` (1,249 keys): `hi` missing 60, `bn` missing 341 (~27%). Hardcoded English across `DashboardPage`, `DocumentQueuePage`, `DocumentReviewPage`, `ItcMismatchPage`, `SettingsPage`, several settings sections, partial `LoginPage`. Two i18n runtimes coexist (custom `@/i18n` + react-i18next; ~13 components call `useTranslation()` without init — HANDOFF.md).
- **Impact:** Violates the project rule "all user-visible text through t()"; Hindi/Bengali operators (stated default languages) get mixed-language UI.
- **Solution:** Consolidate to react-i18next (init properly), extract hardcoded strings, backfill hi/bn keys, add a CI key-parity check.
- **Owner:** frontend-dev
- **Priority:** **Medium**

### GAP-051 — Admin auth: localStorage tokens, no refresh rotation
- **Issue:** JWT + user persisted in `localStorage` (`sa_admin_token`); no refresh-token flow (401 → full logout). Mobile, by contrast, has SecureStore + rotation.
- **Impact:** XSS-stealable long-lived token; operators logged out hourly (1-hour access token per spec) — UX + security below requirement 1.4.
- **Solution:** Move to in-memory access token + httpOnly-cookie refresh (or silent Firebase re-auth); align with backend session JWT lifetime; CSRF protection on the refresh route.
- **Owner:** frontend-dev + backend-agent (refresh endpoint already exists for mobile — reuse)
- **Priority:** **Medium**

### GAP-052 — System Health widget shows hardcoded metrics (screen 98)
- **Issue:** `DashboardPage.tsx` lines ~446–451: fabricated API latency/error rate/OCR queue depth/DB connections; "View Full Dashboard" button unwired.
- **Impact:** Operators may trust fake numbers during an incident — actively harmful.
- **Solution:** Either wire to Cloud Monitoring proxy endpoints (devops to expose) or remove the widget until real; never display fabricated operational data.
- **Owner:** frontend-dev + devops-engineer
- **Priority:** **Medium**

### GAP-053 — Callback pages role-narrowing TODOs (Phase 6F leftovers)
- **Issue:** `TODO Phase 6F: role-gate` in CallbackList/Detail/Kpi + Sidebar; route-level permission exists but page-level narrowing (KPI = Admin + Ops only) is not.
- **Impact:** Support executives can see org-wide KPI/SLA data beyond their remit.
- **Solution:** Apply `RoleGuard`/`Can` with the agreed matrix; remove TODOs.
- **Owner:** frontend-dev
- **Priority:** **Low**

### GAP-054 — Permission catalog `isActive`/`roleCount` cosmetic
- **Issue:** Toggle and count are client-side only; not persisted/computed by backend (qa-web finding).
- **Impact:** Admins believe they disabled a permission when they didn't — RBAC integrity/trust issue.
- **Solution:** Backend: persist `is_active` (enforced in `EffectivePermissionResolver`) + computed role count; frontend: remove optimistic fiction.
- **Owner:** backend-agent + frontend-dev
- **Priority:** **Medium**

### GAP-055 — Misc admin UX debt
- **Issue:** PlanDialog doesn't reset on reopen; HsnSacTypeahead lacks keyboard navigation; NoticeDetailPage missing `maxLength`; Menu Management drag-to-reorder pending; stale "mock" comment in `DashboardPage.tsx:35`; "Pending Invites" display bug noted in CHANGE-SUMMARY.
- **Impact:** Polish/perception; a11y keyboard support is a compliance nicety.
- **Solution:** Batch as a UX-debt sprint ticket list.
- **Owner:** frontend-dev
- **Priority:** **Low**

---

## Category F — Mobile Gaps

### GAP-060 — "Coming Soon" stubs sitting in front of implemented features
- **Issue:** `ITRDashboardScreen` (MoreStack entry) quick actions show Coming-Soon alerts although the full `ItrStack` (12 screens) exists; `GstDashboardScreen` calendar + GSTR-1 entries are Coming-Soon; `ProfileScreen` billing/help/edit-business are Alert stubs; duplicate unwired screens under `screens/loan/` (vs `loans/`).
- **Impact:** Users are told features don't exist when they do — direct conversion/retention damage; dead code confuses contributors.
- **Solution:** Wire ITRDashboard quick actions to ItrStack routes; route GSTR-1 entry to the implemented flows or hide; remove duplicate loan screens; implement or hide Profile stubs.
- **Owner:** mobile-dev
- **Priority:** **Medium**

### GAP-061 — Mobile hardcoded strings (despite full hi/bn key parity)
- **Issue:** `AppNavigator` tab labels, `MoreScreen` items, `ITRDashboardScreen` headers, various `Alert.alert('Error', ...)` are English literals; ~18/57 screens don't import `useTranslation`.
- **Impact:** Tab bar — the most visible UI — stays English for Hindi/Bengali users; violates project i18n rule.
- **Solution:** Extract to i18n keys (keys files already have parity, so additions are cheap); ESLint rule to flag string literals in JSX.
- **Owner:** mobile-dev
- **Priority:** **Medium**

### GAP-062 — Accessibility & QA fixlist (open mobile QA items)
- **Issue:** P6-QA-MOBILE-04/05 (GST notice tabs <44pt, missing accessibilityLabel), -08/-09 (loan sort chips 36pt, back buttons 40×40), -10 (CelebrationOverlay missing server fire-guard), -11 (double-callback on auto-dismiss), LoanPackagePreview 4 failing Jest matchers, "NaN documents" count bug, BUG-MOB-006 verify Devices screen supersedes Coming-Soon.
- **Impact:** 44pt touch targets are a hard project rule; celebration double-fire is a logic bug.
- **Solution:** Single a11y+bugfix pass with re-run of QA suites.
- **Owner:** mobile-dev (+ qa-mobile re-verify)
- **Priority:** **Low** (bundle), Medium for -10
                
### GAP-063 — Biometric step-up auth deferred (expo-local-authentication)
- **Issue:** GST approval / ITR approval / loan consent biometric gates fall back to Alert dialogs (deferred P6-HANDOFF-24; partially noted again in 6F).
- **Impact:** High-risk financial actions (filing approval, loan consent) lack step-up auth — industry baseline for fintech (step-up beats blanket lockdown).
- **Solution:** Install `expo-local-authentication` (EAS build, ties into GAP-006), wire the existing 2-stage consent flows to real biometrics with PIN fallback.
- **Owner:** mobile-dev
- **Priority:** **Medium**

### GAP-064 — Device integrity attestation missing
- **Issue:** No Play Integrity (Android) / App Attest (iOS) checks.
- **Impact:** 2026 fintech baseline (SafetyNet deprecated → Play Integrity); bots/emulators can drive OTP and loan flows.
- **Solution:** Attestation token on login + high-risk endpoints; backend verification middleware; soft-fail telemetry first, then enforce.
- **Owner:** mobile-dev + backend-agent
- **Priority:** **Medium**

### GAP-065 — Invite deep-link not resumed post-auth; resend doesn't mint fresh token
- **Issue:** Tapping an invite link while logged out drops the token after auth; resend-invite reuses the old token (HANDOFF-user-hierarchy-phase2.md).
- **Impact:** Team-onboarding funnel leaks; expired-token confusion.
- **Solution:** Persist pending invite token through the auth flow and auto-resume; resend returns a fresh share link.
- **Owner:** mobile-dev + backend-agent
- **Priority:** **Low**

---

## Category G — Platform / DevOps / Database Gaps

### GAP-070 — NotificationService EF snake_case configs missing (seeder band-aid)
- **Issue:** Entities lack snake_case configuration files; seeder fails and is wrapped in try/catch (audit-2026-05-16 PR #19 band-aid).
- **Impact:** Violates DB conventions; silent seeding failure can ship a service with empty catalogs.
- **Solution:** Proper entity configuration files; remove the try/catch; migration to reconcile existing column names.
- **Owner:** backend-agent + db-engineer (migration review)
- **Priority:** **High**

### GAP-071 — No CI migration-replay or Aspire smoke job
- **Issue:** No CI job applies all migrations to an empty PostgreSQL; no automated 12-service `/healthz` sweep after AppHost boot (both flagged in audit HANDOFF).
- **Impact:** The 2026-05-16 audit found 4 broken migrations + 10/12 services failing to boot — exactly the class of regression these jobs catch.
- **Solution:** CI jobs: (1) `psql` replay of `database/migrations/*` on postgres:17 + pgvector service container; (2) AppHost boot + healthz curl loop. (Depends on GAP-002 billing restore.)
- **Owner:** devops-engineer
- **Priority:** **Medium**

### GAP-072 — Dev seed drift (`200_dev_business_data.sql`)
- **Issue:** Column names drift vs current schema (e.g. `loan.partner_banks.name` vs `bank_name`); seed is skipped locally.
- **Impact:** New developers/QA get empty business data; live-smoke QA had to create data manually.
- **Solution:** Reconcile seed with schema; add seed execution to the CI migration-replay job so drift fails fast.
- **Owner:** db-engineer
- **Priority:** **Medium**

### GAP-073 — External-dependency lead-time flags unresolved (P6-FLAG-04/05/06/08/09/10)
- **Issue:** GSTN/IRP/EWB sandbox creds (3–6 week lead), MSG91 DLT sender registration (TRAI), SendGrid SPF/DKIM DNS, GCS Bucket Lock approval (irreversible), pilot-bank webhook secrets, Memorystore tier decision.
- **Impact:** Each is a hard prerequisite for its respective production feature (filing, SMS, email, loan retention, bank pilot); all have external lead times that gate any launch date.
- **Solution:** Team lead actions tracked weekly; devops prepares Secret Manager slots + config so creds drop in without code change.
- **Owner:** team lead (paperwork) + devops-engineer (provisioning)
- **Priority:** **High** (lead-time driven)

### GAP-074 — Income Tax portal integration roadmap undefined
- **Issue:** Filing is manual-by-design (per plan G7.2), but there is no documented roadmap for ERI (e-Return Intermediary) API integration, and refund polling is mock (GAP-042).
- **Impact:** Manual filing caps ops throughput; competitors file via authorized APIs.
- **Solution:** Research/decision doc on ERI registration feasibility; keep manual flow as fallback.
- **Owner:** orchestrator (decision doc) + backend-agent (later)
- **Priority:** **Low**

---

## Category H — Quality / Testing Gaps

### GAP-080 — No E2E test suites
- **Issue:** `mobile/e2e/` doesn't exist; no Playwright suite for admin security/RBAC flows (qa-web noted Phase 5 flows uncovered); `tests/e2e/` referenced in AGENTS.md is absent.
- **Impact:** Regression safety for multi-step flows (onboarding→invite, GST approve→file, loan consent) rests entirely on manual smoke tests.
- **Solution:** Playwright suite for top 6 admin journeys; Maestro (or Detox) for top 4 mobile journeys; wire into CI post-GAP-002.
- **Owner:** qa-web + qa-mobile
- **Priority:** **Medium**

### GAP-081 — Test coverage holes: DocumentService (0 tests), AiService (0), ReportService (no integration), thin integration elsewhere
- **Issue:** Per code audit; plus P6-INT-01 (`InternalsVisibleTo` missing in several `*Api.csproj`, AuthApiTests fail when run combined) and integration tests not re-run since PR #30 auth shape changes.
- **Impact:** The core upload→OCR→review pipeline (DocumentService) is the least-tested service in the system.
- **Solution:** DocumentService unit+integration project (upload validation, status transitions, signed URLs); fix InternalsVisibleTo; re-run full integration matrix against real Postgres.
- **Owner:** qa-web (tests/) + backend-agent (csproj fixes)
- **Priority:** **Medium**

### GAP-082 — Physical-device & release-config verification pending
- **Issue:** FCM tokens never verified on hardware (P6-MOBILE-02); deep-link scheme vs production bundle id unverified (P6-MOBILE-03); Firebase social sign-in E2E unexercised.
- **Impact:** Push + deep links are launch-critical; both commonly break between simulator and store builds.
- **Solution:** Device test pass on EAS build (depends GAP-006).
- **Owner:** qa-mobile + mobile-dev
- **Priority:** **Medium**

---

## Category I — Documentation Debt

### GAP-090 — `docs/api/endpoints.md` out of date
- **Issue:** Missing `/itr/doc-checklist`, `/itr/grievances` (now implemented), `POST /loans/eligibility` (P6-HANDOFF-35), the 11 ghost settings PATCH routes are documented-as-if-real (SEC-056), CallbackService and recent Auth module endpoints under-documented.
- **Impact:** Mobile/frontend devs code against a stale contract — this already caused P6-HANDOFF-23/25.
- **Solution:** Regenerate from the OpenAPI output of all 12 services; mark mock-backed endpoints explicitly.
- **Owner:** backend-agent (api-docs support)
- **Priority:** **Medium**

### GAP-091 — `docs/dev/static-data-debt.md` stale (claims zero mock pages) — **corrected 2026-06-10 as part of this review** (addendum added; DocumentQueue/Review, ItcMismatch, Dashboard System Health, Settings tier stats listed as open).

### GAP-092 — `status.md` stale — **corrected 2026-06-10** (post-Phase-6 review section added; current-state pointer updated).

### GAP-093 — Service-count and stack inconsistencies in top-level docs
- **Issue:** AGENTS.md says 3 composite services and references Azure/Azurite/pnpm in places; CLAUDE.md says 12 + GCP; project plan says .NET 8; repo is .NET 10 + GCP + npm.
- **Impact:** New agents/contributors get conflicting onboarding facts.
- **Solution:** Reconcile AGENTS.md to 12 services / GCP / actual commands.
- **Owner:** orchestrator
- **Priority:** **Low**

---

## Priority Roll-up

| Priority | Items |
|----------|-------|
| **High** | GAP-001, 002, 003, 004, 005, 006, 007, 010, 011, 012, 020, 021, 030(P7a/b), 034, 040, 070, 073 |
| **Medium** | GAP-008, 013, 014, 015, 022, 023, 024, 025, 031, 032, 033, 035, 036, 037, 038, 041, 042, 045, 047, 050, 051, 052, 054, 060, 061, 062(-10), 063, 064, 071, 072, 080, 081, 082, 090 |
| **Low** | GAP-039, 043, 044, 046, 053, 055, 062(rest), 065, 074, 093 |

## Suggested execution waves (Phase 7)

1. **Wave 0 (immediate, this week):** GAP-001 key rotation, GAP-002 CI billing, GAP-073 paperwork kickoff.
2. **Wave 1 — "Make the core loop real":** GAP-010, 011, 012, 007, 040, 070 + security High items (003, 004, 005).
3. **Wave 2 — "Compliance & money":** GAP-020, 021, 034, 006, 063, plus GAP-008 security bundle.
4. **Wave 3 — "Feature completion":** GAP-030 (AI P7a/b), 031, 032, 033, 037, 038, 022, 024, plus i18n (050, 061) and mobile polish (060, 062).
5. **Wave 4 — "Hardening & scale":** E2E suites (080), coverage (081), device verification (082), 064, 047, remainder of Lows.

---

*End of gap analysis. Task assignments per agent: `.claude/orchestrator/phase-7-tasks/`.*
