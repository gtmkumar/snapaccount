# SnapAccount — Remediation Plan & Subagent Goals (2026-06-28)

Companion to **`gap-analysis-2026-06-28-doc-vs-impl.md`** (the verified gap inventory, IDs `DG-*`). This plan sequences the 104 verified gaps into 4 waves and assigns concrete goals per subagent. Work each wave to completion + verification before starting the next; within a wave, agents run in parallel.

## Execution progress

- **Wave 1 — ✅ COMPLETE & verified (2026-06-28).** 14/14 gaps done (DG-SEC-01/02/03, DG-SUB-01/02, DG-NOTIF-01/02, DG-GST-01, DG-ITR-01, DG-LOAN-01, DG-DASH-01, DG-INFRA-01/02/03). Full backend graph builds 0 errors; migrations 092 (org PAN widen+encrypt), 093 (document DPDP erasure cols), 094 (accounting dashboard permission) applied to local DB; affected-service tests green (fixed 2 stale tests post-wave: DocumentService handler-ctor logger arg, NotificationService catalog count 29→31).
- **Wave 2 — ✅ COMPLETE & verified (2026-06-28).** 30/30 gaps done. Migrations 095 (doc delete perm), 096 (gst_return_audit), 097 (itr filing draft + ca_notes + user_id + CHECK realign), 098 (ai pgvector + chat/appointment notifications) applied. Verified: full backend build 0 errors + all 12 service test projects green; admin build clean; mobile type-check/lint clean + jest 780/780. Post-wave fixes: NotificationService catalog count 31→35 (DG-CHAT-03 added 4 appointment events); AiService pgvector `Embedding` test migration (2 files + UseVector); admin ITR `Record<FilingStatus>` maps completed for CA_APPROVED/CA_REJECTED/CANCELLED (+9 i18n keys); global `expo-image-picker` jest mock for DG-CHAT-04. Bonus: DG-ITR-08 landed early.
- **Wave 3 — ✅ COMPLETE & verified (2026-06-28), 33/35 done + 2 partial folded into Wave 4.** Migrations 099–105 applied (notif seed reconcile, subscription invoice/refund/void, gst late-fee + org profile, loan consent-revoke + KFS fields, itr computation versions, chat CA summary note). Verified: backend full build + all 12 service tests green; admin build clean; mobile type-check/lint + jest 92 suites/846 tests. Post-wave fixes: migration 100 permission seed (added NOT NULL resource/action); backend test ctor updates (DataExportJob +2 args, AppointmentDetailDto +CaSummaryNote); NotificationService catalog 35→38 (DG-NOTIF-06 +3 events). The mobile lane crashed on a StructuredOutput retry cap; its work had landed (verified green) except the tail — a follow-up mobile-dev agent completed DG-CHAT-06/MOBUX-03/05/07. **2 partials deferred to Wave 4:** DG-SUB-10 (MRR trend/events charts need new GET /subscriptions/mrr/history + /subscriptions/events backend endpoints) and DG-MOBUX-06 (upload-queue idempotency/EXIF — pairs with backend DG-DOC-08).
- **Wave 4 — ✅ COMPLETE & verified (2026-06-28).** 27 gaps (25 low + the 2 Wave-3 residuals DG-SUB-10 & DG-MOBUX-06). Migrations 106–109 applied (otp cooldown config, document upload idempotency key, gst HSN tax-rate, loan consent device/bank + eligibility status). Post-wave fix: migration 107 UNIQUE→non-unique index (document.document is partitioned by uploaded_at; dedup is app-level query-first in UploadDocumentCommand). Verified: backend 12/12 service test projects green; admin build + vitest 1105/1105 (reconciled 30 stale component tests — all intended-change, no real regressions); mobile type-check/lint + jest 859/859. Executor hardened with per-agent try/catch (no lane crash this wave).
- **✅ ALL 4 WAVES COMPLETE — 104/104 gaps closed & verified across backend + admin + mobile (2026-06-28).**

