# Screen-Spec vs Implementation Gap Audit — 2026-07-05

Read-only audit of `docs/design/**` feature/screen specs vs actual `src/admin` and `mobile/` code.
Every item below was verified against code (file:line). ALREADY-CLOSED specs are omitted.
Classification: **CONFIRMED-GAP** (spec'd screen/behavior absent or non-functional) / **PARTIAL** (exists, missing a spec'd sub-feature).
Disposition: **Delegable** (impl-ready for frontend-dev/mobile-dev/backend) / **TL-gated** (blocked on backend endpoint, external credential, or a scope decision).

---

## A. Cross-cutting patterns (highest-level — these recur across many screens)

These are the systemic classes worth a single coordinated pass rather than per-screen tickets:

1. **"Wired but non-functional" mobile ITR filing chain.** Several screens render but never bind computed data or persist step input, so they are dead for their stated purpose. This is the single highest-value cluster.
   - `mobile/src/screens/itr/FilingSummaryScreen.tsx:99-142` — all income/deduction/tax figures are hardcoded `'—'`.
   - `mobile/src/screens/itr/EmployeeProfileWizardScreen.tsx:113-142` — steps 2–5 (employment/deductions/investments/bank) collected locally, never PATCH'd or forwarded to compute.
   - `mobile/src/screens/itr/UserApprovalScreen.tsx:95-113` — 3 required attestation checkboxes never captured; no filing-confirmation screen.
   - `mobile/src/screens/itr/Form16UploadScreen.tsx:72-79` — OCR result simulated, fields left blank.
   - `mobile/src/screens/itr/DocChecklistScreen.tsx:176-190` — every upload misroutes to Form16Upload + optimistic no-op upload.

