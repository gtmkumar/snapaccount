# SnapAccount — Gap Analysis Delta (2026-06-11)

> Supplement to `gap-analysis-2026-06-10.md` — read that first; this document records (A) code-verified closure state after Phase 7 Waves 1–2, (B) new findings from a full docs/QA/handoff sweep, and (C) new industry/regulatory research findings (IDs continue at GAP-100+).
> Inputs: code audit of branch `2026-06-10-s5t4` (commits 073fe12, 881eaec, 75c0e69), all `.claude/orchestrator/` handoffs, `.claude/qa/` reports, `docs/`, and fresh external research (MCA audit-trail rule, GSTN IMS, Income Tax Act 2025, SC/RBI/SEBI accessibility mandate, PCI-DSS, RBI payment-data localization, MuleHunter/fraud, OCEN/GST Sahay, 2026 competitor baselines).
> Task assignments: tracked in the session task board (created 2026-06-11) + per-agent notes below.

---

## A. Closure verification — Phase 7 Waves 1 & 2 (code-verified, not report-trusted)

**Wave 1: 11/11 CLOSED.**
GAP-003 (Firebase revoke best-effort + Hangfire retry), GAP-004 (parameterized `set_config`), GAP-005 (SESSION_JWT_SECRET fail-fast ×12 services), GAP-007 (`POST /auth/token/refresh-context` + mobile `refreshContextAndSwap()` in BusinessProfileWizard + AcceptInvite — BUG-5 closed end-to-end), GAP-010 (`documentApi.ts`, Queue/Review real APIs), GAP-011 (ITC Mismatch wired), GAP-012 (real KPI query + `assignments_log` / SEC-030), GAP-040 (consent catalog endpoint, hardcode removed), GAP-070 (seeder band-aid removed, EF configs proper), GAP-061 (i18n files complete).
GAP-060 **PARTIAL** — dashboard stubs wired, but ProfileScreen billing/help/edit-business remain `Alert` stubs.

**Wave 2: fully delivered.**
- B7 DPDP: `UserConsent`/`DataExportRequest`/`DataCorrectionRequest` entities, `Privacy.cs` (6 secured endpoints), migration 062, `HangfireDataExportScheduler`, `DpdpPrivacyTests.cs`.
- B8 RBI KFS: `KeyFactsStatement` entity (immutable trigger, migration 063), Generate/Get KFS, cooling-off on `LoanApplication`, `KfsComplianceTests.cs`.
- B9: `IRazorpayClient` + `RazorpayHttpClient` + `MockRazorpayClient` (mock default in DI), `UsageRecord` + `RecordUsageCommand`, migration 064.
- B10 seeder clean; B11 security bundle spot-verified (AES-GCM with legacy-CBC decrypt, invite identity, assignments_log) — **SEC-056 ghost-route wiring PARTIAL** (backing tables exist; admin endpoints deferred); B12 `Permission.IsActive` enforced in resolver queries.
- M2/M3/M4: refresh-context calls, `KeyFactsStatementScreen.tsx`, `PrivacyCenterScreen.tsx` + `privacy.ts` client, `expo-local-authentication ~56.0.4` with 2-stage biometric gates.
- D4: CI `migration-replay` + `aspire-healthz-smoke` (12 services) jobs in `ci.yml`. D5: `infra/pubsub-scheduler-recurring-jobs.sh` incl. `callback-kpi-mv-refresh`.

**Schema-reconciliation 500s** (loan/callback/chat admin pages, EF↔DB divergence): RESOLVED — PRs #33/#36 merged, migration 056.

**Still open from the 2026-06-10 High list:** GAP-001 (leaked Firebase key NOT rotated; plist still committed; stray root package.json), GAP-002 (CI billing — note: D4 jobs exist but cannot run), GAP-006 (EAS/pinning/mobile Firebase), GAP-020/021 backend halves now done — remaining parts are TL-10 (DPO appointment) + permission-perimeter audit, GAP-030 (AI service), GAP-034 (admin settings wiring + subscriber/invoice pages remain), GAP-073 (external paperwork).

---

## B. New findings — docs/QA/handoff sweep + Wave 2 code audit

