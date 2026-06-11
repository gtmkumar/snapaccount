# Wave 6 Triage — Deferred Medium/Low Tail (2026-06-11)

> Triage analyst report. Branch `2026-06-10-s5t4`, HEAD `eef479f`. Every verdict below is code-verified (grep/file/endpoint evidence), not report-trusted. Scope: the §D roll-up Medium/Low items from `gap-analysis-2026-06-11-delta.md` excluding items already closed on the task board.

**Verdict counts:** CLOSED 9 · PARTIAL 14 · OPEN-delegable 26 · TL-blocked 2 · DECISION-gated 3 (total 54)

---

## A. Verdict table — Medium items

| Item | Verdict | Evidence (current code state) | Owner | Effort |
|---|---|---|---|---|
| GAP-008 (SEC-056 remainder) | **CLOSED** | All 13 ghost settings routes wired with RBAC: `AuthService.Api/Endpoints/Settings.cs` (header: "SEC-056: implements the previously ghost routes"), `PlatformAdmin.cs:53` PATCH org settings, `AiConfigEndpoints.cs:45,113`; handlers `UpdateOrgSettingsCommand`, `SetFeatureFlagCommand`, `UpdatePlatformConfigCommand` exist. QA-verified in `.claude/qa/web-report.md` Task #23 ("WIRED — fully implemented as of 75c0e69") + `.claude/qa/sec-056-status-2026-06-11.md` | — | — |
| GAP-013 doc SLA tracking | **PARTIAL** | Frontend-only: `DocumentQueuePage.tsx:21-26` `SlaChip` computes 24h SLA client-side. No SLA/overdue fields in DocumentService backend (grep `sla|overdue` in `backend/Services/DocumentService` → only ReceiptFieldParser/StorageService noise); no per-category SLA config, no breach notification event, no server-side queue sort | backend-agent (+frontend wire) | M |
| GAP-014 OCR feedback loop | **PARTIAL** | `DocumentService.Domain/Entities/OcrFeedback.cs` + `DbSet<OcrFeedback>` in `DocumentDbContext.cs:34` exist, but **nothing writes it** — no endpoint in `Documents.cs`, no Application command references `OcrFeedbacks` (grep: only the interface/DbContext). Review-save deltas not captured; no accuracy report query | backend-agent (+frontend send deltas) | S |
| GAP-015 Document Vault | **PARTIAL** | Done: `POST /{id}/archive` (`Documents.cs:73`), `POST /{id}/share` (`Documents.cs:50`), `DocumentShare`/`DocumentTag` entities + `DocumentSharedEvent` exist. Remaining: no tag CRUD route (no `tag` route in `Documents.cs`), tag/vault UI absent, search-by-amount/vendor unverified | backend-agent (tag routes) + mobile-dev (vault UI, later) | S+M |
| GAP-022 GST 2.0 / Tax Rate Config UI | **PARTIAL** | IMS-awareness half CLOSED (Wave 4/5: migrations 074, 8 IMS endpoints, `ImsInboxPage`/`Gstr1aPage` — live-verified in `live-web-wave5-2026-06-11.md` re-verification 8/8 PASS). Remaining: **no Tax Rate Config admin page** (grep `taxrate|tax-rate` in `src/admin/src/pages` → only ImsInboxPage noise) and **no tax-rate config endpoints** in `GstService.Api/Endpoints` (grep `tax-rates|TaxRate` → none) | backend-agent (endpoints) → frontend-dev (page) | M |
| GAP-023 TDS module | **OPEN-delegable** (deliberately deferred) | No deductor-side TDS anywhere: grep `TdsReturn|Form26Q|"26Q"` in backend source → 0 hits. Was explicitly scoped post-Phase-7 | orchestrator (Phase-8 scoping doc first), backend-agent (build later) | L |
| GAP-024 platform-wide audit trail | **PARTIAL** (merged w/ GAP-100) | Statutory accounting half CLOSED: MCA edit-log shipped (migration 071 append-only + trigger immutability, auditor endpoints, `EditLogPage.tsx` — live PASS in wave5 QA). Remaining: no cross-service audit contract — grep `shared.audit_log|AuditEventPublisher|PlatformAuditEvent` → 0 hits; AuthService `AuditLogEntry` still the only generic trail | backend-agent + db-engineer (design w/ GAP-100 contract) | L |
| GAP-025 security ops cadence | **OPEN-delegable** | `docs/security/` has no `vapt-plan.md`; `docs/devops/` has no `incident-response-runbook.md` (full dir listings checked). CERT-In 6h / DPB 72h runbook and 180-day log-retention statement absent | security-reviewer (vapt-plan) + devops-engineer (runbook, retention) | M |
| GAP-031 expert video-call booking | **OPEN-delegable** | grep `Appointment` in `backend/Services/ChatService` source → 0 hits. No booking entities/screens | ui-ux-agent (spec) → backend-agent → mobile-dev/frontend-dev | L |
| GAP-032 Tally XML export | **OPEN-delegable** | grep `tally` in backend source (bin/obj excluded) → 0 hits | backend-agent (+frontend export button later) | M |
| GAP-033 WhatsApp adapter | **OPEN-delegable** | `NotificationService.Infrastructure/Adapters/` contains only `FcmPushAdapter.cs`, `Msg91SmsAdapter.cs`, `SendGridEmailAdapter.cs`. WHATSAPP channel exists in schema/config (`GET/PATCH /auth/config/whatsapp` wired per SEC-056) but no adapter class | backend-agent | M |
| GAP-035 mobile billing screen | **PARTIAL** (mostly closed) | `mobile/src/screens/profile/BillingScreen.tsx` exists, wired to `GET /subscriptions/me` + `listInvoices` via `mobile/src/api/subscriptions.ts`. Remaining: upgrade CTA → Razorpay checkout absent (file header notes backend "mid-fix"); gated on GAP-034 remainder + live Razorpay creds (TL) | mobile-dev (after TL Razorpay) | S |
| GAP-036 subscriber list + invoice pages | **OPEN-delegable** | `src/admin/src/pages/subscriptions/` contains only `SubscriptionsPage.tsx`; no invoice/subscriber identifiers in it (grep → 0). Screens 92/94 absent; `subscriptionApi.listInvoices` still unused in admin | frontend-dev | M |
| GAP-037 notification template manager | **OPEN-delegable** | No template CRUD page (grep `template` in admin pages → only NotificationSettings/LanguageSettings sections); `NotificationTemplateConfiguration.cs` entity exists backend-side but no admin editor/endpoint surface | backend-agent (CRUD endpoints) → frontend-dev (editor) | M |
| GAP-038 HSN/SAC manager + dataset | **PARTIAL** | Load runbook exists: `docs/devops/hsn-sac-dataset-load-runbook.md` (D3). Remaining: no standalone admin page (grep `hsn` in pages → only `GstReturnReviewPage` typeahead; typeahead now HAS keyboard nav — `HsnSacTypeahead.tsx:119 onKeyDown`); dataset load never executed (ops) | frontend-dev (page) + devops-engineer (load execution) | S+S |
| GAP-041 StubLoanPdfGenerator | **PARTIAL** | Fonts half CLOSED: ci.yml Job 7 "ReportService font verification + QuestPDF smoke test (NEW-D17)" at line 645 checks `/app/fonts/` in image. Remaining: stub still registered unconditionally — `LoanService.Infrastructure/DependencyInjection.cs:109` `AddScoped<ILoanPdfGenerator, StubLoanPdfGenerator>()` with no env guard/throw | backend-agent | S |
| GAP-042 ITR refund mock + reminders | **PARTIAL** | Reminder matrix CLOSED: `infra/pubsub-scheduler-recurring-jobs.sh` covers itr-deadline-reminders (Day 1/7/15/25/29 e-verify, backend-gated), itr-refund-polling, gst-pre-deadline-callback, itr-form16-missing. Remaining: `ItrRefundPollingHandler.cs:51` still "MVP: mock progression — advance status by one step every poll" (`SimulatePoll`); manual-ops doc absent; real integration gated on ERI decision (GAP-074) | backend-agent (flag + ops doc); real API DECISION-gated | S |
| GAP-045 multi-org switching | **OPEN-delegable** | `POST /auth/token/refresh-context` exists (`mobile/src/api/auth.ts:186`) but reflects "current org membership" only; **no org-switcher UI** (grep `orgswitch|switchorg|SwitchOrganization` in mobile/src → 0; no org-list call in `auth.ts`) | qa-mobile (verify flow first) → mobile-dev + backend-agent (org-select param on refresh-context) | M |
| GAP-047 old-device confirmation | **OPEN-delegable** | grep `DeviceApproval|ApproveDevice|new.device` in AuthService → only `GetUserDevicesQuery`/`User.AddDevice` (max-2 enforcement). No push-approval flow | backend-agent + mobile-dev | M |
| GAP-051 admin auth localStorage | **OPEN-delegable** | `src/admin/src/lib/authToken.ts:3-9` — `sa_admin_token` still in `localStorage`, no refresh rotation | frontend-dev (+backend reuse of mobile refresh endpoint) | M |
| GAP-052 System Health widget | **OPEN-delegable** (mitigated) | `DashboardPage.tsx:749` still hardcodes `value: '142ms'` etc.; now flagged with sample-data badge (`DashboardPage.tsx:55-59`, STATIC-DATA-DEBT-7) so it's no longer presented as real. Wire to monitoring proxy or remove | frontend-dev + devops-engineer (proxy endpoint) | S |
| GAP-054 (UI) permission catalog | **CLOSED** | `PermissionCatalogPage.tsx`: `isActive` persisted via `updatePermission(perm.id, { isActive })` mutation (:474), Active/Inactive/All filter (:125-126), `roleCount` from API (:542,554,982). Backend B12 enforced in resolver (Wave 2). QA web-report Task #23/Task 3 added 5 filter-behavior tests, 938/938 green | — | — |
| GAP-062 mobile a11y/QA fixlist | **PARTIAL** | Big strides: Wave 3 a11y spec + SR-accessible KFS/consent gates (regulatory blockers fixed); Wave 5 S0–S7 design elevation, dark-mode all screens, `DarkModeMigration.test.tsx`, mobile lint/type 0/0. Residual unverified: CelebrationOverlay server fire-guard/double-dismiss (P6-QA-MOBILE-10/-11 — `CelebrationOverlay.tsx` has plain 6s auto-dismiss at :129, no guard found), loan sort-chip/back-button touch targets, "NaN documents" bug | mobile-dev (fix) + qa-mobile (re-verify) | S |
| GAP-064 device integrity attestation | **OPEN-delegable** | grep `playintegrity|appattest|DeviceIntegrity` across backend/mobile incl. package.json → 0 hits | mobile-dev + backend-agent | M |
| GAP-071 CI migration-replay/smoke | **CLOSED** (execution TL-gated) | `ci.yml`: `migration-replay` job (line 254, "GAP-071 / D4") on fresh postgres:17+pgvector incl. 999 seed; `aspire-healthz-smoke` (line 417, needs migration-replay). Jobs cannot RUN until GAP-002 billing (TL-1) — code-side done | — (TL-1 note) | — |
| GAP-072 dev seed drift | **OPEN-delegable** | CI applies `database/dev-seed/200_dev_business_data.sql` best-effort with explicit warning "Dev seed failed — GAP-072 (column drift). Fix in db-engineer scope" (`ci.yml:340`). Drift itself not reconciled | db-engineer | S |
| GAP-080 E2E suites | **OPEN-delegable** | `tests/` contains only `unit/` + `integration/`; no `tests/e2e/`, no `mobile/e2e/`, no playwright/maestro config anywhere (find → 0) | qa-web (Playwright, tests/e2e) + qa-mobile (Maestro, mobile/e2e) | L |
| GAP-081 coverage holes | **PARTIAL** | Unit closed: `tests/unit/DocumentService/` (DocumentReviewCommandTests, DashboardStats — 36 tests green per wave5 QA), AiService 95, ReportService 16, all 1,418 green. Remaining: `tests/integration/` has NO DocumentService/ReportService/AiService projects (dir listing); InternalsVisibleTo combined-run issue unre-verified | qa-web | M |
| GAP-082 device/release verification | **TL-blocked** | Requires EAS build + physical hardware; EAS pipeline is GAP-006 (open High) which is gated on TL-2 Firebase key rotation/creds. Nothing verifiable in-repo | team-lead (TL-2/GAP-006) → then qa-mobile + mobile-dev | M |
| NEW-D10 KFS locale rules | **PARTIAL** | Docs half CLOSED: `docs/api/endpoints.md` has section "KFS Locale Resolution (NEW-D10)" (caller param → user pref → org default → en). Remaining: mobile `getKfs()`/`generateKfs()` (`mobile/src/api/loans.ts:500,514`) still pass no explicit locale (only `consentLocale` on consent calls) — relies on server fallback | mobile-dev | S |
| NEW-W2-002 KFS gate tests | **CLOSED** | `mobile/__tests__/screens/KfsScreenReaderGate.test.tsx` — header "Closes X-5 / NEW-W2-002", asserts ack gate satisfiable with screen reader without visual scroll | — | — |
| NEW-W2-003 DPDP coverage | **CLOSED** | `tests/unit/AuthService/DpdpPrivacyCoverageTests.cs` +21 tests; coverage ~58%→~84% (>80% target), AuthService 663/663 — `.claude/qa/web-report.md` Task #23/Task 1 | — | — |
| NEW-W2-004 Razorpay runbook | **CLOSED** | `docs/devops/subscription-razorpay-setup.md` exists (header cites W2-004); `SubscriptionService.Infrastructure/DependencyInjection.cs:56-64` documents Mock-default + lazy production registration via UpdateRazorpayConfig / startup config row | — | — |
| NEW-W2-007 DPO contact | **TL-blocked** | `mobile/src/config/privacyContact.ts` — explicit `TODO(TL-10)` placeholder with `isPlaceholder` flag driving "appointment pending" UI; server `GET /auth/config/privacy-contact` live (wave5 QA 4d PASS, returns "[DPO appointment pending — see TL-10]"). Pure TL-10 dependency; code path complete | team-lead (TL-10) → mobile-dev flips values | XS |
| GAP-105 UPI payment collection | **DECISION-gated** | Presumes receivables/invoices to reconcile against → blocked on GAP-104 invoicing decision (delta: "High if GAP-104a"). No payment-link code exists | team-lead (GAP-104) | — |
| GAP-106 PCI-DSS scope statement | **OPEN-delegable** | `docs/security/` listing has no `pci-scope.md` | security-reviewer (+CI grep guard via devops later) | S |
| GAP-107 data-residency map | **OPEN-delegable** | `docs/devops/` listing has no `data-residency-map.md` | devops-engineer + security-reviewer (review) | M |
| GAP-108 GST notice automation depth | **OPEN-delegable** | `GstNotice.cs:21` only mentions types in a comment; no DRC-01B/01C deadline engine, no preventive mismatch simulator (grep `simulat` in GstService → only IMS deemed-acceptance), no GSTAT tracking. AI reply-draft is AiService P7c (separate) | backend-agent (taxonomy+deadline engine first) → frontend-dev | L |
| GAP-110 loan fraud/mule controls | **OPEN-delegable** | grep `mule|fraud|velocity|PennyDrop` in LoanService → only `DisbursementWebhookHandler.cs` incidental. No pre-submission fraud stage | backend-agent + security-reviewer (review) | M |