2. **Dead / hardcoded state flags disabling whole spec'd flows.** A boolean is `useState(false)` and never updated, so an entire designed branch is unreachable.
   - `mobile/src/screens/chat/ChatDetailScreen.tsx:374` — `isOffline` hardcoded false, no NetInfo → offline compose + queued-send + banner all unreachable.
   - `mobile/src/screens/loans/LoanHubScreen.tsx:45` — `eligibilityChecked` hardcoded false → qualified badges / qualified-first sort unreachable.
   - `src/admin/src/pages/chat/ChatInboxPage.tsx:42` — `_assignment` filter state dead (underscore-prefixed, no buttons render).
   - `src/admin/src/pages/itr/CaTaxComputationPanelPage.tsx:264` — `baseline` never populated → before/after delta pills (the panel's central surface) never render.

3. **Inert buttons / placeholders standing in for real spec'd features** (no onClick, mock handlers, "not installed" fallbacks):
   - `src/admin/src/pages/gst/NoticeDetailPage.tsx:46-68` — PDF viewer is a link stub ("react-pdf not installed").
   - `src/admin/src/pages/itr/ItrFilingDetailPage.tsx:258-261` — Reassign button no onClick.
   - `src/admin/src/pages/loans/LoanDetailPage.tsx:322-329` — verify-HMAC mocked always-ok.
   - `mobile/src/screens/loans/LoanApplicationScreen.tsx:131-151` — doc upload is a simulate-`Alert`.
   - `src/admin/src/pages/loans/PartnerBanksSettingsPage.tsx:180-207` — edit path always calls create → **duplicates a bank on every edit** (data-integrity bug).
   - `src/admin/src/pages/chat/ChatThreadDetailPage.tsx:477-482,321` — paperclip attach + Assign menu are no-ops.

4. **Duplicate / divergent implementations of the same spec.** Two UIs for one feature, one of them spec-wrong and still wired live:
   - Partner Banks: spec-correct routed page at `/settings/partner-banks` (`PartnerBanksSettingsPage.tsx`) vs a divergent UI-only placeholder `src/admin/src/pages/settings/sections/PartnerBanksSettings.tsx` still embedded in Settings (`SettingsPage.tsx:33`), offering adapter types not in the spec.

5. **Dead-link navigation to unbuilt routes.** Nav entries point at a route that does not exist:
   - No `/notifications` full-page route (`src/admin/src/router.tsx:561-573` has only template routes), yet the dropdown "View all" (`components/shared/NotificationCenter.tsx:363`), `g n` chord (`contexts/KeyboardShortcutsContext.tsx:59`), and command-palette action (`components/ui/CommandPalette.tsx:62`) all navigate to it.

6. **Two spec docs with NO corresponding file — need a build-vs-descope decision:**
   - `docs/design/screens/web-admin/auth-rbac-members.md` — no `MembersPage`, no `/settings/members` route, no `InviteMemberDialog`; capability split across `UserListPage` + `OrganizationDetailPage` members tab.
   - `docs/design/screens/mobile/gst-filing.md` Screens 19/21/23/24 — no mobile e-invoice/e-way-bill/IRN/GSTR-1-list/filing-confirmation screens (`grep einvoice|eway|IRN mobile/src/screens` → nothing). Exists admin-side; mobile omission likely by-design.

---

## B. CONFIRMED-GAP — HIGH severity

| ID | Spec source | Missing / divergent | Evidence | Disposition |
|---|---|---|---|---|
| CG-1 | mobile/itr/filing-summary-screen.md | Figures hardcoded `'—'`; no KeyMetrics/TDS/final-outcome/CA-disclaimer/share | `FilingSummaryScreen.tsx:99-142` | Delegable (mobile-dev) |
| CG-2 | mobile/itr/employee-profile-wizard.md | Steps 2–5 never persisted/computed; no occupation selector/Save&Exit | `EmployeeProfileWizardScreen.tsx:113-142` | Delegable (mobile-dev) |
| CG-3 | mobile/loans/loan-application-screen.md | No "Application details" section; upload placeholder; consent gate unenforced; `applicationId` unthreaded | `LoanApplicationScreen.tsx:131-151,203-225` | Delegable (mobile-dev) |
| CG-4 | admin/itr/ca-tax-computation-panel.md | Delta pills dead; no Tax tab/Schedules tab/slab table/RegimeMiniBar | `CaTaxComputationPanelPage.tsx:264` | Delegable (frontend-dev) |
| CG-5 | admin/itr/itr-filing-detail-page.md | No computation-history diff/Restore; no activity log; Reassign inert; CA notes read-only | `ItrFilingDetailPage.tsx:129-147,258-261` | Delegable (frontend-dev) |
| CG-6 | admin/loans/bank-communications-page.md | No Resend; no bulk select/export/retry; no bank+date filters | `BankCommunicationsPage.tsx:105-114` | Delegable (frontend-dev) |
| CG-7 | admin/loans/partner-banks-settings-page.md | Edit duplicates bank (create-only); divergent placeholder wired in Settings | `PartnerBanksSettingsPage.tsx:180-207`; `SettingsPage.tsx:33` | Delegable (frontend-dev) |
| CG-8 | admin/notifications/notification-center-enhancements.md §3 | No `/notifications` full-page route; 3 nav entries dead-link | `router.tsx:561-573`; `NotificationCenter.tsx:363`; `KeyboardShortcutsContext.tsx:59` | Delegable (frontend-dev) |

## C. CONFIRMED-GAP / PARTIAL — MEDIUM severity

| ID | Spec source | Missing / divergent | Evidence | Disposition |
|---|---|---|---|---|
| CG-9 | admin/gst/invoice-detail-tab.md | No EditableDataGrid line-item editor / Add-invoice / bulk-import; read-only table gated to GSTR-3B not GSTR-1/1A | `GstReturnReviewPage.tsx:865,1184-1264` | Delegable (frontend-dev) |
| CG-10 | admin/gst/notice-detail-page.md | PdfViewer stub; no audit-trail StatusTimeline; body plain textarea; no Reopen | `NoticeDetailPage.tsx:46-68,495-577` | Delegable (needs react-pdf) |
| CG-11 | wave7-feature-specs.md §2 | Template Active toggle no-op — `isActive` absent from request + both save payloads | `notificationTemplateApi.ts:245-250`; `TemplateListPage.tsx:238-249`; `TemplateEditorPage.tsx:213-217` | Delegable (needs backend `isActive` PUT) |
| CG-12 | admin/chat/chat-inbox-page.md | Assignment filter dead; Compose no onClick; bulk missing Assign/reassign/archive | `ChatInboxPage.tsx:42,140-143,207-221` | Delegable (frontend-dev) |
| CG-13 | admin/chat/chat-thread-detail.md | Attachments non-functional; Assign no-op; no Export-PDF/Archive; read receipts always ✓✓ | `ChatThreadDetailPage.tsx:321,477-482,547-572` | Delegable (frontend-dev) |
| CG-14 | admin/subscriptions/subscriptions-page.md | Missing Subscriptions tab (active-subs in separate blocked route); no proration stepper; KPIs missing New/ARPU/LTV | `SubscriptionsPage.tsx:596,170-213`; `SubscriberListPage.tsx:352-364` | TL-gated (subscriber endpoint) |
| CG-15 | web-admin/auth-rbac-organizations.md §B | Org detail 3 of 5 tabs — Roles + Invites absent | `OrganizationDetailPage.tsx:118-146` | Delegable (frontend-dev) |
| CG-16 | web-admin/auth-rbac-invite-acceptance.md §1c | Link-account flow missing Google/Apple OAuth | `InviteAcceptancePage.tsx:404-470` | TL-gated (Firebase social-auth) |
| CG-17 | mobile/loans/loan-status-screen.md | DOCS_REQUESTED section absent (dead end); bank-comm log hardcoded empty; no Download-PDF/grievance | `LoanStatusScreen.tsx:229-231,308-312` | Delegable (mobile-dev) |
| CG-18 | mobile/itr/user-approval-screen.md | 3 attestation checkboxes missing; no filing-confirmation screen | `UserApprovalScreen.tsx:95-113` | Delegable (mobile-dev) |
| CG-19 | mobile/privacy/privacy-center.md §4 | CorrectionRequest captures only category+free-text; no field Select/current/requested value/attachment | `CorrectionRequestScreen.tsx:40-49` | TL-gated (endpoints "proposed") |
| P-20 | mobile/itr/form-16-upload-screen.md | OCR simulated not consumed; no confidence UI/preview; images not PDF | `Form16UploadScreen.tsx:72-79` | Delegable (mobile-dev) |
| P-21 | mobile/itr/doc-checklist-screen.md | Uploads misroute to Form16Upload + optimistic no-op; wrong grouping | `DocChecklistScreen.tsx:82-87,176-190` | Delegable (mobile-dev) |
| P-22 | mobile/itr/notice-inbox-and-detail-screens.md | Detail missing plain-language summary, PDF card, Pay-demand + Mark-resolved, CA chat | `ItrNoticeDetailScreen.tsx:157-240` | Partly TL-gated (Razorpay) |
| P-23 | mobile/itr/refund-tracker-screen.md | 5-stage lifecycle collapsed to 3; BankAccountCard + empty state missing | `RefundTrackerScreen.tsx:47-51` | Delegable (mobile-dev) |
| P-24 | mobile/itr/e-verification-screen.md | Missing "Open IT Portal" link, why-matters, CA-chat footer; ITR-V image not PDF | `EVerificationScreen.tsx:123-134,161-201` | Delegable (mobile-dev) |

## D. PARTIAL — LOW severity (batchable)

| ID | Spec source | Missing / divergent | Evidence | Disposition |
|---|---|---|---|---|
| P-25 | mobile/chat/chat-detail-screen.md | Offline compose dead (`isOffline` hardcoded); no NetInfo | `ChatDetailScreen.tsx:374,936` | Delegable (mobile-dev) |
| P-26 | mobile/chat/chat-list-screen-refresh.md | Last-message preview static placeholder; no swipe actions | `ChatListScreen.tsx:147-149,162-220` | Delegable (mobile-dev) |
| P-27 | mobile/callbacks/request-callback-modal.md | `language` selected but omitted from POST body | `RequestCallbackModalScreen.tsx:115-122` | Delegable (one-line) |
| P-28 | mobile/callbacks/callback-status-screen.md | No IN_PROGRESS/FOLLOW_UP states or Request-follow-up; timeline notes-only | `CallbackStatusScreen.tsx:55-62,479-515` | Delegable (mobile-dev) |
| P-29 | mobile/loans/loan-hub-screen.md | FilterBar + "Best match" sort missing; `eligibilityChecked` unreachable | `LoanHubScreen.tsx:45,179-199` | Delegable (mobile-dev) |
| P-30 | mobile/gst/nil-return-confirm-screen.md | Missing org + due-date (`DueDateChip`) rows; no offline guard | `GstNilReturnConfirmScreen.tsx:120-152` | Delegable (mobile-dev) |
| P-31 | mobile/gst/notice-inbox-screen.md | No per-chip counts, filter sheet, or pagination | `GstNoticeInboxScreen.tsx:74-79,129-144` | Delegable (mobile-dev) |
| P-32 | mobile/privacy/privacy-center.md | MyConsents no Re-grant action | `MyConsentsScreen.tsx:228-240` | TL-gated (no grant endpoint) |
| P-33 | admin/loans/loans-list-page.md | No New-manual-app CTA; missing bank/amount/date/owner filters + bulk-close | `LoansListPage.tsx:440-443,462-485,511-523` | Delegable (frontend-dev) |
| P-34 | admin/loans/loan-detail-page.md | Reassign-bank absent (API unused); Mark-stage; doc row-actions; disbursement date/proof | `LoanDetailPage.tsx:169-199,302,557-610,774-802` | Delegable (frontend-dev) |
| P-35 | admin/callbacks/callback-list-page.md | Missing Export, bulk-select toolbar, row `⋯` menu, linked-entity column | `CallbackListPage.tsx:229-240,337,398` | Delegable (frontend-dev) |
| P-36 | admin/callbacks/callback-detail-page.md | Missing Reassign + Reschedule actions; stepper happy-path only; no attach-to-transition | `CallbackDetailPage.tsx:129-206,297-322,429-483` | Delegable (frontend-dev) |
| P-37 | admin/gst/notice-tracker-list-page.md | UploadNoticeModal no PDF attachment field; posts empty `orgId` | `NoticeTrackerListPage.tsx:67,126-199` | Delegable (frontend-dev) |
| P-38 | admin/gst/notices-due-widget.md | Widget not mounted on `GstFilingQueuePage` (2nd spec'd mount) | `GstFilingQueuePage.tsx` (no ref) | Delegable (one-line) |
| P-39 | admin/itr/itr-page-tabs.md | MarkFiled modal missing ITR-V picker + filed-on date; no tab count badges/refresh | `ItrPage.tsx:90-134,622` | Delegable (frontend-dev) |
| P-40 | admin/reports/financial-reports-page.md | Flat grid not left-rail tabs; non-adaptive form; share recipient placeholder | `ReportsPage.tsx:248,430-441,485-529` | Partly TL-gated (CA/Bank registry API) |
| P-41 | wave7-feature-specs.md §1.3 (CaAvailability) | Live 7-day slot preview replaced by on-demand "Generate slots"; blocks endpoint stubbed | `CaAvailabilityPage.tsx:125-174,202-208` | TL-gated (blocks backend) |
| P-42 | document-scanner-ai-extraction-spec.md §3.3 | OpenAI/Anthropic OCR unimplemented — resolver falls back to Tesseract | `OcrServiceResolver.cs:53-59` | Delegable (backend, phased) |

---

## E. Intentional/documented deviations — do NOT re-file as gaps
- Team page re-scoped to single-tenant staff roles + KPIs tab instead of spec's Invites tab (documented `TeamPage.tsx:1-15`).
- Camera capture routes through `DocumentCategoryScreen` before enqueue (DG-DOC-05), superseding spec's toast-on-shutter.
- `g a` remapped to `/compliance/edit-log` (DG-ADMIN-06).
- `StubPage.tsx` exists but is referenced nowhere in the router — no admin route is stubbed.

## F. Counts
- **8 HIGH, 16 MEDIUM, 18 LOW** verified divergences.
- ~33 delegable (frontend-dev / mobile-dev / backend), ~9 TL-gated or decision-needed.
- 2 specs with no corresponding file (build-vs-descope decision).
