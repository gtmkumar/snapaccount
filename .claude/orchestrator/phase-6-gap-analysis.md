# SnapAccount — Phase 6 Gap Analysis

> **Produced:** 2026-04-25
> **Author:** Claude (planning mode, read-only analysis — no code changed)
> **Source Plan:** `SnapAccount_Complete_Project_Plan (1) (1).docx` v2.0, Feb 2026
> **Baseline:** Phase 5 complete, pending team-lead approval (see `status.md`)
> **Purpose:** Drive Phase 6 decomposition. Orchestrator-only handoff artifact.

---

## 1. Executive Summary

**Production readiness today: ~35% against the v2.0 plan.**

| Layer | Scaffolded | Partial | Production-ready |
|---|---|---|---|
| DB schemas | 11/11 | 0/11 | 11/11 ✅ (schema is the strongest layer) |
| Backend services | 11/11 | 2/11 (Gst, Document) | 1/11 (Auth) |
| Admin pages | 16/16 | 7/16 | 2/16 (Dashboard, DocumentQueue) |
| Mobile screens | 25 | 14 API-wired | 0 end-to-end complete |
| External integrations | Firebase Auth, GCS, Pub/Sub, Google Document AI | Sarvam, Vertex AI (adapters exist, not exercised) | Firebase Auth only |

**Three big shaped problems:**

1. **8 of 11 services have zero Application handlers.** Endpoints return
   `Results.Json(..., statusCode: 501)`. This is the single largest block of
   missing work and gates every corresponding admin/mobile feature.
2. **Cross-cutting domain missing entirely:** the Callback system (plan E4 +
   G4), IT/GST notice trackers, appointment booking, and PDF-package generation
   for Loan Hub are not started — no schema, no service, no UI.