## B. Verdict table — Low items

| Item | Verdict | Evidence | Owner | Effort |
|---|---|---|---|---|
| GAP-039 loan offers/comparison | **DECISION-gated** | No `LoanOffer` endpoints (grep LoanService Api → 0; `/loans/products` is the catalog, not offers). Original gap: "needs ≥2 live bank integrations to matter" → gated on GAP-073 partner-bank pilots (TL paperwork) | team-lead (bank pilots) → backend+mobile | M |
| GAP-043 chat export PDF + bookmarks | **OPEN-delegable** | grep `bookmark` in ChatService/admin/mobile → 0 hits | backend-agent + mobile-dev | M |
| GAP-044 comparative analysis | **OPEN-delegable** | grep `YearOverYear|MonthOverMonth|comparative` in Accounting/ReportService → 0. SQL half is delegable now; forecasting half gated on AI P7b/c | backend-agent (SQL) + mobile-dev (charts) | M |
| GAP-046 AA framework evaluation | **OPEN-delegable** | grep `account aggregator|sahamati|OCEN` in docs/.claude → no evaluation doc (only unrelated design files matched on substring) | orchestrator (single eval doc, fold in GAP-111) | S |
| GAP-053 callback role-narrowing | **OPEN-delegable** | `TODO Phase 6F: role-gate` still present: `Sidebar.tsx:136`, `CallbackDetailPage.tsx:5`, `CallbackKpiPage.tsx:5`, `CallbackListPage.tsx:5` | frontend-dev | S |
| GAP-055 misc admin UX debt | **PARTIAL** | Done since filed: HsnSacTypeahead keyboard nav (`onKeyDown` at :119); Dashboard mock comment replaced by explicit sample-data badge system; Pending-Invites bug was NEW-D16 (Wave 3 High, dispatched). Remaining: `NoticeDetailPage.tsx` still has no `maxLength` (grep → 0), PlanDialog reset-on-reopen unverified (no PlanDialog component found at expected path), Menu Management drag-reorder pending | frontend-dev | S |
| GAP-065 invite deep-link + resend | **PARTIAL** | Backend half CLOSED: `ResendInvitationCommand.cs:50-52` mints a fresh 32-byte token + new hash; `POST /auth/team/invites/{id}/resend` route exists (`Invitations.cs:45`). Remaining: mobile pending-token persistence through the auth flow not found (`AcceptInviteScreen.tsx` has no token storage; `RootNavigator.tsx` declares `invite/:token` pattern both auth states but logged-out tap → token survives auth? unproven) | mobile-dev (+qa-mobile verify) | S |
| GAP-074 ERI roadmap | **OPEN-delegable** | No ERI decision doc in docs/ (grep → 0). Refund mock (GAP-042) waits on this | orchestrator (decision doc) | S |
| GAP-093 AGENTS.md inconsistencies | **OPEN-delegable** | `AGENTS.md:7` still "11 microservices"; `:15,23,26,83-85` pnpm commands; `:134` Azure/DefaultAzureCredential. Repo is 12 services / npm / GCP | orchestrator (root doc) | S |
| NEW-D12 GcpStartup silent skip | **OPEN-delegable** | `CallbackService.Api/Program.cs:61` — `if (GcpStartup.IsEnabled(...))` with no else-branch warning; `GcpStartup.cs` has no logging (grep `Log|warn` → 0) | backend-agent | XS |
| NEW-D15 permissions claim doc | **CLOSED** | `docs/api/endpoints.md` "Session-JWT Claim Structure (NEW-D15)" section: full claim table + explicit decision "**No `permissions` claim.** Clients must call GET /auth/me/permissions... keeps token size minimal and permission checks server-authoritative" | — | — |
| NEW-W2-005 KFS console.warn | **CLOSED** | `mobile/src/screens/loans/KeyFactsStatementScreen.tsx:154` — "NEW-W2-005: structured logging instead of bare console.warn" | — | — |
| NEW-W2-006 PermissionCatalog inactive UI | **CLOSED** | QA web-report Task #23/Task 3: intentional filter-not-disable behavior verified, 5 new tests in `PermissionCatalogPage.test.tsx` (`describe('NEW-W2-006 ...')`), all green | — | — |
| GAP-109 e-invoice ops specifics | **DECISION-gated** | Per the gap itself: "Low (Medium once invoicing ships)" — fully downstream of GAP-104 invoicing decision; B2C pilot is a watch item | team-lead (GAP-104) → orchestrator watch | — |
| GAP-111 OCEN/GST Sahay evaluation | **OPEN-delegable** | No doc (see GAP-046 grep). Strategy doc only | orchestrator (fold into GAP-046 eval doc) | S |