## Guiding principles

1. **Fix contract pairs together.** Most criticals are a frontend/mobile call with no backend (or a shape mismatch). The backend endpoint/shape change and the client wiring are ONE unit of work — land them together and add a contract test so it can't silently re-break. The audit found this is the dominant failure mode.
2. **Migrations via db-engineer, EF/handlers via backend-agent.** Any gap needing a new column/table/CHECK change (e.g. `DG-ITR-04` ca_notes, `DG-ITR-05` user_id, `DG-ITR-06` status CHECK, `DG-GST-02` audit table, `DG-SEC-02` PAN widening) = an additive `database/migrations/NNN_*.sql` from **db-engineer** first, then EF config + handler from **backend-agent**. Raw SQL migrations are authoritative.
3. **Security items get a security-reviewer read-back.** `DG-SEC-*` and the RLS/PAN/erasure changes must be reviewed by **security-reviewer** (read-only) after implementation.
4. **Verify, don't trust.** After each wave: `dotnet build` + affected service tests green; admin `npm run lint/build` + vitest; mobile `type-check`/`lint`/`jest`; then live-verify the changed contract against the running local stack (already up). Append a contract/insert-path test for every divergence fixed (the `EfSmoke` + Zod-envelope pattern already used in this repo).
5. **Do NOT touch TL-gated items** (real Razorpay/KYC/Play-Integrity credentials, key rotation, billing, bank pilots). Wire the CODE path + mock/dev fallback; leave credential activation to the team lead.
6. **File ownership** (no cross-agent edits): backend→`backend/`, frontend-dev→`src/admin/`, mobile-dev→`mobile/`, db-engineer→`database/`, devops-engineer→`infra/`,`.github/`,`Dockerfile*`, security-reviewer→read-only.

---

## Wave 1 — Critical path: money, data correctness, security, and the infra that makes wired handlers run

_Close every 🔴 critical plus the high-severity security holes (RLS, PAN, DPDP erasure) and the infra provisioning gaps that leave already-written handlers dead in prod. After this wave: payments actually reach Razorpay, dashboards/GSTR-3B/ITR-compute return correct data, notifications fan out, RLS isolates tenants, and the gateway + DPDP/recurring Pub/Sub are deployable._

**14 items.**

### → `backend-agent`  (11)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-DASH-01** | critical | DASH | Mobile Home dashboard KPIs & activity feed call non-existent backend endpoints (D1.1, D1.3) |
| **DG-GST-01** | critical | GST | GSTR-3B auto-calculation engine is orphaned — return totals never computed from invoices |
| **DG-ITR-01** | critical | ITR | ComputeTax response omits fields the admin computation panel requires (zod parse fails) |
| **DG-LOAN-01** | critical | LOAN | Admin loan-operations actions call backend routes that do not exist (disburse, approve, reject, begin-review, request-documents, consents-list, status-log, banks, bank-communications) |
| **DG-NOTIF-01** | critical | NOTIF | Most I2 module events are never dispatched through the notification fan-out pipeline |
| **DG-NOTIF-02** | critical | NOTIF | In-app message center channel is non-functional — notification.notification inbox table is never written |
| **DG-SUB-01** | critical | SUB | Live RazorpayHttpClient is never wired — non-Dev throws; UpdateRazorpayConfig only writes a DB row |
| **DG-SUB-02** | critical | SUB | No production code path calls IRazorpayClient — orders/subscriptions/plan-sync never created on Razorpay |
| **DG-SEC-01** | high | SEC | RLS read-isolation non-functional outside Auth module (GUC never set; app runs as superuser) |
| **DG-SEC-02** | high | SEC | Organization business PAN stored in plaintext (only user PAN is encrypted) |
| **DG-SEC-03** | high | SEC | Document module has no DPDP account-deletion erasure subscriber |

