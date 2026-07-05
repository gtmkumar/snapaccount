# SnapAccount — Requirements-vs-Implementation Gap Analysis (2026-07-05)

**Status: IN PROGRESS** — consolidating the full-verification campaign on branch `2026-07-05-full-verification`.
Inputs folded in so far: live admin access-control matrix (ACM), API-contract + Indian-compliance audit, screen-spec audit.
Pending: 6 per-area detailed audits (cross-verification), mobile live-test bugs (iOS+Android, once build renders).

Every item below was verified against code at file:line (adversarial verification per the 2026-06-28 audit lesson: claimed gaps are refuted before acceptance). Items an audit confirmed as **already-closed** are omitted.

Classification: **CONFIRMED** (present & reproduced) · **PARTIAL** (exists, missing sub-feature).
Disposition: **Delegable** (impl-ready) · **TL-gated** (blocked on external credential / deployed infra / scope decision).

---

## 1. Access-control / RBAC — from live admin sweep (11 roles × 37 routes = 407 checks)

Full detail + evidence in `.claude/orchestrator/bug-log.md` (ACM-01..ACM-15). Highest-impact cluster of the whole campaign — **security**.

### CRITICAL (delegable)
| ID | Area | Defect | Fix owner |
|----|------|--------|-----------|
| ACM-01 | `/settings` (Payment Gateway) | No route guard → every non-super-admin staff role can view/edit Razorpay credentials | frontend-dev (router guard) |
| ACM-02 | `/settings/roles` | Gated by `org.roles.read` (7 roles) instead of `platform.roles.manage` → full platform RBAC matrix exposed with live toggles | frontend-dev + backend (perm) |
| ACM-03 | `/admin/audit-log`, `/admin/system-health` | Manager & Reviewer system roles carry `admin.audit.read`/`admin.health.read` they should not | backend (role-grant seed) |
| ACM-04 | `GET /api/appointments/ca-profiles` | Returns another user's CA profile (IDOR) — not self-scoped | backend (query scoping) |
| ACM-06 | post-login role derivation | `pickRole` fail-open to SUPER_ADMIN → org-admin localStorage role=SUPER_ADMIN | **FIXED** (fix-fe-rbac, useAuth.ts) |

### HIGH / MEDIUM (delegable)
| ID | Area | Defect |
|----|------|--------|
| ACM-05 | `GET /api/subscriptions/admin/list` | Not gated → Org Admin gets cross-tenant subscriber/MRR data |
| ACM-07 | `/notifications/templates`, `/ca/availability`, `/ca/appointments` | No route-level guard for any of 11 roles |
| ACM-08 | `/api/loans/kpi` | 403 for roles that CAN see the list → KPI shows 0 vs non-empty list (403-as-empty anti-pattern) |
| ACM-09 | `/users`, `/team` | 403 rendered as benign empty state; raw i18n keys (`team.staff.empty`) printed literally |
| ACM-10 | `ca-profiles` for CA role | CA gets 403 for their OWN profile (missing grant / profile-linkage) |
| ACM-11 | `/ca/appointments` | Frontend parse/schema error on populated response (200s but shows error state) |
| ACM-12 | `/reports/revenue` | SUPER_ADMIN sees ₹0 while Ops/CA see real figures → org-scoping bug |