---

## C. Recommended Wave 6 dispatch (parallel batches, one owner per tree)

All batches are file-ownership-disjoint and can run in parallel, **except** the qa batches share repo trees with dev batches at directory-level (`src/admin/src/__tests__` vs `src/admin/src`; `mobile/e2e` vs `mobile/src`) — schedule QA batches to start after their sibling dev batch reports done, or in a follow-up slot.

**Batch B — backend-agent (backend/):** quick-win bundle + one feature
1. GAP-014 OCR feedback write-path: persist corrections on approve/review-save into `OcrFeedbacks` + accuracy query endpoint (S)
2. GAP-041 guard/remove `StubLoanPdfGenerator` DI registration — throw in non-Development (S)
3. GAP-013 backend SLA: per-category SLA config + computed `overdue` on admin queue endpoint + breach event (S/M)
4. GAP-015 tag CRUD route for existing `DocumentTag` entity (S)
5. NEW-D12 warning log when `GcpStartup.IsEnabled()` is false (XS)
6. GAP-022 tax-rate config endpoints (effective-dated versions over `gst.tax_rates`) — contract handoff to frontend (M)
7. GAP-033 `WhatsAppBusinessAdapter` (Cloud API, flag off by default — config routes already wired) (M)

**Batch F — frontend-dev (src/admin/):**
1. GAP-053 apply role-gating matrix to Callback pages/Sidebar, remove the 4 TODOs (S)
2. GAP-055 remainder: NoticeDetailPage `maxLength`, PlanDialog reset, menu drag-reorder (S)
3. GAP-036 Subscriber List + Invoice Management pages (APIs exist: `subscriptionApi.listInvoices`) (M)
4. GAP-052 remove or wire System Health fabricated values (keep sample-badge until devops proxy exists) (S)
5. Carry-over: BUG-DASH-KB-004 dashboard tab arrow-key nav (wave 5 open bug) (S)
6. GAP-022 Tax Rate Config page (starts when Batch B item 6 contract lands) (M)

