# SnapAccount — Orchestrator Status

## Current Phase: Phase 7 — Gap Closure & Production Readiness (WAVE 5 COMPLETE — 2026-06-11)

### Phase 7 Wave 5 — IMS/MCA UI, SEC-AI-02 to GO, design-elevation completion (2026-06-11, COMPLETE & live-verified)

Built, security-gated, live-tested (web + iOS), fixed, and re-verified in one cycle. Commits: `18ce9b0` (build wave) + closing slice (this commit).
- **IMS UI (#32)**: implementation-ready spec (docs/design/ims-inbox-spec.md) → admin 3 pages (/gst/ims, detail, GSTR-1A) + mobile 3 screens + 6 components; optimistic accept/5s undo→PENDING_KEPT, client-required reject reason, bulk cap 100, deemed banners; Hangfire deemed-acceptance job (14th 02:00 IST). Live web re-verify: 8/8 PASS.
- **MCA UI (#33)**: /compliance/edit-log page, FY+entity filters, CSV export, accounting.editlog.read gate. Live PASS.
- **SEC-AI-02 (#34)**: 2 review rounds + 2 fix rounds → **GO for staging**. AES-GCM key protection, platform.ai.manage gate + X-Internal-Token, advisory-locked reservation-row token budget (migration 077, concurrency-tested), RAG ingestion ownership check, Gemini systemInstruction separation, JWT-only org, chunk redaction, FG-01 cancellation abort. Conditions (TL): Pub/Sub publish IAM + InternalApi:SharedToken secret.
- **Design elevation #26 CLOSED (S0–S7)**: admin S3 skeleton/empty sweep + S5 3-tier dashboard (ARIA tabs w/ keyboard nav); mobile dark-mode ALL screens (ThemeProvider mount bug found by live QA — context default was a working light theme so tests passed silently; now null-default + real-App test); S3-mobile ListStates kit, S4 haptics/pull-to-refresh/celebration, S6 onboarding trust signals; tokens.json v2.1.0 (dark tertiary contrast fix). Mobile debt #35: type-check+lint 0/0.
- **Contract gaps #27**: org name editable (GSTIN explicitly KYC-gated 400), addressLine2 read-back, /subscriptions/me 404 typed, /auth/config/privacy-contact.
- **Bug class closed platform-wide**: BaseDbContext GuidStringConverter vs varchar created_by/updated_by (4 tables: gst.ims_invoices, gst.gstr1a_amendments, ai.chunks, ai.interactions — all other schemas uuid-clean). Full-materialization EfSmoke tests added (projection-only tests structurally can't catch this).
- **Boot bug found+fixed**: GstService Hangfire RecurringJob registered pre-app.Run() → ApplicationStarted callback.
- **Test totals**: backend 1418+ green (12 services), admin vitest 1022, mobile jest 596; i18n en/hi/bn parity (admin 1824, mobile 1322 keys/locale).
- **Open**: #24 TL queue (+2 new: Pub/Sub IAM, SharedToken secret), #36 wizard i18n (LOW), #37 dark-mode visual verify on iOS 17/18 sim (iOS 26.5 pre-release sim doesn't deliver Appearance events to RN 0.85 old-arch JS — fix is in-bundle + jest-pinned).
- QA reports: .claude/qa/live-web-wave5-2026-06-11.md, live-ios-wave5-2026-06-11.md.

### Phase 7 Wave 4 — Regulatory & platform build wave (2026-06-11, same session, COMPLETE & live-verified)

Team-lead approved dispatch ("2"). Delivered and verified live on the running stack:
- **GSTN IMS (GAP-101)**: full backend (3 entities, 8 endpoints, deterministic mock GSTN client, GSTR-1A, deemed-acceptance command) + migration 074 (tables, RLS, append-only action log) + 5 permissions seeded. Live: sync→8 mock invoices→summary with 2B deadline. Remaining: UI (task #32), Hangfire wiring, 3B-block verification vs primary advisory.
- **AI Service P7a (GAP-030)**: /ai/extract + org-scoped /ai/chat (mock-first, PAN/Aadhaar/card redaction, daily token budgets, Sarvam Indic routing) + RAG ingestion subscriber + migration 075 (chunks/embeddings FLOAT4[]→P7b pgvector/interactions). 61 tests. Follow-ups in #31.
- **MCA edit-log (GAP-100)**: migration 071 (append-only, trigger-enforced immutability incl. SUPER_ADMIN, auto-capture on 4 accounting tables) + GUC interceptor + auditor endpoints + permission 076. Live-verified. UI: #33.
- **IT Act 2025 (GAP-102)**: migration 072 (act_version/tax_year + section mapping) + resolver fallback logic + actVersion DTO fields. Regression found in live verify (10 wrong EF mappings on TaxSlabVersion/DeductionSection) — fixed, EfSmoke hardened from AnyAsync to full projections (closes the convention-divergence blind spot).
- **Chat idempotency (NEW-D08)**: closed end-to-end (backend dedupe + mobile UUID with retry-reuse).
- **Design elevation (#26, partial)**: admin S0 canonical tokens; mobile tinted-surface ThemeTokens + 6 regulated screens dark-mode migrated with both-mode contrast gate tests; 58 screens remain.
- **Callback MV vocab (073)**: counts now real.
- Backend suite ~1,250+ green across services; mobile jest 521/521; admin vitest 941/941. Migrations 071–076 all applied + scratch-replayed.

### Phase 7 Wave 3 — Live test → fix → retest cycle (2026-06-11 session)

Full record: **`live-test-verification-2026-06-11.md`**. Summary: task board rebuilt (30 tasks); qa-web API sweep found 16 failing endpoints (systemic EF↔DB divergence + RBAC status bugs) — ALL fixed across 3 backend rounds + migrations 065–069 and re-verified live (API + Playwright browser pass); EfSmoke suites (35) added, backend 1,143 tests green; B15 document review loop delivered end-to-end (backend+DB+frontend); a11y spec + 2 regulatory blockers fixed (SR-accessible KFS/consent gates); design-elevation spec (S0–S7) ready; single i18n runtime (1611-key en/hi/bn parity + CI gate); Settings real subscription stats; endpoints.md regenerated; AI architecture decided; Android live sweep done (11 findings, fixes dispatched; jest baseline 438/438). Remaining: iOS sweep, IMS/MCA/IT-Act/AI-P7a builds, TL queue (see task board).

### Phase 7 Wave 1 — COMPLETE & VERIFIED (2026-06-10 17:30 IST)

All four Wave 1 dispatches accepted after independent orchestrator verification (build/lint/test re-runs + code inspection, not report-trust):

| Agent | Scope | Verdict | Evidence |
|---|---|---|---|
| backend-agent | B1–B6 (Firebase revoke retry, RLS error alerting, SESSION_JWT_SECRET fail-fast ×12 services, /auth/token/refresh-context, Callback KPI + assignments_log SEC-030, loan consent locale + catalog endpoint) | ACCEPTED | dotnet build 0 err; Auth 575/575, Callback 35/35, Loan 90/90 |
| mobile-dev | M5 (stub removal: ITR/GST dashboards wired, 3 dup loan screens deleted) + M7 (i18n extraction, 830-key parity en/hi/bn) | ACCEPTED | Lint/type/jest failures verified pre-existing via git-stash baseline |
| db-engineer (retry) | DB1 (GAP-070 verified already reconciled by 060) + handoff migration 061 (loan.consent_locale, consent_catalog seeds en/hi/bn, deleted_at EF parity) | ACCEPTED | Full-chain replay clean on scratch DB; 061 idempotent; callback 018 drift-free |
| frontend-dev (retry) | F1 (Document Queue/Review real APIs, documentApi.ts) + F2 (ITC Mismatch wired) | ACCEPTED | Lint 0/0, build pass, vitest 912/912 (+29), i18n 126-key parity, 0 mock identifiers |

**Wave 1 notes:** First frontend-dev and db-engineer runs stalled (~15:35–15:47 IST) and were re-dispatched at 17:07 IST; retries completed in ~15 min each. Original mobile/backend runs completed first-pass.

**Open handoffs out of Wave 1:**
- Backend B15 (document review-decision/archive endpoints) — admin Review page buttons disabled with TODO B15 markers until delivered (Wave 3).
- hi/bn consent catalog seed texts are `[PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]` → team-lead legal review.
- `callback.kpi_daily_snapshot` MV refresh job (`REFRESH MATERIALIZED VIEW CONCURRENTLY`) → devops-engineer (Wave 2 D-slot).
- Clients must call `POST /auth/token/refresh-context` after org creation to close BUG-5 end-to-end → mobile M-slot + frontend (Wave 2).
- notification_event seeder try/catch band-aid (PR #19) can be removed now that 060 is verified → backend (Wave 2/3).
- Mobile Jest infra debt (nativewind/TurboModuleRegistry, 23 pre-existing failing suites) → qa-mobile (Wave 4).

### Phase 7 Wave 2 — COMPLETE & CODE-VERIFIED (2026-06-11 review)

Wave 2 (incl. batch 2) landed as commit `75c0e69` on branch `2026-06-10-s5t4` and was independently code-verified 2026-06-11: B7 DPDP privacy stack (entities + Privacy.cs + migration 062 + tests), B8 RBI KFS + cooling-off (migration 063 + mobile KeyFactsStatementScreen), B9 Razorpay client + usage metering (migration 064; Mock default in DI — production activation runbook needed), B10/B12 done, B11 spot-verified (SEC-056 endpoint wiring still partial), M2/M3/M4 delivered (Privacy Center + biometric step-up live), D4 CI migration-replay + healthz jobs, D5 scheduler matrix incl. KPI MV refresh. Full verification + 22 new findings + 12 new regulatory gaps (GAP-100..111): **`gap-analysis-2026-06-11-delta.md`**. Wave 3 recommendation in that doc §E; per-agent tasks created on the session task board 2026-06-11.

### Phase 7 Wave 2 — DISPATCHED (2026-06-10 20:55 IST, team-lead pre-approved autonomous continuation)

Batch 1 (parallel, disjoint file ownership):
- **backend-agent** → B7 (DPDP consent/privacy APIs), B8 (RBI KFS + cooling-off), B9 (Razorpay + usage metering), B10 (notification seeder band-aid removal), B11 (14-item security bundle), B12 (permission catalog is_active/roleCount). DDL handoff section required for db-engineer.
- **ui-ux-agent** → U1 (Key Facts Statement screen spec), U2 (Privacy Center spec). Unblocks mobile M3.
- **devops-engineer** → D3 (Secret Manager slots + HSN/SAC runbook + Bucket Lock prep), D4 (CI migration-replay + healthz smoke jobs), D5 (Cloud Scheduler job matrix incl. KPI MV refresh).
- **mobile-dev** → M2 only (consume /auth/token/refresh-context after onboarding; BUG-5 closure). M3/M4 held as batch 2 pending B7/B8 + U1/U2; M1 blocked on TL-2.

Batch 2 (queued): mobile M3 (KFS screen + Privacy Center) + M4 (biometric step-up, partial pending M1/TL-2); db-engineer DDL from backend B7/B8/B9/B12 handoff.

**Last Updated:** 2026-06-10 — **Comprehensive post-Phase-6 review complete.** Full gap analysis at `.claude/orchestrator/gap-analysis-2026-06-10.md` (50+ gaps: requirements vs implementation, security, DPDP Rules 2025 / RBI Digital Lending compliance, industry benchmarks). Per-agent Phase 7 task files at `.claude/orchestrator/phase-7-tasks/`. Team-lead action items TL-1..TL-10 listed in `phase-7-tasks/README.md` (CI billing, Firebase key rotation, GSTN/DLT/DNS paperwork, DPO appointment).

### Post-Phase-6 Review Summary (2026-06-10)
- **Verified state:** 12 backend services / ~236 endpoints / ~756 tests; AiService 100% 501-stubs; GSTN/IRP/EWB + ITR refund mock-by-default; admin 55 pages (Document Queue/Review + ITC Mismatch still mock-backed); mobile 57 screens (i18n key parity complete, several "Coming Soon" stubs).
- **Top blockers:** GAP-001 (committed Firebase plist + leaked key), GAP-002 (CI billing), GAP-003 (DPDP erasure broken on Firebase revoke failure), GAP-007 (BUG-5 session JWT missing orgId), GAP-010/011/012 (admin core review loop on mock data, KPI placeholder).
- **New compliance scope:** DPDP Rules 2025 consent/privacy-center/breach-runbook (GAP-020), RBI Digital Lending KFS + cooling-off (GAP-021).
- Work completed after Phase 6 close (Auth/RBAC module, user-hierarchy phases 1–2, 2026-05-16 infra audit PRs #17–23, 2026-06-06 live smoke QA) is reflected in the gap analysis inputs.

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Initialization | COMPLETE | Project brief produced at .claude/orchestrator/project-brief.md |
| Phase 1: Parallel Kickoff | COMPLETE | DB schema (15 files, 4,786 lines SQL), UI/UX (21 files, 7,247 lines), DevOps (14 files, 3,790 lines). All approved. |
| Phase 2: Backend | COMPLETE | 49 projects, 0 build errors. Auth Service fully implemented, Document + GST full domain/application, 9 service skeletons compilable. |
| Phase 3: Frontend + Mobile | COMPLETE | Admin panel: 57 files, 0 build errors, code-split 1.76s build. Mobile: 54 source files, full navigation tree, auth+dashboard+docs+GST screens. |
| Phase 4: QA + Security | COMPLETE | 84 tests (56 frontend passing), 25 security findings (3 Critical, 9 High, 8 Medium, 5 Low). Root .gitignore added. |
| Phase 5: Feedback Loop | COMPLETE — APPROVED 2026-04-25 | All 25 findings resolved, 2 new issues fixed, 79/79 backend + 56/56 frontend tests passing. All mobile icon/alignment issues fixed across 18+ screens. Visual QA complete with 15+ screenshots. Team lead approval granted in chat 2026-04-25. |
| Phase 6: Production Completion | IN PROGRESS | 6 sub-phases (6A–6F). Gap analysis at phase-6-gap-analysis.md. 6A (OCR→Accounting) + 6E (Notifications+Callbacks) kicking off in parallel. |
| Phase 6A: OCR → Accounting Pipeline | COMPLETE — STAGING-GO 2026-04-25 | AccountingService 7 endpoints, OCR→Ledger pipeline with dedupe_hash, GstService 3/6 stubs converted, GstReturnReviewPage live, CameraScreen state machine. Pre-prod blockers: SEC-030/033/034. |
| Phase 6B: GST Completion | COMPLETE — STAGING-GO 2026-04-25 | GstService 26 endpoints (Mock+Production GSTN/IRP/EWB w/ token redaction), 3 admin pages, 3 mobile screens. Backend 240/240, frontend 319/319, mobile 114/114 tests pass. Pre-prod blocker: GSTN sandbox creds (P6-FLAG-04). |
| Phase 6C: Loan Hub | COMPLETE — STAGING-GO 2026-04-25 | LoanService 13+ endpoints, ReportService QuestPDF (LoanPackage merge w/ canonical watermark), Mock+Production EmailPartnerBank+RestPartnerBank adapters w/ HMAC webhook (SEC-044 fix), 4 admin pages, 6 mobile screens (3-step consent + 2-stage biometric). Backend 313/313, frontend 485/485, mobile 204/204 tests pass. Pre-prod blockers: SEC-045/048/050 deferred to 6F; partner-bank pilot creds (P6-FLAG-09); GCS Bucket Lock approval (P6-FLAG-08). |
| Phase 6D: ITR Engine | COMPLETE — STAGING-GO 2026-04-25 | ItrService 17 endpoints + TaxComputationEngine w/ 6 golden-file tests, 3 admin pages (incl. CaTaxComputationPanel), 9 mobile screens. SEC-038/039/040/043 fixed. Pre-prod blocker: /itr/doc-checklist + /itr/grievances missing endpoints (P6-HANDOFF-23). |
| Phase 6E: Notifications + Callbacks | COMPLETE — STAGING-GO 2026-04-25 | NotificationService 8 endpoints + 26-event catalog + 3 adapters; NEW CallbackService (12th microservice) 11 endpoints + state machine. Pre-prod blockers: MSG91 DLT (P6-FLAG-05), SendGrid DNS (P6-FLAG-06). |
| Phase 6F: Admin Polish + Chat + Reports + Subscription + UX | COMPLETE — STAGING-GO 2026-04-25 | Mobile Track F2 (Chat) + Track F4 (UX polish) complete. 235 tests, 234 pass (1 pre-existing). 0 lint errors. Dark mode, haptics, BackgroundFetch, NetworkChip, CelebrationOverlay, SignalR chat live. |

## Agent Status

| Agent | Status | Current Task |
|-------|--------|-------------|
| orchestrator | ACTIVE | Coordinating Phase 6A + 6E parallel kickoff |
| db-engineer | PENDING ASSIGNMENT | Phase 6A additive tables + Phase 6E callbacks schema |
| backend-agent | PENDING ASSIGNMENT | AccountingService build (6A) + NotificationService/CallbackService build (6E) |
| ui-ux-agent | PENDING ASSIGNMENT | Callback mgmt screens (6E) + any UI specs required by 6A |
| frontend-dev | PENDING ASSIGNMENT | GstReturnReviewPage wire-up (6A) + admin Callback Management page (6E) |
| mobile-dev | COMPLETE — 6B+6D DONE | Phase 6B+6D mobile complete. 30+ files, 14 jest suites/66 tests. Awaiting 6C kickoff (blocked on 6B backend). |
| devops-engineer | PENDING ASSIGNMENT | Hangfire/Cloud Scheduler decision (6E) + Pub/Sub subscriber verification (6A) |
| qa-web | WAITING | Post-6A + 6E regression + new tests |
| qa-mobile | WAITING | Post-6A + 6E regression + new tests |
| security-reviewer | WAITING | Post-6A + 6E audit |

## Decisions Log

1. Added 3 new modules beyond project doc: Subscription & Billing, Audit & Compliance, Analytics & BI, TDS Management
2. Added 11 microservices (original 9 + Subscription Service + AI Service)
3. Database-per-service via PostgreSQL schemas within shared cluster
4. Technology versions: .NET 10, React 19, Expo SDK 52+, PostgreSQL 17
5. **Cloud changed from Azure to GCP + Firebase** — Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Secret Manager, Artifact Registry; GCP asia-south1 (Mumbai) for DPDP Act compliance
6. Firebase Auth for authentication (phone OTP, Google/Apple sign-in, 50K MAU free)
7. AI: Vertex AI / Gemini (default, swappable via admin config), Google Document AI (OCR), Sarvam AI (Indian languages)
8. **All open questions resolved 2026-04-04** — Razorpay (admin-configured), WhatsApp (feature-flagged off), Languages (English/Hindi/Bengali default + all state languages), Partner banks (adapter pattern, admin-configurable), Tally export (feature-flagged), Subscription tiers (admin-configurable), GCP Mumbai region confirmed
9. **[2026-04-25] Phase 6 kickoff — 6A + 6E in parallel** per team lead approval. No shared deps between 6A and 6E.
10. **[2026-04-25] AMENDMENT to Decision #2 — FLAG FOR TEAM LEAD:** Service count changes 11 → 12. Adding `CallbackService` as a new 12th microservice at `backend/Services/CallbackService/` (lead-gen + human-service model is core to SnapAccount value prop and needs its own bounded context / schema / SLA tracking). **Proceeding unless team lead objects.**
11. **[2026-04-25] FLAG FOR TEAM LEAD — Recurring job scheduler:** Recommending **Cloud Scheduler + Pub/Sub** over Hangfire for Phase 6E recurring jobs (GST filing reminders, ITR deadline alerts, subscription renewals). Rationale: Cloud Run scale-to-zero is incompatible with in-process Hangfire worker; managed Cloud Scheduler is serverless-native, has GCP IAM, and is cheaper at our scale. Hangfire retained only for in-request background tasks (e.g., document post-processing chains already in-flight). DevOps to write up tradeoffs in `docs/devops/recurring-jobs-decision.md` for team lead sign-off.
12. **[2026-04-25] FLAG FOR TEAM LEAD (pre-emptive, Phase 6C blocker):** QuestPDF Community License is free for orgs under $1M USD annual revenue — acceptable for current stage. Will need re-eval at scale. Track as deferred in Decisions Log.
13. **[2026-04-25] FLAG FOR TEAM LEAD (Phase 6B blocker — start paperwork NOW):** GSTN/IRP/EWB sandbox onboarding has multi-week lead time (typically 3–6 weeks). Action required: team lead to initiate GSTN API access, IRP (Invoice Registration Portal) credentials, and EWB (e-Way Bill) sandbox enrollment **this week** so credentials are in hand before Phase 6B starts (~2wk out).

## Phase 6 Dispatch Log

**2026-04-25 — Phase 6A + 6E kickoff dispatched.**

### Sub-phase 6A — OCR → Accounting Pipeline (P0, 2wk)
- **db-engineer** → DISPATCHED: additive migrations per `phase-6A-scope.md` (accounting.* tables, accounting.posting_audit, document.ocr_results extension). Ownership: `database/`, `docs/database/`.
- **backend-agent** → QUEUED (blocked_by: db-engineer): AccountingService full Clean Architecture build; OCR → Pub/Sub callback pipeline; GstService stub reduction (6 TODOs → ≤3). Ownership: `backend/`.
- **ui-ux-agent** → DISPATCHED (parallel): confirm `GstReturnReviewPage` + `CameraScreen` designs sufficient; produce delta specs in `docs/design/` if needed. Ownership: `docs/design/`.
- **devops-engineer** → DISPATCHED (parallel with db): verify Pub/Sub `ocr-results.completed` topic + subscription; wire AccountingService into Aspire AppHost; Dockerfile for AccountingService. Ownership: `Dockerfile*`, `docker-compose*`, `.github/`, `infra/`.
- **frontend-dev** → QUEUED (blocked_by: backend-agent + ui-ux-agent): wire `GstReturnReviewPage` to real GST API; add global Toast primitive. Ownership: `src/admin/`.
- **mobile-dev** → QUEUED (blocked_by: backend-agent + ui-ux-agent): `CameraScreen` local queue + optimistic UI; wire `FinancialReportsListScreen` to new accounting report endpoints. Ownership: `mobile/`.
- **qa-web + qa-mobile + security-reviewer** → QUEUED (blocked_by: frontend-dev + mobile-dev): parallel final gate per 6A exit criteria. Ownership: `tests/`, `src/admin/src/__tests__/`, `mobile/__tests__/`, `mobile/e2e/`, `.claude/qa/`, `docs/security/`.

### Sub-phase 6E — Notifications + Callbacks (P0, 2wk, parallel with 6A)
- **db-engineer** → DISPATCHED (same dispatch as 6A): additive migrations per `phase-6E-scope.md` (notification schema extensions + NEW `callback` schema). Ownership: `database/`, `docs/database/`.
- **devops-engineer** → DISPATCHED (same dispatch as 6A): MSG91 + SendGrid + Firebase Admin creds into GCP Secret Manager; write `docs/devops/recurring-jobs-decision.md` (Cloud Scheduler recommendation) for team lead review.
- **backend-agent** → QUEUED (blocked_by: db-engineer): NotificationService full build (26 events × 3 channels; FCM/MSG91/SendGrid adapters) + **NEW 12th microservice CallbackService** at `backend/Services/CallbackService/`. Ownership: `backend/`.
- **ui-ux-agent** → DISPATCHED (parallel): admin Callback Management screens (List/Detail/KPI) + mobile "Request Callback" flow specs in `docs/design/`.
- **frontend-dev** → QUEUED (blocked_by: backend-agent + ui-ux-agent): admin Callback Management pages + Notification Center dropdown in admin header. Ownership: `src/admin/`.
- **mobile-dev** → QUEUED (blocked_by: backend-agent + ui-ux-agent): Request Callback CTA component + RequestCallbackModal + CallbackStatusScreen; fix FCM token registration; push deep-link routing. Ownership: `mobile/`.
- **qa + security** → QUEUED: final gate.

### Coordination Rules (enforced)
- Strict file ownership — no cross-agent edits.
- Visual QA required for every new UI surface (screenshots attached to agent report).
- Integration tests hit real Postgres (not mocks) — per feedback memory.
- All agents report back to orchestrator via `SendMessage { summary }`. No agent messages team lead directly.
- Each completed sub-phase returns to orchestrator approval gate before 6B/6C/6D/6F unblock.

---

## Frontend Phase 6A+6E Complete — 2026-04-25 02:48 IST

**Agent:** frontend-dev
**Summary:** Frontend Phase 6A and 6E admin panel wiring complete.

### Phase 6A — GST Return Review (Real Data + ARN + Audit Trail)

- `src/admin/src/lib/gstApi.ts` — NEW: Zod-validated API client for all GST return endpoints (getGstReturn, getGstReturnAudit, saveGstReturnArn, submitGstReturnForFiling, flagGstReturnRevision, listGstReturns, listGstInvoices, createGstInvoice, approveGstReturn, assignGstReturn)
- `GstReturnReviewPage.tsx` — REWRITTEN: all mock data removed, wired to real API via useQuery/useMutation, ARN capture section (visible only for FILED/REVISION_NEEDED status), ARN validation regex `^[A-Z]{2}\d{2}[A-Z0-9]{12}$`, collapsible audit trail panel (localStorage state, dual render for responsive layout), toast.success/error on all mutations

### Phase 6E — Callbacks UI + Notification Center

- `src/admin/src/lib/callbackApi.ts` — NEW: full Zod-validated API client for callback lifecycle
- `src/admin/src/lib/notificationApi.ts` — NEW: notification inbox, preferences, push token registration
- `src/admin/src/pages/callbacks/CallbackListPage.tsx` — NEW: filter bar (status/category/priority/SLA breach), stats strip, dual mobile-card + desktop-table render, density toggle, SLA indicators, pagination, empty state
- `src/admin/src/pages/callbacks/CallbackDetailPage.tsx` — NEW: state machine transitions with ALLOWED_TRANSITIONS map, note composer (Cmd+Enter), timeline stepper via StatusTimeline, ConfirmDialog via Modal, linked entity display
- `src/admin/src/pages/callbacks/CallbackKpiPage.tsx` — NEW: 4 MetricCards, Recharts BarChart/AreaChart/PieChart, team performance table, SLA breaches table, range selector, 60s refetch, empty state
- `src/admin/src/components/shared/NotificationCenter.tsx` — NEW: bell badge, unread count, grouped-by-day dropdown, category filters, mark-all-read, outside-click close
- `src/admin/src/i18n/` — NEW: custom lightweight i18n runtime + en.json, hi.json, bn.json with all Phase 6 keys
- Router wired: /callbacks, /callbacks/kpi, /callbacks/:id under ProtectedLayout
- Sidebar wired: Callbacks nav item with PhoneCall icon

### Test Results

- GstReturnReviewPage.test.tsx: 13/13 pass
- CallbackListPage.test.tsx: 11/11 pass
- CallbackKpiPage.test.tsx: 8/8 pass
- Full suite: 76/88 pass — 12 pre-existing failures in StatusBadge/Button/DocumentQueuePage (checking -100 shade classes but components use -50 shades; introduced before Phase 6, not regressions)

### Build + Lint

- `npm run build` — PASS (TypeScript clean, Vite build successful)
- `npm run lint` — PASS (zero warnings, max-warnings 0)
- Dev server running at http://localhost:3000

### Chrome MCP Visual Verification

Chrome MCP unavailable in this session (no extension connected). Build + type-check + lint serve as verification.

### Handoff Notes for Phase 6F

- Role-gating TODOs marked with `// TODO Phase 6F: role-gate` comments in CallbackListPage, CallbackDetailPage, router.tsx
- RBAC requires real auth context — currently no-ops that show all callbacks to all admin roles
- Pre-existing test failures (12 tests) in StatusBadge/Button/DocumentQueuePage should be fixed by qa-web agent — they test wrong shade values (-100 vs -50)
- Dual-render pattern (mobile cards + desktop table) causes `findByText` to find multiple elements — future test authors must use `findAllByText()[0]` pattern

---

## Mobile Phase 6B+6D Complete — 2026-04-25 09:38 IST

**Agent:** mobile-dev
**Summary:** Phase 6B (GST Completion) and Phase 6D (ITR Engine) mobile screens complete. Combined dispatch.

### Phase 6B — GST Completion (2 screens + 1 companion + API + nav)

- `mobile/src/api/gst.ts` — NEW: full typed API client. Types: GstNotice, GstReturn, GstNoticeStatus, GstNoticeType, etc. Functions: listGstNotices, getGstNotice, createGstNotice, respondToGstNotice, assignGstNoticeToCa, fileNilReturn, listGstReturns, getGstReturn, searchHsnSac
- `mobile/src/screens/gst/GstNoticeInboxScreen.tsx` — NEW: notice list, badge count, filter tabs (All/Open/Overdue/Responded/Closed), NoticeRowMobile, swipe-to-archive gating, pull-to-refresh
- `mobile/src/screens/gst/GstNilReturnConfirmScreen.tsx` — NEW: return info card, implications list, acknowledgement checkbox gate, fileNilReturn mutation, ResultScreen on success
- `mobile/src/screens/gst/GstNoticeDetailScreen.tsx` — NEW: required companion screen for TypeScript nav param safety (`{ noticeId: string }`)
- `mobile/src/navigation/GstStack.tsx` — MODIFIED: added GstNoticeInbox, GstNoticeDetail, GstNilReturnConfirm routes

### Phase 6D — ITR Engine (9 screens + ItrStack + itr.ts + 11 components)

**API client:**
- `mobile/src/api/itr.ts` — NEW: 17 endpoints, full types. AssesseeProfile, ItrFiling, ComputeRequest, ComputeResult, RegimeComparisonResult, RefundStatus, ItrNotice, TaxSlabVersion, DeductionCatalog. Security note inline: panCipher must be AES-256-CBC ciphertext.

**Navigation:**
- `mobile/src/navigation/ItrStack.tsx` — NEW: 11-screen typed ItrStackParamList. Entry: ItrDashboard.

**Screens:**
- `EmployeeProfileWizardScreen.tsx` — 5-step wizard (Personal/Employment/Deductions/Investments/Review), non-blocking mutation on each Next
- `DocChecklistScreen.tsx` — backend-driven checklist, ProgressRing, category grouping, Form16 fast-track
- `Form16UploadScreen.tsx` — pick/uploading/review/done phases, expo-image-picker, editable OCR extraction fields
- `RegimeComparisonScreen.tsx` — compareRegimes + getTaxSlabs queries, RegimeBarChart, slabVersion note (never hardcodes rates)
- `FilingSummaryScreen.tsx` — AccordionSection groups (Income/Deductions/Tax/Personal), computationHash badge
- `UserApprovalScreen.tsx` — scroll-to-bottom gate + Alert biometric confirmation + submitFilingForReview mutation
- `EVerificationScreen.tsx` — 5 method options, CountdownCard (30-day deadline), ITR-V upload via expo-image-picker
- `RefundTrackerScreen.tsx` — vertical timeline, 30s live polling, RaiseGrievanceModal for delayed refunds
- `ItrNoticeInboxScreen.tsx` + `ItrNoticeDetailScreen.tsx` — parallel pattern to GstNoticeInbox

**Shared components (all new under mobile/src/components/shared/):**
NoticeRowMobile, DueDateChip, ResultScreen, Stepper, PanInput, AccordionSection, SummaryList, ProgressRing (pure RN), CountdownCard, RegimeBarChart (pure RN), RaiseGrievanceModal

**i18n:** en.json, hi.json, bn.json — all Phase 6B+6D keys added.

### Test Results

- Before: 10 suites / 50 tests
- After: 14 suites / 66 tests — all pass
- New test files: GstNoticeInboxScreen.test.tsx (2), GstNilReturnConfirmScreen.test.tsx (2), EmployeeProfileWizardScreen.test.tsx (3), ItrScreensSuite.test.tsx (9)

### Lint + Type-Check

- `npm run lint` — 0 errors in new files; 32 warnings (all pre-existing)
- `npm run type-check` — 0 new errors; 5 pre-existing errors in auth screens (FirebaseAuthTypes, [never, never] assignments, MoreScreen overload) — unchanged from Phase 6A baseline

### Contract Gaps (action required for backend team)

1. `GET /itr/doc-checklist?assesseeId&filingId` — used by DocChecklistScreen, not in docs/api/endpoints.md
2. `POST /itr/grievances` — used by RaiseGrievanceModal, not in docs/api/endpoints.md
3. `expo-local-authentication` not in package.json — UserApprovalScreen uses Alert dialog fallback. Production: install and replace.
4. `expo-document-picker` not in package.json — EVerificationScreen and Form16UploadScreen use expo-image-picker fallback. Production: install for proper PDF selection.

### Pre-existing Failures (not introduced by 6B+6D)

- FirebaseAuthTypes TS errors in AuthNavigator, OTPVerifyScreen, PhoneEntryScreen
- `[never, never]` errors in OTPVerifyScreen, PermissionRequestsScreen, SplashScreen
- MoreScreen navigation overload error

### Run command

`cd mobile && npx expo start`

---

## Mobile Phase 6F Complete — 2026-04-25 IST

**Agent:** mobile-dev
**Summary:** Phase 6F (final mobile phase) — Track F2 (Chat) + Track F4 (UX polish) complete.

### Files Created

- `mobile/src/api/chat.ts` — REST + SignalR client (listThreads, getMessages, sendMessage, createThread, markRead, resolveThread, searchMessages, getUnreadCount, postTypingPing; buildChatHubConnection, subscribeChatHub, startChatHub, stopChatHub)
- `mobile/src/navigation/ChatStack.tsx` — ChatStackParamList (ChatList, ChatDetail)
- `mobile/src/screens/chat/ChatDetailScreen.tsx` — Full chat thread screen: SignalR live updates, typing indicator, optimistic send, rollback on failure, haptics, KeyboardAvoidingView, new-messages pill, useSensitiveScreen (SEC-015)
- `mobile/src/screens/chat/ChatListScreen.tsx` — REWRITTEN: CategoryBadge, SkeletonRow, ThreadRow (84pt min), category filter chips, search bar, unread counts, pull-to-refresh, FAB, swipe-to-archive gating
- `mobile/src/contexts/ThemeContext.tsx` — ThemeProvider: system/light/dark modes, LIGHT_TOKENS/DARK_TOKENS, AsyncStorage persistence, 1.5s-debounced PATCH /me/preferences sync
- `mobile/src/hooks/useHaptics.ts` — success/warning/error/lightTap/mediumTap/celebrationBurst; AsyncStorage enabled flag
- `mobile/src/components/shared/NetworkQualityChip.tsx` — slow/offline animated pill; 5s hysteresis for slow detection; tap shows Alert (NetworkSheet deferred Phase 7)
- `mobile/src/components/loans/CelebrationOverlay.tsx` — MODIFIED: 9 CelebrationKind variants (APPROVED/DISBURSED + 7 new), KIND_ICON map, copy via switch
- `mobile/src/hooks/useDocumentQueue.ts` — MODIFIED: BackgroundFetch + TaskManager; DOCUMENT_QUEUE_BG_TASK = 'SNAPACCOUNT_DOC_QUEUE_FLUSH'; registerDocumentQueueBgFetch() on mount
- `mobile/src/notifications/notificationRouter.ts` — MODIFIED: chat_message_received → ChatDetail; loan_disbursed/loan_approved → LoanStatus
- `mobile/src/navigation/MoreStack.tsx` — MODIFIED: 'Chat' route → ChatStack; 'ChatList' kept as alias
- `mobile/src/screens/profile/MoreScreen.tsx` — MODIFIED: Expert Chat routes to 'Chat' (not 'ChatList')
- `mobile/src/screens/callbacks/RequestCallbackModalScreen.tsx` — MODIFIED: useSensitiveScreen() added (SEC-033)
- `mobile/src/screens/gst/GstApprovalScreen.tsx` — MODIFIED: maybeRequestReview() on first GST approval success (expo-store-review, AsyncStorage one-time flag)
- `mobile/src/i18n/en.json`, `hi.json`, `bn.json` — MODIFIED: new keys under mobile.chat.*, mobile.celebration.*, mobile.net.*, mobile.bio.*, mobile.theme.*

### New Mock Files (moduleNameMapper)

- `src/__mocks__/expoHaptics.ts`
- `src/__mocks__/signalr.ts`
- `src/__mocks__/expoTaskManager.ts`
- `src/__mocks__/expoBackgroundFetch.ts`
- `src/__mocks__/expoStoreReview.ts`
- `src/__mocks__/expoScreenCapture.ts` (pre-existing gap fixed)
- `src/__mocks__/expoConstants.ts` (pre-existing gap fixed)

### New Test Files

- `__tests__/hooks/useHaptics.test.ts` (5 tests)
- `__tests__/contexts/ThemeContext.test.tsx` (2 tests)
- `__tests__/api/chat.test.ts` (6 tests)
- `__tests__/components/NetworkQualityChip.test.tsx` (2 tests)
- `__tests__/components/CelebrationOverlay.test.tsx` (9 parametrized tests)
- `__tests__/screens/ChatListScreen.test.tsx` (3 tests)
- `__tests__/screens/ChatDetailScreen.test.tsx` (2 tests)

### Test Results

- Before: 204 tests / 22 suites
- After: 235 tests / 30 suites — 234 pass
- 1 pre-existing failure: LoanPackagePreviewScreen watermark test (children array shape mismatch, not introduced by 6F)

### Lint + Type-Check

- `npm run lint` — 0 errors; 33 warnings (all pre-existing)
- `npm run type-check` — 0 new errors; 6 pre-existing errors in auth screens (FirebaseAuthTypes, [never, never]) — unchanged from Phase 6C baseline

### Sensitive Screens Audit (SEC-033 follow-up)

- `ChatDetailScreen.tsx` — useSensitiveScreen() added (contains message content with financial details)
- `RequestCallbackModalScreen.tsx` — useSensitiveScreen() added (contains phone/name/category form)
- Pre-existing: GstApprovalScreen, LoanConsentScreen, LoanPackagePreviewScreen, ITR UserApprovalScreen, all ITR/GST tax figure screens — already covered

### Contract Gaps (deferred — document for Phase 7 / production)

1. **CONTRACT_GAP_SIGNALR_RN**: @microsoft/signalr v8+ uses browser EventSource. React Native has WebSocket but not EventSource/SSE. Configured with `skipNegotiation: false`, WebSockets transport only. REST `/chat/typing` fallback via `postTypingPing()` when SignalR unavailable. Documented in `chat.ts` comments.
2. **expo-local-authentication**: Still deferred per P6-HANDOFF-24. Biometric gates in network-aware-ux.md not wired to actual LocalAuthentication calls.
3. **expo-document-picker**: Still deferred. Attach icon in ChatDetailScreen is present but handler stub only.
4. **App rating prompt**: Wired to GstApprovalScreen `handleApprove` success path via `maybeRequestReview()`. AsyncStorage key `@snapaccount/gst_rating_prompted` prevents repeat prompts.

### Dark Mode Status

- ThemeContext.tsx provides LIGHT_TOKENS/DARK_TOKENS to all new components (ChatDetailScreen, ChatListScreen, NetworkQualityChip, CelebrationOverlay)
- Existing screens (GstDashboard, LoanHub, ItrDashboard, etc.) will need ThemeContext import for full dark mode support — deferred to Phase 7 full dark mode pass
- ThemeContext is available at root; any screen can opt in via `useTheme()`

### Run command

`cd mobile && npx expo start`