| ID | Issue | Impact | Solution | Owner | Priority |
|---|---|---|---|---|---|
| NEW-D03 | Document review-decision endpoints (`POST /documents/{id}/approve|reject|clarify`) + archive route missing — Review page buttons disabled with `TODO B15` | Core operator loop (upload→OCR→review→**approve**→ledger) breaks at the final step | Deliver B15 now (was Wave 3): 3 decision endpoints + archive route + emit `document.ocr.completed → accounting` on approve; frontend wires buttons | backend-agent + frontend-dev | **High** |
| NEW-D16 | Admin "Pending Invites — couldn't load invites" bug (pre-existing, never fixed) | Admins can't see/resend outstanding invites — team onboarding blocked | Diagnose (API shape vs UI), fix + test | frontend-dev | **High** |
| NEW-D07 | Razorpay webhook secret never provisioned; not tracked in external-deps log | All partner-bank disbursement webhooks fail signature check (403) — disbursal updates silently dropped | Add to Secret Manager provisioning checklist; TL obtains from Razorpay dashboard | devops-engineer + team-lead | **High** |
| NEW-D17 | No CI verification that QuestPDF fonts are bundled in the container image | Silent garbage-glyph PDFs in production loan packages — banks reject | CI step: inspect published image for `backend/Shared/fonts/`, render a smoke PDF in container | devops-engineer | **High** |
| NEW-D01 | PR #32 (`fix/ai-config-validation-notifications-500`) recorded as OPEN; stray root `package.json`/`package-lock.json`; SandboxKycProvider blocked on `KYC_API_KEY/SECRET` | Branch divergence risk; leaked-key incident (GAP-001) still live | Reconcile PR #32 state vs main (much may have landed via later PRs), remove stray files, track KYC creds as TL item | orchestrator + team-lead | **High** |
| NEW-D08 | `client_message_id` column exists (migr. 057) but `SendMessageCommandHandler` has no idempotency/dedupe; mobile doesn't send it | Offline→online retry duplicates chat messages visibly | Dedupe on (thread, client_message_id); mobile generates UUID per send | backend-agent + mobile-dev | Medium |
| NEW-D09 | `callback.kpi_daily_snapshot` MV definition/org-filter never audited; refresh job now scheduled (D5) but IDOR test from P6-HANDOFF-04 still missing | Stale/cross-org KPI data risk | db-engineer audits MV SQL (org filter); qa-web adds the IDOR integration test | db-engineer + qa-web | Medium |
| NEW-D10 | KFS locale selection rules undocumented (migration 061 added `locale`; mobile doesn't pass explicit locale) | RBI compliance mismatch if KFS render-locale ≠ recorded locale | Document locale resolution (user pref → org default → en) in endpoint + endpoints.md; mobile passes locale explicitly | backend-agent + mobile-dev | Medium |
| NEW-D11 | AI service blocked on architecture decision: embedding model + LLM provider + Sarvam routing unchosen | Wave 3 GAP-030 work can't start | Orchestrator decision doc (recommend: Vertex `text-embedding` + Gemini via existing admin-config provider settings; Sarvam for Indic chat) | orchestrator | Medium |
| NEW-D05 | Backup/PITR restore drill never executed (runbook exists, no drill record) | Untested backups in a financial system; DPDP retention implies restorability | Execute first drill; record results in runbook; calendar quarterly | devops-engineer | Medium |
| NEW-D06 | SLOs defined in `observability-slos.md` but no Cloud Monitoring alert policies exist | SLOs are fiction; nobody paged on breach | Create alert policies from the documented targets; wire notification channel | devops-engineer | Medium |
| NEW-D02 | Two i18n runtimes in admin (custom `@/i18n` + uninitialised react-i18next, ~13 components) — sharper statement of GAP-050 | Mixed-language UI, broken `{{}}` interpolation | Consolidate to ONE runtime (decide; custom is currently the working one), migrate the 13 components, CI key-parity check | frontend-dev | Medium |
| NEW-D04 | Settings "Subscription Tiers" stats fabricated (4 plans / 1,247 subscribers / ₹8.4L MRR) | Ops/finance decisions on fictional revenue | Wire `/subscriptions/mrr` + real counts (B9 backend now exists) | frontend-dev | Medium |
| NEW-D14 | `POST /loans/eligibility`, Privacy (6), KFS (2) endpoints absent from `docs/api/endpoints.md` (= GAP-090, now larger) | Clients code against stale contracts (caused P6-HANDOFF-23/25) | Regenerate endpoints.md from OpenAPI; mark mock-backed routes | backend-agent | Medium |
| NEW-D15 | Session JWT carries `roles` but not `permissions`; clients must call `/auth/me/permissions` separately | Confusion + no offline permission checks | Document claim structure; evaluate adding `permissions` claim (size permitting) | backend-agent | Low |
| NEW-D12 | CallbackService silently skips Firebase init when `GcpStartup.IsEnabled()` false — undocumented | Hours-lost local debugging of 401s | Warning log + doc of GcpStartup behavior | backend-agent | Low |
| NEW-W2-002 | Mobile KFS tests cover API only — scroll-gate/ack-checkbox logic untested | Regression risk on a legally-required gate | Screen-level tests for gate + ack flow | qa-mobile | Medium |
| NEW-W2-003 | DPDP privacy test coverage unquantified (withdrawal, export retry paths) | Compliance code under-tested | Run coverage; fill gaps to >80% on Privacy module | qa-web | Medium |
| NEW-W2-004 | Razorpay DI defaults to Mock; no production-activation runbook | Accidental Mock deploy = no real payments | `docs/devops/subscription-razorpay-setup.md` + startup log of active client | devops-engineer + backend-agent | Medium |
| NEW-W2-005 | `KeyFactsStatementScreen` uses `console.warn` for errors | Lost observability | Structured logging before GA | mobile-dev | Low |
| NEW-W2-006 | PermissionCatalogPage UI may not filter/disable retired (`is_active=false`) perms | Cosmetic RBAC confusion (backend enforces) | Verify + gate in UI | frontend-dev | Low |
| NEW-W2-007 | `mobile/src/config/privacyContact.ts` DPO details unverified/unpopulated | Privacy Center "Contact DPO" dead link; DPDP requires published contact | Populate once TL-10 (DPO appointment) done; placeholder + TODO until then | mobile-dev + team-lead | Medium |

Dropped as already-closed: NEW-D13 (Privacy Center endpoints — delivered in Wave 2 B7/M3).

---

## C. New industry/regulatory gaps (research 2026-06-11) — GAP-100+

### GAP-100 — MCA audit-trail (edit log) rule: statutory product requirement — **High**
- **Issue:** Companies (Accounts) Rules: any company keeping books in accounting software needs per-transaction edit logs (who/what/when, **non-disableable**, auditor-reportable). SnapAccount's AccountingService has no per-mutation edit-log entity or auditor-facing export. Distinct from GAP-024 (internal audit trail) — this is a customer-facing statutory feature; without it, Pvt-Ltd customers legally can't use SnapAccount as books of account.
- **Solution:** Append-only `accounting.edit_log` (immutable even for SUPER_ADMIN), auditor edit-log report (PDF/Excel per FY), 8-year retention, public compliance statement. Design jointly with GAP-024 event contract.
- **Owner:** backend-agent + db-engineer + frontend-dev (report) · **Priority: High**

### GAP-101 — GSTN IMS is mandatory since 1 Apr 2026 + GSTR-3B hard-locking — **High**
- **Issue:** IMS (accept/reject/pending per inward invoice before GSTR-2B) is now mandatory for regular filers; GSTR-3B Table 3 is hard-locked (corrections only via GSTR-1A). SnapAccount has no IMS workflow, no GSTR-1A flow; the reconciliation UX assumes editable 3B. Our GST product is functionally behind current law.
- **Solution:** IMS inbox entity + actions in GstService (Mock GSTN client first), recompute-2B-after-action, GSTR-1A amendment support, IMS pending-deadline alerts, 3B review UI read-only with "fix via GSTR-1A" CTA. (Verify the secondary-source "zero-mismatch 3B block" against a primary GSTN advisory before building to it.)
- **Owner:** backend-agent + frontend-dev + mobile-dev + ui-ux-agent (IMS inbox spec) · **Priority: High**

### GAP-102 — Income Tax Act 2025 cutover (1 Apr 2026): dual-act handling — **High (design now)**
- **Issue:** Current season (AY 2026-27) files under the 1961 Act; FY 2026-27 onward is the new Act — "tax year" terminology, renumbered sections, new form numbers. ItrService versions by AY but has no act-version dimension; section references and "Assessment Year" copy go stale next season.
- **Solution:** `act_version`/`tax_year` on FY-versioned config; old→new section mapping reference data; UI copy audit; form-renumber config planned for the 2027 season.
- **Owner:** backend-agent + db-engineer + frontend-dev/mobile-dev (copy) · **Priority: High** (schema/design now; ship before next season)

### GAP-103 — Digital accessibility legally mandated (SC + RBI/SEBI 2025 circulars) — **High**
- **Issue:** RBI mandate covers digital lending platforms: WCAG 2.1+/IS 17802, certified audits (ecosystem deadlines Apr/Jul 2026 already passed), PwD usability testing, accessible KYC alternatives. Our GAP-062 treats a11y as QA polish; KYC/loan/consent flows have no accessible alternative; partner banks will flow this down in LSP due diligence.
- **Solution:** A11y program: WCAG 2.1 AA target; audit KYC/loan/consent surfaces first; voice/assisted-callback alternative for KYC (fits human-service model); axe/a11y checks in CI; conformance statement doc.
- **Owner:** ui-ux-agent (standards/spec) + mobile-dev + frontend-dev + qa-web/qa-mobile (tooling) · **Priority: High** (regulated surfaces), Medium (rest)

### GAP-104 — No sales-side product: invoicing/inventory/receivables (competitor table stakes) — **High (decision)**
- **Issue:** Verified: AccountingService is ledger-only (no SalesInvoice, Party master, stock, receivables). Vyapar/myBillBook/Zoho lead with invoice creation → WhatsApp share → payment collection. Our photo-of-bill USP covers purchases only; SMEs live on the sales side. EWB client exists but is orphaned from any invoice-creation flow.
- **Solution:** **Team-lead product decision:** (a) build invoicing module (reuses GST rate config + EWB client + Razorpay rails), or (b) position as compliance/CA layer and build competitor *import* (extends GAP-032). Inventory/barcode only if (a).
- **Owner:** team-lead decision → orchestrator scoping · **Priority: High** (decision), phased build

### GAP-105 — UPI payment collection (links/QR on invoice, auto-reconciliation, reminders) — **Medium** (High if GAP-104a)
- Razorpay Payment Links/UPI QR; webhook → auto-match receivable → journal entry; reminders via NotificationService (pairs with GAP-033 WhatsApp). Owner: backend-agent + mobile-dev + ui-ux-agent.

### GAP-106 — PCI-DSS scope statement (SAQ A) + card-data guardrails — **Medium**
- `docs/security/pci-scope.md`: SAQ A boundary, "Razorpay Checkout/SDK only — never card fields in our UI", webhook data minimization, annual attestation task; CI grep guard for card-field names. Owner: security-reviewer + backend-agent/mobile-dev.

### GAP-107 — RBI payment-data localization map (asia-south1 full data plane) — **Medium**
- `docs/devops/data-residency-map.md` covering GCS/Cloud SQL backups/Pub/Sub/Logging/Firebase (often US-multiregion!)/Crashlytics/SendGrid/Vertex; org policy `gcp.resourceLocations`; rule: payment fields never enter Crashlytics/SendGrid/LLM payloads. Owner: devops-engineer + security-reviewer.

### GAP-108 — GST notice automation depth: DRC taxonomy, preventive mismatch simulator, GSTAT tracking — **Medium**
- Notice form taxonomy (ASMT-10/DRC-01/01A/01B/01C/ADT-01) + statutory deadline engine; pre-filing DRC-01B/01C simulation on the existing reconciliation engine; AI reply-draft as AiService P7c; GSTAT appeal-stage tracking (backlog-appeal deadline 30 Jun 2026 — flag to customers). Owner: backend-agent + frontend-dev.

### GAP-109 — E-invoice ops specifics: 30-day IRP window validation, B2C pilot watch — **Low** (Medium once invoicing ships)
- Owner: backend-agent (with GAP-104), orchestrator (watch).

### GAP-110 — Loan fraud/mule-account controls (MuleHunter ecosystem; banks audit LSPs) — **Medium**
- Pre-submission fraud stage in LoanService: duplicate PAN/phone/device across orgs, penny-drop name match, velocity rules, fraud-flag in bank package, decision log. Owner: backend-agent + security-reviewer.

### GAP-111 — OCEN / GST Sahay rails evaluation (strategic) — **Low**
- Fold into GAP-046 AA evaluation doc as the Phase 8+ lending-rail decision. Owner: orchestrator.

---

## D. Updated priority roll-up (open items only, as of 2026-06-11)

| Priority | Items |
|---|---|
| **High** | GAP-001, 002, 006, 030, 034(remainder), 073 · NEW-D01, D03/B15, D07, D16, D17 · GAP-100, 101, 102, 103, 104(decision) |
| **Medium** | GAP-008(SEC-056 remainder), 013, 014, 015, 022, 023, 024(merge w/100), 025, 031, 032, 033, 035, 036, 037, 038, 041, 042, 045, 047, 050/NEW-D02, 051, 052, 054(UI), 060(Profile stubs), 062, 064, 071(billing-gated), 072, 080, 081, 082, 090/NEW-D14 · NEW-D05, D06, D08, D09, D10, D11, W2-002/003/004/007 · GAP-105, 106, 107, 108, 110 |
| **Low** | GAP-039, 043, 044, 046(+111), 053, 055, 065, 074, 093 · NEW-D12, D15, W2-005, W2-006 · GAP-109 |

## E. Wave 3 dispatch recommendation

1. **Wave 3a (core-loop completion + urgent compliance):** B15/NEW-D03, NEW-D16, NEW-D07, NEW-D17, GAP-101 (IMS — start with spec + mock client), GAP-100 schema design, GAP-103 audit of loan/KYC surfaces, GAP-030 P7a (after NEW-D11 decision).
2. **Wave 3b (money + docs):** GAP-034 remainder + NEW-D04, NEW-W2-004, GAP-090/NEW-D14 endpoints.md regen, NEW-D02 i18n consolidation, GAP-102 schema.
3. **Team-lead queue (blocking, cannot delegate):** TL-1 CI billing, TL-2 key rotation (GAP-001), TL-10 DPO (unblocks NEW-W2-007), Razorpay webhook secret (NEW-D07), KYC sandbox creds, **GAP-104 product decision**.

*End of delta. Companion: session task board (TaskList) created 2026-06-11 with per-agent assignments.*