**Batch M — mobile-dev (mobile/src/):**
1. NEW-D10 pass explicit `locale` on KFS generate/get (S)
2. GAP-065 persist pending invite token through auth flow + auto-resume (S)
3. GAP-062 residual: CelebrationOverlay server fire-guard + auto-dismiss double-callback, touch-target audit (S)
4. GAP-045 org-switcher: org-list + switch UI over `refresh-context` (backend param via handoff if needed) (M)

**Batch D — devops-engineer (docs/devops/, infra/, .github/):**
1. GAP-107 `docs/devops/data-residency-map.md` + org-policy plan (M)
2. GAP-025 (half) `docs/devops/incident-response-runbook.md` (CERT-In 6h / DPB 72h) + 180-day log-retention config statement (M)
3. GAP-038 (half) stage HSN/SAC dataset load per existing runbook (prod execution TL-gated) (S)

**Batch S — security-reviewer (docs/security/):**
1. GAP-106 `docs/security/pci-scope.md` (SAQ A boundary + guardrails) (S)
2. GAP-025 (half) `docs/security/vapt-plan.md` (RBI 6-monthly cadence) (S)

**Batch DB — db-engineer (database/):**
1. GAP-072 reconcile `database/dev-seed/200_dev_business_data.sql` with current schema so the CI best-effort step stops warning (S)