3. **Admin pages are half stubs.** 7 top-level pages render `StubPage` ("Coming
   Soon" card). Settings sections are local-state forms with zero persistence.
   `GstReturnReviewPage` and `UserDetailPage` render mock data — 0 API calls.

**Phase 5 is a precondition.** Do not start Phase 6 before team lead signs off
on Phase 5 (25 security findings + visual QA — see `status.md`).

---

## 2. Per-Service API Gap Matrix

Evidence: endpoint files at `backend/Services/*/*.Api/Endpoints/*.cs`, handlers
at `backend/Services/*/*.Application/`.

Legend: ✅ wired (handler + mediator) · 🟡 partial (handler exists, some stubs) · ❌ stub (501 or hard-coded JSON).

### 2.1 AuthService — ✅ production-grade
- 10/10 endpoints mediator-wired, 0 TODOs.
- Has: OTP send/verify, register, refresh, devices, organizations, preferences, account-deletion (DPDP).
- **Gaps:** session-management device limit (plan B1.3 — max 2 devices) logic needs verification; Aadhaar OTP (plan B2.4) not present.
- Priority: **P2** — already usable.

### 2.2 GstService — 🟡 50% wired (P0)
- Wired: CreateReturn, GetReturn, Submit, Approve, File, GetItcMismatches.
- **Stubs (return 501):** list returns, list/create invoices, list notices, e-invoice generation, e-way bill creation. 6 TODO markers.
- **Missing vs plan (Module E):** GSTR-1 invoice-level submission, HSN/SAC code lookup, auto-calculation engine confirmation, callback triggers (E4), filing deadline reminders (E5), nil-return handling, ARN capture workflow.
- Priority: **P0** (core revenue feature, user journey K1 step 8-11).

### 2.3 DocumentService — 🟡 ~50% wired (P0)
- Wired: Upload, Categorize, Archive, Get, List, RequestOcr, Share (7 handlers, 6 mediator calls).
- 8 TODO markers — OCR result callback, share-link expiry, bulk re-process, duplicate detection, status transitions.
- ✅ `GoogleDocumentAiService.cs` exists in Infrastructure.
- **Missing vs plan (Module C):** OCR confidence tri-color rendering in admin (C2.2), manual-override audit trail, 7-year retention policy automation (C3.3), party-name/invoice-number/amount search (C3.3).
- Priority: **P0** (unblocks Accounting → Dashboard → GST → Loan).

### 2.4 AccountingService — ❌ stub (P0)
- 0 handlers, 0 Application dirs, 6 endpoints return 501.
- **Missing entirely:** ledger posting from documents, trial balance, P&L, balance sheet, cash flow, tax-liability report, ledger-by-account, double-entry invariants, financial-year close.
- Depends on: DocumentService OCR → structured data → ledger posting pipeline.
- Priority: **P0** — Dashboard / Reports / Loan-package all read from here.

### 2.5 LoanService — ❌ stub (P0)
- 0 handlers, all 6 endpoints 501 (`Loans.cs` has only Results.Json stubs).
- **Missing vs plan (Module F):** eligibility check (F2), auto-generated document package (F3 — 12-month GSTR-3B + BS + P&L + bank summary + KYC merged to single PDF), application workflow (F4), consent management (F4.2), bank-adapter pattern, application status tracking, disbursement webhook.
- Priority: **P0** (flagship differentiator).

### 2.6 ItrService — ❌ stub (P0)
- 0 handlers, 6 endpoints 501.
- **Missing vs plan (Module G):** employee profile wizard, smart document checklist (G2.2), verification queue, **tax computation engine** (G5 — income heads, slabs, deductions, cess, rebate), regime comparison Old vs New (G6), e-verification flow (G8.1), refund tracker (G8.2), notice handler (G8.3).
- Depends on: Callback system, Notification service.
- Priority: **P0**.

### 2.7 ChatService — ❌ stub (P1)
- 0 handlers; SignalR referenced in `ChatService.Infrastructure/DependencyInjection.cs` but no hub class built.
- **Missing vs plan (Module H):** real-time chat with category routing (H1.2), typing indicators, read receipts, chat history search, appointment booking + video-call integration (H2).
- Priority: **P1**.

### 2.8 NotificationService — ❌ stub (P0 cross-cutting)
- 0 handlers, 5 endpoints 501. `NotificationService.Infrastructure/DependencyInjection.cs` references SendGrid/MSG91 but handlers not present.
- **Missing vs plan (Module I):** centralized fan-out, per-event channel matrix (26 events × push/sms/email), in-app message center, preference management, deadline-reminder scheduler (GST 7d/3d/1d, ITR e-verify Day 1/7/15/25/29).
- Priority: **P0** — every other feature emits notifications.

### 2.9 ReportService — ❌ stub (P1)
- 0 handlers, 5 endpoints 501.
- **Missing vs plan (Module D):** PDF generation for Trial Balance, P&L, Balance Sheet, Cash Flow, Tax Liability, Ledger; share-with-CA, share-with-bank formatting; watermarking ("Generated by SnapAccount | Date | Code") per F3 footer.
- Priority: **P1** (but P0 for Loan Hub readiness).

### 2.10 SubscriptionService — ❌ stub (P2)
- 0 handlers, 6 endpoints 501, 93-line endpoint file with Razorpay integration hints. Razorpay webhook HMAC fix (SEC-001 + NEW-001) is in place per `bug-log.md`.
- **Missing:** plan CRUD admin APIs, subscribe/cancel/upgrade, invoice generation, admin-configurable tiers (decision 8 in `status.md`).
- Priority: **P2** (monetization, but not MVP-blocking for pilot users).

### 2.11 AiService — ❌ stub (P2)
- 0 handlers, 5 endpoints 501. `AiService.Infrastructure/DependencyInjection.cs` references Vertex/Gemini/Sarvam.
- **Missing:** RAG pipeline wiring (schema exists in `011_ai_schema.sql`), chat-copilot, tax-advice queries, doc-Q&A.
- Priority: **P2** (premium feature; gate on Chat + ITR first).

---

## 3. Admin Frontend Gap Matrix

Evidence: `src/admin/src/pages/**/*.tsx`, `src/admin/src/router.tsx`.

| Page | State | Lines | API calls | Priority | Work |
|---|---|---|---|---|---|
| DashboardPage | ✅ done | 498 | 3 | — | Minor polish |
| DocumentQueuePage | ✅ done | 319 | 2 | — | — |
| DocumentReviewPage | ✅ done | 397 | 2 | — | — |
| GstFilingQueuePage | ✅ done | 437 | 2 | — | — |
| ItcMismatchPage | ✅ done | 134 | 2 | — | — |
| UserListPage | ✅ done | 300 | 2 | — | — |
| GstReturnReviewPage | 🟡 mock | 324 | **0** | P0 | Wire to GST API, ARN capture, audit trail |
| UserDetailPage | 🟡 mock | 288 | **0** | P1 | Wire to Auth API, org/device/permission views |
| ChatPage | ❌ stub | 20 | 0 | P1 | Build CA inbox, SignalR client, category router |
| ItrPage | ❌ stub | 20 | 0 | P0 | Verification queue, tax-comp panel, filing queue, notice tracker |
| LoansPage | ❌ stub | 20 | 0 | P0 | Applications list, doc-package review, bank comms log, disbursement |
| ReportsPage | ❌ stub | 20 | 0 | P1 | Report generation UI + PDF preview |
| SubscriptionsPage | ❌ stub | 20 | 0 | P2 | Plan management, active subs, MRR dashboard |
| TeamPage | ❌ stub | 20 | 0 | P1 | User management, role assignment, workload view |
| Settings/* (8 sections) | ❌ local | 119–324 | **0 total** | P1 | Wire to config API; no persistence today |
| **Missing entirely** | — | — | — | P0 | Callback Management panel (GST+ITR unified), IT/GST Notice Trackers, CA Tax Computation Panel, Appointment Calendar |

### UI/UX modernization (admin)

- **Good baseline:** Tailwind v4, `AppShell`, `Card`, `Badge`, `PageHeader` primitives, brand-colored theme.
- **Gaps:**
  - No global toast/notification system (needed for every mutation).
  - No loading skeletons — stub pages use "Coming Soon" copy.
  - No empty states beyond a single "Coming Soon" card.
  - No role-based navigation (plan J6 defines 4 roles, current app shows everything to everyone).
  - Settings sections feel like Figma export — forms have `onChange` but no `onSubmit` → API.
  - No command-palette / search-across-app (power-user feature for ops team).
  - No keyboard-shortcut surface (processing-heavy workflow deserves them).
  - Dark-mode not exercised (tokens support it but not toggled).

---

## 4. Mobile App Gap Matrix

Evidence: `mobile/src/screens/**/*.tsx` (25 files).

### API-wired screens (14)

Home, DocumentList, DocumentDetail, DocumentCategory, GstDashboard, GstApproval, Gstr3b, ChatList, NotificationCenter, ITRDashboard, ReportDetail, OTPVerify, BusinessProfileWizard, LoanStatus.

### Not API-wired (11)

| Screen | Priority | Gap |
|---|---|---|
| CameraScreen | P0 | 398 lines, no API call; needs UploadDocument → RequestOcr flow |
| LoanHubScreen | P0 | No API; plan F1 loan catalog from backend |
| LoanEligibilityScreen | P0 | No API; calls `POST /loans/eligibility-check` (stub) |
| EMICalculatorScreen | P1 | Client-side calc OK; backend rate-table not wired |
| FinancialReportsListScreen | P1 | No API; needs ReportService |
| ProfileScreen | P1 | No API; needs Auth GetCurrentUser + Update |
| MoreScreen | P2 | Static links; should show verification status, support, legal |
| SplashScreen | P2 | Client-only; OK |
| PermissionRequestsScreen | P2 | Client-only; OK |
| PhoneEntryScreen | — | Routes to OTP which is wired |
| LanguageSelectionScreen | P1 | Not wired to LanguageSettings (needs persistence via Auth preferences) |

### Missing mobile surfaces vs plan

- **ITR**: only `ITRDashboardScreen` exists. Plan G demands profile wizard, doc checklist, regime-comparison, summary-approval, e-verification, refund-tracker — **6+ screens missing**.
- **Loan**: no consent screen (F4.2), no document-package preview (F3).
- **Chat**: `ChatListScreen` exists but no `ChatDetailScreen`, no appointment booking, no video-call entry point.
- **Callback**: no callback-status screen ("Support will call you at 3:30pm" notice).
- **GST Notice**: no notice inbox / response screen.
- **Dashboard drill-downs**: "Tap any bar" (D1.2) not implemented.

### Mobile UI/UX modernization

- **Good:** Ionicons across 18 screens (Phase 5 fix), consistent theme, NativeWind styling, SecureStore for tokens.
- **Gaps:**
  - No offline-first writes (photo should enqueue to local queue, sync when online — critical for SME shopkeepers on flaky networks).
  - No optimistic updates on photo upload (user waits for server round-trip).
  - No background-upload with progress (Expo TaskManager / BackgroundFetch).
  - No haptic feedback on success actions (feels flat compared to best-in-class).
  - No celebration/confirmation animations (plan K2 step 15: "Celebration screen in app" — not built).
  - Notification permissions flow exists but FCM token registration → backend not verified end-to-end.
  - Accessibility pass overdue (VoiceOver labels, minimum touch targets beyond the 44x44pt rule).
  - No app-rating prompt after successful GST filing (retention driver).

---

## 5. Cross-Cutting Gaps (features not owned by any single service)

### 5.1 Callback System (plan E4 + G4) — **missing entirely, P0**
No `callbacks` schema in DB (not in migrations 001–015). No endpoints. No admin UI.
Needs: callbacks table, assignment logic, scheduled-call queue, call-notes, KPI dashboard, status enum (PENDING/SCHEDULED/IN_PROGRESS/COMPLETED/FOLLOW_UP_NEEDED/ESCALATED_TO_CA/CANCELLED).
**Owner:** new `CallbackService` or part of NotificationService; admin UI in `src/admin/src/pages/callbacks/`; mobile "Request Callback" buttons on GST/ITR screens.

### 5.2 Notice Tracker (GST notice + IT notice) — **missing, P0 for compliance**
Plan E5 + G8.3 reference notice handling, but no schema, no service, no UI. Needs upload-notice, CA-response workflow, deadline alerts.

### 5.3 OCR → Accounting Pipeline — **half-built, P0**
`GoogleDocumentAiService` exists but the downstream pipeline (OCR result → structured entities → accounting ledger posting → dashboard numbers) is not wired. AccountingService is 100% stub. This is the single most-important integration for the product value proposition ("take a photo → dashboard updates").

### 5.4 Notification Fan-Out — **missing, P0**
Plan I2 defines 26 notification events. No dispatcher. No FCM/MSG91/SendGrid handlers. Without this, filing deadlines are silent.

### 5.5 PDF Generation Service — **missing, P0 for Loan Hub**
No PDF lib referenced in `backend/Services/ReportService/`. Loan Hub (F3) requires merging 7 docs into a branded PDF with watermark. Options: QuestPDF (.NET), headless Chromium, or external service.

### 5.6 Role-Based Admin UI — **partial, P1**
Auth RBAC scaffolding exists (PermissionBehavior, Permissions query). Admin UI doesn't vary by role. Plan J6 lists 4 roles × 10 capability rows.

### 5.7 Appointment Booking + Video Call — **missing, P2**
Plan H2. No schema, no service. Needs calendar integration + Meet/Zoom adapter.

### 5.8 E-verification of ITR — **missing, P0 for ITR go-live**
Plan G8.1 — Aadhaar OTP / Net Banking / Bank EVC / Digital Signature. None wired.

### 5.9 E-Invoicing (turnover > ₹5 Cr) — **stub, P1**
Endpoint exists in GST service as 501. IRN generation via IRP API not wired.

### 5.10 E-Way Bill — **stub, P1**
Same shape as E-Invoicing. EWB API not wired.

---

## 6. UI/UX Modernization Recommendations

### Admin panel (Phase 6F)
1. **Introduce a design-system refresh pass:** audit `ui/Card`, `ui/Badge`, `ui/Button`, add `Toast`, `Skeleton`, `EmptyState`, `ErrorBoundary`, `Dialog`, `Tabs`, `Stepper` primitives if absent.
2. **Role-based shell:** read `useCurrentUser()` permissions, hide nav items, gate pages via `<RoleGuard>`.
3. **Kill all StubPage usages:** replace with production builds or remove from nav.
4. **Mutation feedback:** every admin mutation emits a toast + optimistic update.
5. **Command palette (cmd+k):** jump to user, document, return, callback.
6. **Dense data tables:** current tables are roomy; ops teams want compact variant with saved filters.
7. **Dark mode toggle** (tokens already support it).
8. **Accessibility sweep:** focus-visible rings, keyboard traps in dialogs, ARIA on status chips.

### Mobile app (Phase 6F)
1. **Offline-first for photo capture:** local queue, background upload, retry on reconnect.
2. **Optimistic UI:** upload appears immediately in DocumentListScreen with status=QUEUED.
3. **Haptics on key actions** (submit, approve, refund received).
4. **Celebration screen** for refund credited / first GST filed (plan K2 step 15).
5. **Deep-link + push-notification routing:** tapping a GST-deadline push goes to `GstDashboardScreen`, not app root.
6. **Biometric re-auth** for sensitive screens (loan application, ITR summary).
7. **Network-quality-aware UX:** show "slow connection" chip when uploads crawl.
8. **Dark mode.**

---

## 7. Integration Adapter Audit

| Integration | Adapter file | Wiring status | Phase 6 action |
|---|---|---|---|
| Firebase Auth | `FirebaseAuthMiddleware.cs` | ✅ wired | — |
| Firebase FCM (push) | not found | ❌ | Build in NotificationService |
| Google Cloud Storage | `GoogleCloudStorageService.cs` | ✅ wired | — |
| Google Pub/Sub | `GooglePubSubPublisher.cs` | ✅ wired | Confirm subscribers for async OCR |
| Google Document AI (OCR) | `DocumentService.Infrastructure/Services/GoogleDocumentAiService.cs` | 🟡 adapter exists; result-callback loop unverified | Wire to accounting-posting pipeline |
| Vertex AI / Gemini | `AiService.Infrastructure/DependencyInjection.cs` refs | 🟡 DI only; no callable handlers | Build RAG handlers |
| Sarvam AI (Indian languages) | referenced in AI DI | 🟡 DI only | Phase 7 candidate |
| MSG91 (SMS) | referenced in NotificationService DI | 🟡 DI only | Build SendSms handler + retry |
| SendGrid (email) | referenced in NotificationService DI | 🟡 DI only | Build SendEmail handler + templates |
| Razorpay (payments) | in SubscriptionService | 🟡 webhook HMAC fixed (SEC-001, NEW-001); full plan lifecycle unbuilt | Phase 6 subscription slice |
| Partner Banks | not present | ❌ | Adapter pattern per decision 8 — build registry + 2 reference adapters |
| GSTN APIs (GSTR-1/3B/2A/2B) | not present | ❌ | Build in GstService.Infrastructure; mock adapter first |
| IT Portal | not present | ❌ | Manual filing for MVP (per plan G7.2); admin UI to upload ITR-V |
| E-Invoicing (IRP) | not present | ❌ | Phase 6 GST slice |
| E-Way Bill | not present | ❌ | Phase 6 GST slice |
| WhatsApp | feature-flagged off per decision 8 | — | Phase 7 |
| SignalR (Chat/Notifications) | DI ref only | 🟡 | Build hub in ChatService + NotificationService |
| Hangfire | Auth service enabled | 🟡 | Reminder jobs + recurring compliance checks |

---

## 8. Proposed Phase 6 Decomposition

6 sub-phases, each a self-contained scope. Sub-phases **6A** and **6E** must
land first because they unblock the rest.

### Phase 6A — OCR → Accounting Pipeline (P0, 2 weeks)
- db-engineer: add any accounting-posting audit tables if needed (additive).
- backend-agent: AccountingService full build (ledger, trial balance, P&L, balance sheet, cash flow, tax liability). DocumentService OCR-callback handler → AccountingService posting. Remove GST/Document TODO stubs.
- frontend-dev: wire `GstReturnReviewPage`.
- mobile-dev: `CameraScreen` upload + optimistic-queue; `FinancialReportsListScreen` API.
- qa-web + qa-mobile + security-reviewer: regression + new tests.
- **Exit:** user takes photo → appears on mobile dashboard within 10s (async) or with "Processing..." state; admin sees doc in queue; after admin review, dashboard numbers update.

### Phase 6B — GST Completion (P0, 2 weeks, depends on 6A)
- db-engineer: invoice-level GSTR-1 tables if not already present.
- backend-agent: GST stub endpoints → handlers (list returns, invoices CRUD, notices, e-invoice, e-way bill). Deadline-reminder Hangfire jobs.
- ui-ux-agent: GST callback + notice tracker screens design.
- frontend-dev: admin GST enhancements (notice tracker, callback queue).
- mobile-dev: GST notice inbox, nil-return flow.
- **Exit:** end-to-end GSTR-3B + GSTR-1 flow; notice uploaded → CA visible; deadline notifications fire.

### Phase 6C — Loan Hub (P0, 3 weeks, depends on 6A + 6B)
- db-engineer: consent + application status audit tables; partner-bank registry.
- backend-agent: LoanService full build; ReportService PDF generation (P&L, BS, package merge with watermark); bank-adapter interface + 2 reference adapters.
- ui-ux-agent: Loan consent, eligibility, application, package-preview screens.
- frontend-dev: admin `LoansPage` full build.
- mobile-dev: LoanHub / Eligibility / Consent / Package / Status screens wired.
- **Exit:** user applies for loan, consent recorded, PDF package generated, status updates reflected.

### Phase 6D — ITR Engine (P0, 3 weeks, depends on 6A)
- db-engineer: tax-slab versioning tables (decision: slabs change annually; config-driven).
- backend-agent: ItrService full build — profile wizard, doc checklist, tax computation engine (old + new regime), regime comparison, e-verification, refund tracker, notice handler.
- ui-ux-agent: ITR wizard + regime comparison + summary screens.
- frontend-dev: admin ITR panel (verification queue, CA tax-comp panel, filing queue, notice tracker).
- mobile-dev: 6 missing ITR screens.
- **Exit:** employee uploads Form 16 → verification → CA computes → user approves → filed → e-verified → refund tracked.

### Phase 6E — Notifications + Callbacks (P0, 2 weeks, runs parallel to 6B)
- db-engineer: **callbacks schema (new service)** and notification-preferences tables.
- backend-agent: CallbackService or CallbackModule-in-Notification; NotificationService full build — 26 events × 3 channels dispatcher; MSG91 + SendGrid + FCM adapters + templates; Hangfire deadline jobs.
- ui-ux-agent: admin callback-management screens.
- frontend-dev: Admin Callback Management page; in-app Notification Center enhancements.
- mobile-dev: "Request Callback" CTA across GST/ITR; push-notification routing.
- qa + security review.
- **Exit:** deadline reminder fires across push/SMS/email; user taps "Request Callback" → admin sees it; status flows end-to-end.

### Phase 6F — Admin Polish + Chat + Reports + Subscription + UX Pass (P1, 3 weeks, parallelizable)
- ui-ux-agent: design-system refresh (toast, skeleton, empty-state, role-based shell, dark-mode, command palette).
- backend-agent: ChatService (SignalR hub + routing), ReportService PDF endpoints, SubscriptionService full lifecycle.
- frontend-dev: kill all `StubPage` usages; wire all 8 Settings sections to config API; build `ChatPage`, `ReportsPage`, `SubscriptionsPage`, `TeamPage`; implement role-based nav; introduce toast + skeleton + error boundary; dark-mode toggle.
- mobile-dev: ChatDetailScreen, Appointment Booking, Celebration screens, offline-queue, haptics.
- qa-web/qa-mobile: full regression + a11y audit + Lighthouse (admin) + Detox flows (mobile).
- **Exit:** no stub page remains; admin experience is cohesive; mobile feels "Apple-quality".

### Phase 6G — (optional, gate on pilot feedback) AI copilot + E-invoicing/EWB + WhatsApp + Sarvam
Drop to Phase 7 unless a flagship customer demands.

---

## 9. Risks & Assumptions

1. **Phase 5 approval is a hard precondition.** Orchestrator must not start Phase 6 until team lead marks Phase 5 approved.
2. **GSTN API access** is the single most-likely schedule risk — sandbox onboarding can take weeks. Start application now; build with mock adapter.
3. **Tax slabs change annually.** ItrService must be fully config-driven and versioned by AY (plan L: AY = FY+1). Don't hard-code.
4. **GST rates change via notification.** Already noted in `CLAUDE.md` — must be admin-configurable.
5. **DPDP Act compliance** — right-to-erasure cascade already in place (SEC-008). New services must honor the same cascade (callbacks, notices, loan applications).
6. **PDF package signing/watermarking** — legal: if we claim "CA certified", we need a real CA e-signature. Fallback: "Prepared by SnapAccount, not a CA certification" disclaimer until CA workflow is integrated.
7. **Partner-bank contracts.** Per decision 8, adapter pattern is chosen — but real bank integration needs commercial deals. Build with fake-adapter + email-based submission fallback for pilot.
8. **Hangfire vs Cloud Run** — Hangfire requires a long-running process; Cloud Run scales to zero. Decide: dedicated Cloud Run min-instances=1 service, or switch to Cloud Scheduler + Pub/Sub for recurring jobs. Raise with devops-engineer before 6E.
9. **Offline-first mobile** changes data-shape — design contract with backend for idempotency keys.
10. **SignalR on Cloud Run** needs sticky sessions; confirm with devops.

---

## 10. Handoff Instructions to Orchestrator

> Orchestrator, once team lead approves this document **and** Phase 5, execute
> the following in order:

1. Update `.claude/orchestrator/status.md`: Phase 5 → APPROVED, Phase 6 → IN PROGRESS (sub-phase 6A).
2. Create scope docs under `.claude/orchestrator/` using this template per sub-phase:
   `phase-6A-scope.md`, `phase-6B-scope.md`, … `phase-6F-scope.md`. Copy the
   relevant sub-phase section from this file and extend with exit criteria,
   owner-agent list, and dependencies.
3. Kickoff order:
   - Sub-phase **6A** (OCR → Accounting) + **6E** (Notifications + Callbacks) in parallel.
   - Upon 6A completion: **6B** (GST), **6C** (Loan), **6D** (ITR) in parallel.
   - Upon 6B/6C/6D completion: **6F** (admin polish + Chat/Reports/Subscription + UX).
4. For each sub-phase, follow the standard phase loop:
   `orchestrator → db-engineer (additive migrations) → backend-agent (handlers) → ui-ux-agent (designs) → frontend-dev + mobile-dev (parallel) → qa-web + qa-mobile + security-reviewer (parallel) → orchestrator approval gate`.
5. Do not let any agent edit files outside its ownership boundary (see
   `CLAUDE.md`).
6. Enforce visual QA: agents must submit screenshots for each new UI surface.
7. After each sub-phase completes, update `status.md`, `bug-log.md`, and the
   orchestrator-phase-state memory file.

**Do NOT start Phase 6 work before explicit team-lead approval in chat.**

---

## 11. Evidence Index (for reviewers)

- Endpoint inventory: `backend/Services/*/*.Api/Endpoints/*.cs` (11 files)
- Handler inventory: `backend/Services/*/*.Application/**/*.cs`
- Stub markers: `grep -r "Not yet implemented\|TODO" backend/Services/*/*.Api/Endpoints/`
- Admin routes: `src/admin/src/router.tsx`
- Admin page inventory: `src/admin/src/pages/**/*.tsx` (16 pages)
- Mobile screen inventory: `mobile/src/screens/**/*.tsx` (25 screens)
- Plan source: `/tmp/snapaccount_plan.txt` (converted from `SnapAccount_Complete_Project_Plan (1) (1).docx`)
- Baseline phase state: `.claude/orchestrator/status.md`, `bug-log.md`, `project-brief.md`

---

*End of gap analysis. Awaiting team-lead approval to hand off to orchestrator.*