### LOW / cosmetic
ACM-13 (sign-out doesn't redirect), ACM-14 (no Forgot-password link on /login though page exists), ACM-15 (`over 2025 years ago` epoch date, `ago ago` dup, `common.settings` untranslated breadcrumb).

**Recurring anti-pattern to fix systemically:** several pages treat a 403 from a sub-resource as "no data" rather than "no permission", sometimes leaking raw i18n keys (ACM-08/09/11/15).

---

## 2. API contract + Indian compliance — `gap-2026-07-05-api-compliance.md`

| ID | Sev | Defect | Disposition |
|----|-----|--------|-------------|
| GAP-DPDP-CONSENT-01 | HIGH | `UserConsent.Grant()` never invoked; no grant endpoint / no onboarding capture → `auth.user_consents` only holds withdrawn rows (DPDP requires affirmative consent record). = task #11 | Delegable (backend) |
| GAP-DPDP-CONSENT-02 | MED | Consent purpose taxonomy mismatch: doc `UPPER_SNAKE` vs validator dot-lowercase → contract-following client gets 400 | Delegable (backend + doc) |
| GAP-CONTRACT-CHAT-SEARCH | LOW | Doc `/chat/threads/search` vs actual `/chat/search` → 404 | Delegable (doc fix or code alias) |
| PART-DPDP-DATALOCAL | LOW | Code defaults `asia-south1` (correct); deployed-infra region check open | Code delegable / infra TL-gated |

**Verified already-closed:** PAN/GSTIN/Aadhaar validators, GST-rate config, e-invoicing >5Cr threshold config, versioned tax slabs (AY+regime), ITR-form/act versioning, 7-yr retention, right-to-erasure, data export/correction.

---

## 3. Screen-spec vs implementation — `gap-2026-07-05-screen-specs.md`

42 verified divergences (8 HIGH, 16 MEDIUM, 18 LOW); ~33 delegable, ~9 TL-gated. Full table in the sub-file. Summary of the delegable HIGH cluster:

| ID | Area | Defect | Owner |
|----|------|--------|-------|
| CG-1..CG-3, CG-17, CG-18 | mobile ITR/loan | Dead ITR filing chain (hardcoded `'—'`, steps never persisted, attestation not captured, OCR simulated); loan application details/consent-gate | mobile-dev |
| CG-4, CG-5 | admin ITR | CA tax-computation delta pills never render; no computation-history diff/activity log; Reassign inert | frontend-dev |
| CG-6, CG-7 | admin loans | Bank-comms no Resend/bulk; **PartnerBanks edit always calls create → duplicates a bank (data-integrity bug)** | frontend-dev |
| CG-8 | admin notifications | No `/notifications` full-page route; 3 nav entries dead-link | frontend-dev |

MEDIUM/LOW: admin gst invoice editor, notice PDF viewer (needs react-pdf), template Active toggle (needs backend `isActive`), chat inbox/thread actions, org-detail Roles/Invites tabs, mobile refund-tracker/e-verification/notice-detail/callbacks/gst-nil/loan-hub polish, document-scanner cloud OCR (phased backend).

**TL-gated (list for user, don't implement):** CG-14 subscriber endpoint, CG-16 Firebase social-auth on invite, CG-19/P-32 consent-grant endpoint (unblocked by GAP-CONSENT-01), P-41 CA-availability blocks endpoint, P-40 CA/Bank registry API, P-22 Razorpay pay-demand.

**Build-vs-descope decisions (2 specs, no file):** `auth-rbac-members.md` (no MembersPage) and mobile `gst-filing.md` screens 19/21/23/24 (no mobile e-invoice/e-way-bill/IRN — likely by-design, admin-side exists).

**Do NOT re-file (intentional deviations):** Team page single-tenant re-scope, camera→DocumentCategory routing (DG-DOC-05), `g a`→compliance/edit-log (DG-ADMIN-06), unused StubPage.

---

## 4. Pending inputs (this doc is finalized when these land)
- 6 per-area detailed audit agents (doc-scanner/IMS, wave7+admin gst/chat/callbacks, admin itr/loans/rbac/refdata, mobile loans+itr, mobile gst/privacy/ux, dashboard/reports/subs/team) — cross-verify §3 and add any missed items.
- Mobile live-test bugs (iOS + Android) once the native build renders.

## 5. Execution plan (Phase 5 implementation waves)
Serialized per file-owner to avoid concurrent-edit conflicts; each fix confirms-before-editing + adds a regression test + reruns the affected suite:
1. **Backend wave** (after fix-be-authz frees Platform): ACM-03/04/05/10/12 role-grants & query scoping; GAP-CONSENT-01/02.
2. **Admin frontend wave** (after fix-fe-rbac frees src/admin): ACM-01/02/07/08/09 guards & 403-handling; CG-4..CG-8 + admin MEDIUM/LOW.
3. **Mobile wave** (after build renders + qa sweeps): CG-1..3/17/18 + mobile MEDIUM/LOW.
4. **Docs/trivia:** CHAT-SEARCH, ACM-13/14/15.
TL-gated items → carried to the final user report only.

---

## 6. Backend contract gaps surfaced by the admin CG/P wave (feed the #20 ITR/loan backend wave)
These are admin UI features that are impl-ready on the frontend but **blocked on a missing/underspecified backend contract**. fe-gaps-2 correctly refused to fabricate them; they are new delegable backend gaps, dispatch alongside #20 once integration is green.

| ID | Endpoint | Missing | Enables (admin UI) |
|----|----------|---------|--------------------|
| BE-LOAN-01 | `POST /loans/applications` | no `orgId` param — creates only under caller's org | P-33 "New manual application" CTA (admin creates on-behalf-of a customer's org) |
| BE-LOAN-02 | loan documents | no verify / reject / download endpoint for a loan-application document | P-34 loan-detail document row-actions |
| BE-LOAN-03 | `POST /loans/applications/{id}/disbursement` | contract accepts only `{disbursedAmount, bankReferenceNo}` — no disbursement date / proof upload | P-34 disbursement capture |
| BE-ITR-01 | `POST /itr/filings/{id}/mark-filed` | contract accepts only `{acknowledgementNumber}` — no ITR-V document picker / filed-on date | P-39 MarkFiled dialog |

### 6a. Chat / org / GST-notice backend gaps surfaced by the CG-12/13/15 + P-37 wave (checkpoint 2)
fe-gaps-2 wired everything client-computable and refused to fabricate the rest. These are the confirmed backend follow-ups:

| ID | Endpoint / capability | Missing | Enables (admin UI) |
|----|-----------------------|---------|--------------------|
| BE-CHAT-01 | client identity in chat | only Firebase uid is exposed client-side, no backend user id → a per-agent "assigned to me" bucket is not computable | CG-12 chat inbox "me" assignment filter (currently All/Assigned/Unassigned only) |
| BE-CHAT-02 | chat thread lifecycle | no **archive** endpoint (only resolve/escalate/reopen) | CG-12 bulk-archive + CG-13 thread archive action |
| BE-CHAT-03 | chat attachments | no chat-attachment **upload** endpoint (read path works via `message.attachmentsJson`) | CG-13 outbound paperclip (disabled w/ explanatory title) |
| BE-AUTH-01 | per-org role catalog | `GET /auth/org/roles` is caller-org-scoped; no endpoint for a platform admin to read an **arbitrary** org's editable role catalog | CG-15 org-detail Roles tab (currently derives roles-in-use from real members w/ counts — no fabrication, but not editable) |
| BE-GST-01 | notice-scoped org list | `POST /gst/notices` needs `orgId`, but the only org-list endpoint (`GET /auth/admin/organizations`) is gated `platform.orgs.read` while notices are gated `menu.gst_notices.view` → pure CA/GST-reviewer roles 403 on the org list | P-37 notice-upload org selector for non-platform-admin uploaders (needs a notice-scoped org-list or backend GSTIN→org resolution) |
| BE-GST-02 | notice attachment | `POST /gst/notices` has **no attachment field** | P-37 spec's "PDF attachment" on notice upload |

| BE-GST-03 | return invoices | `POST /gst/returns/{id}/invoices` exists (CG-9 add wired), but no PUT/DELETE to **edit/delete** an existing invoice row | CG-9 GSTR-1 line-item editor (edit/delete existing rows) |

Note: CG-13 read-receipt was corrected from an always-✓✓ lie to an honest single "sent" check — no delivery/read data exists on messages; a real read-receipt would also need a backend model (defer, low priority).

**Task #21 (admin gap wave 2) COMPLETE** — vitest 1128/1128, lint 0, build clean, i18n parity 2726 (+107 keys), uncommitted in `src/admin/`. Per-item detail in bug-log.md "Admin gap wave 2". Guardrails honored (router.tsx + WebMCP untouched). The full backend follow-up set (BE-LOAN-01/02/03, BE-ITR-01, BE-CHAT-01/02/03, BE-AUTH-01, BE-GST-01/02/03) now feeds task #20's backend wave.

---

## 7. Backend EF↔DB divergence bugs surfaced by the migration-based integration fixture (HIGH-VALUE — the campaign's core find)
The new `tests/integration/_shared/MigrationSupport.cs` fixture replays all 111 `database/migrations/*.sql` (prod source of truth) instead of EF `EnsureCreated`, so the code-under-test finally faces the **real production schema**. All 9 integration suites are green (175 pass / 30 skip / 0 fail); the 30 skips are cited against these confirmed bugs so they stay visible. These 500 in **production**, not just tests — the prior EF-model-based tests hid them because the buggy EF config also defined the test schema. Full evidence in `.claude/orchestrator/bug-log.md` (2026-07-05 campaign). = task #23.

| ID | Sev | Endpoint / flow that 500s | Root cause | Fix side |
|----|-----|---------------------------|------------|----------|
| BUG-ACCT-COA-TEMPLATE-CODE | CRITICAL | `POST /accounting/organizations/{id}/bootstrap-coa` (+5 cascade) | `CoaTemplateRepository` (Dapper) SELECTs `template_code`, a column never in `accounting.coa_template` | code (or migration if col genuinely needed) |
| BUG-NOTIF-SEND-DEDUPE-LINQ | CRITICAL | `POST /notifications/send` (platform's only fan-out entry) | `DateTime.UtcNow.Subtract(...)` inside an EF LINQ predicate — untranslatable | code (compute cutoff before the query) |
| BUG-ITR-ASSESSEE-MAPPING | CRITICAL | `PUT`/`GET /itr/profile`, `POST /itr/filings` | `itr.assessee_profiles` EF mapping assumes 6 nonexistent columns (systemic) | db-engineer + backend |
| BUG-LOAN-CONSENT-ENUM | HIGH | every loan `consent` write | `loan.consents.consent_type` native PG enum never registered via `npgsql.MapEnum` (only LoanApplicationStatus + BankAdapterType are) — RBI/DPDP-critical | code (register enum) |
| BUG-SUB-PLAN-CODE-MISSING | HIGH | `POST /subscriptions/plans` | `subscription_plan.code` is NOT NULL UNIQUE but EF never maps it; `billing_cycle` CHECK vocab also mismatches the C# enum | code |
| BUG-LOAN-STATUSLOG-COLS | HIGH | loan BeginReview/Approve/Reject/disbursement-webhook | `ApplicationStatusLogConfiguration` maps Notes/TransitionedAt/TransitionSource to nonexistent columns (real: reason/occurred_at/actor_type) | code |
| BUG-GST-NOTICE-GSTIN | HIGH | every `POST /gst/notices` | `gst.notices.gstin` is NOT NULL + CHECK but `CreateNoticeCommand` never captures a GSTIN (ties to BE-GST-01/P-37) | code |
| BUG-ASSIST-NO-ENUM-CONVERTER | MED | Assist.WebApi enum responses serialize as ints | missing `JsonStringEnumConverter` that Platform/Finance both register — cheapest fix | code |
| BUG-GST-HSN-SEARCH-PARAM | LOW | `GET /gst/hsn-sac/search` | param is `q` in code, `query` in `docs/api/endpoints.md` (no alias) | doc or code alias |

**Latent (test-fidelity, NOT prod bugs):** EF model omits FKs the DB enforces (`fk_role_organization_id` on `auth.role.organization_id`; `organization_owner_user_id_fkey`) and some store defaults (loan_products shadow props). Prod uses migrations as source of truth so these ARE enforced live — the EF configs just don't declare them. Add to EF configs for model accuracy (low priority, backend).