**Batch QW — qa-web (tests/) — start after Batch B:**
1. GAP-081 integration projects for DocumentService (upload/status/signed-URL), ReportService, AiService + InternalsVisibleTo re-verify (M)
2. GAP-080 Playwright suite, top 6 admin journeys in `tests/e2e/` (L — can span waves; CI wiring blocked on TL-1)

**Batch QM — qa-mobile (mobile/__tests__, mobile/e2e) — start after Batch M:**
1. GAP-080 Maestro suite, top 4 mobile journeys in `mobile/e2e/` (L)
2. GAP-062 re-verify pass + GAP-045/065 flow verification (S)

**Orchestrator self-tasks:** GAP-046+111+074 single Phase-8 rails/integration evaluation doc (AA + OCEN/Sahay + ERI); GAP-093 AGENTS.md reconciliation; GAP-023 TDS Phase-8 scoping note.

**Deferred to Wave 7+ (delegable but lower yield now):** GAP-031 (appointments, L — needs ui-ux spec first), GAP-032 (Tally — can swap into Batch B if WhatsApp slips), GAP-037 (template manager), GAP-043, GAP-044, GAP-047, GAP-051 (admin auth rework — coordinate frontend+backend in one wave), GAP-064, GAP-108, GAP-110, GAP-024 remainder (design with GAP-100 contract).

**TL queue additions (no agent action possible):** W2-007/TL-10 DPO appointment; GAP-082 (needs TL-2 → GAP-006 EAS + hardware); GAP-105/109/039 await GAP-104 product decision + partner-bank pilots; GAP-071 jobs idle until TL-1 CI billing.

*End of Wave 6 triage.*