### → `devops-engineer`  (3)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-INFRA-01** | high | INFRA | API Gateway has no production build or deployment path |
| **DG-INFRA-02** | high | INFRA | DPDP account-deletion Pub/Sub topic and all *-account-deletion-sub subscriptions are never provisioned |
| **DG-INFRA-03** | high | INFRA | GST and ITR recurring-jobs Pub/Sub subscriptions are never provisioned (deadline-detail handlers never run in prod) |


---

## Wave 2 — High: contract reconciliation & feature completion

_Reconcile the remaining broken frontend/mobile↔backend contracts and finish half-built features (document delete/OCR-override, ITR draft/CA-notes cluster, appointment lifecycle, semantic RAG, device binding, admin theme/a11y)._

**30 items.**

### → `backend-agent`  (22)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-AUTH-02** | high | AUTH | Backend OTP-verify response omits the deviceApproval payload the mobile ENFORCE gate depends on |
| **DG-CHAT-01** | high | CHAT | RAG retrieval is not semantic — query embedding computed then discarded; chunks returned in ChunkIndex order, not by cosine similarity |
| **DG-CHAT-02** | high | CHAT | Appointment completion never triggered — Complete()/MarkNoShow() are dead; rating path unreachable |
| **DG-CHAT-03** | high | CHAT | Appointment reminders (30-min/5-min) and CA-cancellation notifications are not wired — events published but have no consumer |
| **DG-DASH-02** | high | DASH | Admin ReportsPage recent-jobs list breaks: backend returns bare array with wrong status/format casing vs frontend Zod envelope |
| **DG-DOC-01** | high | DOC | Mobile Document Detail DELETE /documents/{id} has no backend endpoint |
| **DG-DOC-02** | high | DOC | Mobile uploads send 'category' (slug) but backend reads 'categoryId' (Guid) — category dropped on every upload |
| **DG-DOC-03** | high | DOC | Manual OCR field override (C2) not persisted — no PATCH endpoint; admin Save Draft is a toast stub |
| **DG-GST-02** | high | GST | ARN-capture (PATCH) and audit-trail (GET) backend endpoints do not exist — frontend calls them and will 404 |
| **DG-GST-03** | high | GST | Deadline-approaching event has no subscriber — proactive callbacks never fire and per-user reminders are a no-op |
| **DG-INFRA-04** | high | INFRA | CallbackService recurring-jobs consumer and /callbacks/internal/* endpoints missing (KPI MV never refreshed in prod) |
| **DG-ITR-02** | high | ITR | Admin save-draft / autosave calls PATCH /itr/filings/{id} but no such endpoint exists |
| **DG-ITR-03** | high | ITR | GetFiling response omits createdAt/updatedAt (and assesseeName/panLast4) required by admin FilingSchema |
| **DG-ITR-04** | high | ITR | CA notes have no dedicated persisted field — ca_review_notes column is reused for rejection reason |
| **DG-ITR-05** | high | ITR | Filing entity never sets user_id, which is NOT NULL in itr.filings — StartFiling insert will fail |
| **DG-ITR-06** | high | ITR | Filing status enum (REJECTED_BY_CA) not allowed by itr.filings CHECK constraint |
| **DG-LOAN-02** | high | LOAN | Disbursement webhook diverges from documented contract (header name, sha256= prefix, status codes, payload field names, amount unit) |
| **DG-LOAN-03** | high | LOAN | F3 auto-generated loan package uses stub/hardcoded generator — no real org financials |
| **DG-NOTIF-03** | high | NOTIF | RecurringJobsSubscriber maps job types to event codes that do not exist in the catalog → reminders silently dropped |
| **DG-NOTIF-04** | high | NOTIF | Admin notification center calls backend endpoints and fields the backend does not implement |
| **DG-SUB-03** | high | SUB | Webhook secret source diverges — admin PATCH-stored EncryptedWebhookSecret is never read by the webhook endpoint |
| **DG-SUB-04** | high | SUB | Admin upgrade/downgrade/cancel call non-existent /subscriptions/me/* routes (404) |

### → `frontend-dev`  (3)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-ADMIN-01** | high | ADMIN | Theme preference never synced to server; Settings theme picker disconnected from live ThemeContext |
| **DG-SUB-05** | high | SUB | MRR KPI cards read wrong field names — Active/Past-due/Cancelled always render 0 |
| **DG-SUB-06** | high | SUB | PaymentGatewaySettings save is a toast stub — admin cannot persist Razorpay credentials despite the PATCH endpoint existing |

### → `mobile-dev`  (5)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-AUTH-01** | high | AUTH | Mobile never registers the device after login — device binding (B1.3) is dead end-to-end |
| **DG-CHAT-04** | high | CHAT | Chat file/image/PDF attachment sending is an inert UI placeholder (admin + mobile); backend supports it |
| **DG-DASH-03** | high | DASH | Mobile Report Detail fetches wrong endpoint (/reports/{slug}) and always shows empty state (D2) |
| **DG-MOBUX-01** | high | MOBUX | NetworkQualityChip resolves i18n keys without the 'mobile.' prefix — chip shows raw key strings |
| **DG-MOBUX-02** | high | MOBUX | No Settings/Appearance screen — theme toggle and Profile quick-toggle missing |


---

## Wave 3 — Medium: feature depth & UX completeness

_Add the documented feature depth that isn't blocking but is specified: late-fee/interest, regime deductions, invoice PDF, proration, mobile charts/PDF/celebrations/network UX, admin reports suite & shortcuts._

**35 items.**

### → `backend-agent`  (14)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-CHAT-05** | medium | CHAT | CA post-call summary notes (visible to user) are not implemented |
| **DG-GST-04** | medium | GST | Late-fee and interest calculation is entirely missing |
| **DG-GST-05** | medium | GST | E-invoice >5Cr turnover threshold is documented but not enforced in the handler |
| **DG-ITR-07** | medium | ITR | Computation-history (versioned computations) endpoint and storage missing |
| **DG-ITR-08** | medium | ITR | Income-head columns now exist in DB but remain Ignore()'d, so CA edits to income heads aren't persisted |
| **DG-ITR-09** | medium | ITR | Tax engine ignores configured new-regime deductions (e.g. 80CCD(2) employer NPS) — hardcoded to zero |
| **DG-LOAN-04** | medium | LOAN | F4.2 loan consent revocation and loan-specific consent history are missing on backend |
| **DG-LOAN-05** | medium | LOAN | GetKfs response omits structured fields the mobile KFS screen consumes (verified, signatureLast8, netDisbursal/totalFees/totalPayable, coolingOffTerms, structured grievanceOfficer); no separate acknowledge endpoint |
| **DG-NOTIF-06** | medium | NOTIF | Two divergent template seed sources with incompatible event taxonomies |
| **DG-SEC-04** | medium | SEC | DPDP data-export (right to access/portability) only includes auth-schema data and never uploads to GCS |
| **DG-SUB-07** | medium | SUB | Invoice PDF is never generated — Download PDF action permanently hidden |
| **DG-SUB-08** | medium | SUB | Proration preview / mid-cycle credit calculation not implemented |
| **DG-SUB-11** | medium | SUB | Pause/Resume and Refund/Void subscription actions not implemented |
| **DG-SUB-12** | medium | SUB | Subscriber list shows org UUID instead of org name; no GSTIN; no cross-service org-name resolution |

### → `frontend-dev`  (9)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-ADMIN-02** | medium | ADMIN | List-context keyboard shortcuts (j/k/x/a/r/f) documented in cheat-sheet but not wired to any list/DataTable |
| **DG-ADMIN-03** | medium | ADMIN | Universal cmd+/ (focus search) and cmd+s (save form) shortcuts not implemented |
| **DG-ADMIN-04** | medium | ADMIN | No focus trap in CommandPalette, KeyboardShortcutsOverlay, or Dialog modals |
| **DG-ADMIN-05** | medium | ADMIN | No skip-to-content link in the app shell |
| **DG-CHAT-07** | medium | CHAT | Admin CA-facing AI tools (AI Draft, canned/quick replies) missing; firebase-ai.ts is dead client-side Gemini bypassing the RAG backend |
| **DG-DASH-06** | medium | DASH | Admin Reports & Analytics suite (Operational, Platform Revenue, User Analytics, Compliance) not implemented (Screens 100-103) |
| **DG-DOC-04** | medium | DOC | Admin Document Queue page ignores server SLA queue endpoint; SLA + OCR-confidence filtering done client-side (confidence is a no-op) |
| **DG-SUB-09** | medium | SUB | Current-plan lookup matches Plan.planId against the subscription id (wrong field) — always falls back to Free |
| **DG-SUB-10** | medium | SUB | MRR trend chart, plan-distribution bar, and recent-events feed are placeholders/absent |

### → `mobile-dev`  (11)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-AUTH-03** | medium | AUTH | Android SMS Retriever auto-read OTP (B1.2) not implemented — auto-detected banner is dead state |
| **DG-CHAT-06** | medium | CHAT | Mobile 'Ask AI' quick-answer feature missing despite working backend /ai/chat |
| **DG-DASH-04** | medium | DASH | Mobile Home missing Sales-vs-Expense chart and period selector (D1.2) |
| **DG-DASH-05** | medium | DASH | Mobile PDF export no-ops; Report PDF Preview & Share (Screen 11) not implemented (D3.1, D3.2) |
| **DG-DOC-05** | medium | DOC | Category-selection screen (Screen 16) unreachable from capture flow; auto-classify/AI-suggestion absent on mobile |
| **DG-MOBUX-03** | medium | MOBUX | No Settings surface for Haptics, Network, or Security toggles |
| **DG-MOBUX-04** | medium | MOBUX | Celebration variants (firstGst, firstItr, firstRefund, firstNoticeResolved, planK2Step15, firstChatResolved) are never triggered |
| **DG-MOBUX-05** | medium | MOBUX | NetworkSheet and adaptive network behaviors are stubbed/missing |
| **DG-MOBUX-06** | medium | MOBUX | Document upload queue omits client idempotency key, full backoff schedule, and EXIF-strip/manifest persistence |
| **DG-MOBUX-07** | medium | MOBUX | Biometric gate lacks the 5-minute grace window and structured refusal flow |
| **DG-NOTIF-05** | medium | NOTIF | Mobile NotificationCenterScreen missing all Phase 6E enhancements |

### → `devops-engineer`  (1)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-INFRA-05** | medium | INFRA | Promotion and architecture runbooks describe the obsolete 11/12-service topology |


---

## Wave 4 — Low: polish, edge cases, observability

_Polish: edge cases, accessibility niceties, observability metrics, and small UX affordances._

**25 items.**

### → `backend-agent`  (11)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-AUTH-04** | low | AUTH | GSTIN linking in the business wizard does not verify or auto-fill name/address (B2.3) |
| **DG-AUTH-07** | low | AUTH | OTP validity/attempt limits and session-token lifetime are hardcoded, divergent from B1.1/B1.4 |
| **DG-CHAT-08** | low | CHAT | GoogleCalendarMeetingLinkProvider throws NotImplementedException when actually configured |
| **DG-DOC-07** | low | DOC | No push/SignalR for document status changes — completion relies solely on client polling |
| **DG-DOC-08** | low | DOC | Upload idempotency key not implemented (offline-first dedupe contract unmet) |
| **DG-GST-06** | low | GST | HSN-based GST rate resolution ignores asOfDate / temporal tax-rate table (not FY-versioned) |
| **DG-INFRA-06** | low | INFRA | SignalR custom observability metrics required by the SLO doc are not emitted |
| **DG-ITR-10** | low | ITR | ITR form type is caller-supplied with no auto-determination from income sources / assessee type |
| **DG-LOAN-06** | low | LOAN | Loan Consent record omits documented device-id and bank-list audit fields |
| **DG-LOAN-07** | low | LOAN | F2.2 'partially eligible' result state not implemented (boolean eligible/not-eligible only) |
| **DG-NOTIF-07** | low | NOTIF | SMS DLT gate suppresses 100% of SMS because no seeded template carries a DLT template ID and there is no per-event DLT management |

### → `frontend-dev`  (8)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-ADMIN-06** | low | ADMIN | 'g a' navigation chord points to non-existent /accounting route (404) |
| **DG-ADMIN-07** | low | ADMIN | Command palette missing cmd+Enter (open in new tab), cmd+. (copy ID), and Tab/Shift+Tab filter cycling |
| **DG-ADMIN-08** | low | ADMIN | Command palette has no polite live region announcing results count |
| **DG-ADMIN-09** | low | ADMIN | Shortcut discovery hints (first-use toast, repeated-click tip) missing; unknown-chord toast is a hardcoded English string |
| **DG-ADMIN-10** | low | ADMIN | Shared DataTable lacks the documented density="compact" variant and density toggle |
| **DG-CHAT-09** | low | CHAT | Admin Chat Analytics dashboard (Screen 83) and full Video Call calendar grid (Screen 82) not implemented |
| **DG-DASH-07** | low | DASH | Admin Financial Reports page missing comparative/currency controls, KpiStrip, PdfViewer preview, and CA/Bank Share modal (F3 spec) |
| **DG-GST-07** | low | GST | GSTR-1 review (Screen 65) sub-tabs missing — no B2C / Credit-Debit / HSN-summary / Document-Issues views |

### → `mobile-dev`  (6)

| Gap | Sev | Area | Goal |
|---|---|---|---|
| **DG-AUTH-05** | low | AUTH | GST registration-threshold note missing on the GSTIN 'not registered' path (B2.3) |
| **DG-AUTH-06** | low | AUTH | IFSC lookup with bank-name auto-detect (employee onboarding Screen 5d) not implemented |
| **DG-DOC-06** | low | DOC | OCR timeout watchdog keyed by localId but cleared by serverId — never cancelled on success (timer leak) |
| **DG-MOBUX-08** | low | MOBUX | Camera capture shutter does not fire a haptic |
| **DG-MOBUX-09** | low | MOBUX | No 'all synced / syncing N / offline waiting / failed' header queue chip |
| **DG-SEC-05** | low | SEC | Screenshot prevention (useSensitiveScreen) missing on CallbackStatusScreen |


---

## Per-agent backlog totals

| Agent | W1 | W2 | W3 | W4 | Total |
|---|--:|--:|--:|--:|--:|
| backend-agent | 11 | 22 | 14 | 11 | **58** |
| frontend-dev | · | 3 | 9 | 8 | **20** |
| mobile-dev | · | 5 | 11 | 6 | **22** |
| devops-engineer | 3 | · | 1 | · | **4** |

> `db-engineer` and `security-reviewer` show 0 *primary* items because the audit attributed migration+security work to `backend-agent`. Per principle 2 & 3, db-engineer authors the migrations these need and security-reviewer reviews the SEC items — see the per-item co-owner notes in the gap doc's suggested fixes.

## How to dispatch

Each table row = one subagent task. Recommended: dispatch Wave 1 as parallel agents (one per gap or small coherent cluster), each prompted with: the gap ID, the gap doc's evidence + suggested fix, the contract-pair partner (if any), and the acceptance criteria above. Re-verify on the live local stack (running now: gateway :6060, composites :5201-3, admin :3000) before marking done. Then proceed to Wave 2.
