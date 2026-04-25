# Phase 6D — ITR Engine

> **Priority:** P0 (tax season blocker — plan Module G)
> **Duration:** 3 weeks
> **Depends on:** Phase 6A (Accounting for income/expense computation)
> **Can run in parallel with:** Phase 6B, 6C
> **Source:** `phase-6-gap-analysis.md` §2.6, §5.8, §8.4, Plan Module G, Plan L (AY = FY+1)

---

## Why this is P0

ItrService has 0 handlers, 6 endpoints 501. Plan G demands: profile wizard, doc checklist, tax computation engine (old + new regime), regime comparison, e-verification, refund tracker, notice handler. Only `ITRDashboardScreen` exists on mobile — 6+ screens missing.

Critical: **tax slabs change every Assessment Year.** Engine must be config-driven, versioned, never hard-coded.

---

## Scope

### db-engineer (additive)

- `itr.tax_slab_versions` — ay (e.g., "AY2026-27"), regime (OLD/NEW), slabs_jsonb (array of {from, to, rate, cess}), rebate_under_87a, standard_deduction, effective_from, effective_to, source_citation (notification/circular ref).
- `itr.deduction_sections` — section (80C/80CCD/80D/80G/80E/HRA/etc.), ay, regime, max_amount, sub_limits_jsonb.
- `itr.assessee_profiles` — user_id, pan, dob, residential_status, occupation, salary_details_jsonb, business_details_jsonb, deductions_jsonb per AY.
- `itr.filings` — id, user_id, ay, itr_form (ITR-1..7), regime_chosen, total_income, total_tax, refund_due, tax_paid, payable, status (DRAFT/UNDER_CA_REVIEW/USER_APPROVED/FILED/E_VERIFIED/REFUND_ISSUED/NOTICE_RECEIVED), filed_at, ack_number, itr_v_uri.
- `itr.form_16_extracts` — document_id FK, parsed_json (employer TAN, employee PAN, salary, TDS).
- `itr.notices` — parallel to gst.notices (DPDP cascade).
- `itr.refund_status_log` — date, status (NOT_DETERMINED/DETERMINED/DISPATCHED/CREDITED/FAILED/ADJUSTED), amount, reference_no.
- `itr.verification_queue` — tracks CA review state on a filing.
- Indexes + RLS.
- **Seed tax_slab_versions** with AY2025-26 + AY2026-27 slabs (old + new regime) per latest Finance Act.

### backend-agent

1. **ItrService full build:**
   - Domain: `Assessee`, `Filing`, `TaxSlabVersion`, `DeductionSection`, `RegimeComparison` VO, `FilingStatus` state machine.
   - Application:
     - Commands: StartFiling, UpdateProfile, UploadForm16, ExtractForm16, ComputeTax, CompareRegimes, SubmitForCaReview, CaApprove, CaReject, UserApprove, MarkFiled, MarkEVerified, RecordRefund, UploadNotice.
     - Queries: GetFiling, ListFilings, GetProfile, GetTaxSlabs, GetDeductionCatalog.
   - **Tax computation engine** (`Application/Services/TaxComputationEngine.cs`):
     - Input: Assessee profile + income heads (Salary/House Property/Capital Gains/Business/Other Sources).
     - Output: gross total income → deductions → taxable income → slab-wise tax → cess → rebate → net tax → advance/TDS credit → payable/refund.
     - Engine reads from `tax_slab_versions` (no hard-coded rates).
     - Unit tests per AY × regime × assessee-type (resident/NR, senior citizen, super-senior).
   - **Regime comparison** — runs engine twice, returns side-by-side with recommendation + savings amount.
   - **Form 16 parser** — PDF → extracted JSON via Document AI (or pattern-based if Document AI rate limits are a concern; prefer Document AI for consistency).
   - **E-verification** — MVP: manual acknowledgment (user uploads ITR-V from income tax portal or confirms EVC completion). Full integration (Aadhaar OTP / Net Banking / Bank EVC) deferred to Phase 7.
   - **Refund tracker** — scheduled job (Cloud Scheduler): polls a stub "refund API" (mock for MVP; real IT Portal integration deferred) or awaits manual update by CA.
   - **Notice handler** — parallel to GST notices (upload PDF, assign CA, respond).
2. All 6 ItrService endpoints mediator-wired; 0 501; 0 TODO.
3. Tests ≥80%; AY-specific golden-file tests for tax computation (expected input → expected output CSV).

### ui-ux-agent (docs/design/)

1. Mobile screens: EmployeeProfileWizard, DocChecklistScreen, Form16UploadScreen, RegimeComparisonScreen (side-by-side), FilingSummaryScreen, UserApprovalScreen, EVerificationScreen, RefundTrackerScreen, ItrNoticeInboxScreen/DetailScreen.
2. Admin: ItrPage full build — VerificationQueue, CaTaxComputationPanel (drill into a user's filing, adjust deductions, see live tax recompute), FilingQueue, NoticeTracker.
3. Visual design of tax comparison chart (bar chart, recommended option highlighted).

### frontend-dev (src/admin/)

1. `ItrPage.tsx` full build w/ tabs: Verification Queue, CA Computation Panel, Filing Queue, Notice Tracker.
2. `ItrFilingDetailPage.tsx` — full drill-down w/ tax-comp sidebar; editable deductions; live recompute via debounced API.
3. Role-gated: CA + admin.
4. API client `src/admin/src/lib/itrApi.ts`.
5. All text `t()`.
6. Vitest coverage.

### mobile-dev (mobile/)

1. `EmployeeProfileWizard` — 5-step wizard (Personal, Employment, Deductions, Investments, Review).
2. `DocChecklistScreen` — checklist pulled from backend (varies by profile: salaried vs business).
3. `Form16UploadScreen` — upload → OCR → extraction review.
4. `RegimeComparisonScreen` — side-by-side w/ chart + recommendation.
5. `FilingSummaryScreen` — full summary pre-approval.
6. `UserApprovalScreen` — scroll-to-bottom-before-approve rule + biometric re-auth.
7. `EVerificationScreen` — manual acknowledgment MVP.
8. `RefundTrackerScreen` — live status cards.
9. `ItrNoticeInbox/Detail` — parallel to GST notice pattern.
10. Deep-link from notification → correct screen.
11. Jest coverage.

### devops-engineer

- Tax slab seed migration runs on every deploy (idempotent upsert).
- Cloud Scheduler: `itr-deadline-reminders` (July reminder cadence), `itr-refund-polling` (daily).
- Form 16 parsing — Document AI quota monitoring.

### qa-web + qa-mobile + security-reviewer

- qa-web: full CA review flow, notice tracker, verification queue throughput.
- qa-mobile: profile wizard completion rate, regime comparison edge cases (very low / very high income), Form 16 extraction golden files.
- security-reviewer: PAN storage (AES-256 already per security findings), filing AuthZ (strict user_id scoping), notice attachment AuthZ, refund status tamper resistance.

---

## Exit Criteria

1. User completes profile wizard → doc checklist → Form 16 upload → extraction → CA reviews → regime comparison → user approves → filed → e-verified → refund tracked.
2. Tax computation engine produces correct output for AY2025-26 + AY2026-27 × (OLD, NEW) × {salaried, business, senior citizen, super-senior} golden files.
3. Regime comparison recommends correct regime for 3 test assessees (verified by hand calculation).
4. No hard-coded tax slabs or deduction limits anywhere in `ItrService.*` — all flow from `itr.tax_slab_versions` + `itr.deduction_sections`.
5. Notice tracker end-to-end (similar to GST).
6. 0 501 responses from ItrService; 0 TODO markers.
7. Tests ≥80%.
8. Zero new Critical/High security findings.

---

## Dependencies & Risks

- **ITR Portal API access** is effectively unavailable to third parties — manual filing for MVP is the accepted approach (per plan G7.2). Admin uploads ITR-V PDF from the official portal back into our system.
- **Form 16 formats vary** — Document AI may fail on unusual layouts; fallback: manual data entry screen.
- **AY rollover** — at FY-close (April 1), seed new slabs if Finance Bill passed. This is a recurring ops task — schedule reminder.
- **Tax advice liability** — disclaim everywhere: "SnapAccount and our CAs provide assistance; final responsibility for accuracy rests with you."

---

## Owner Agents

1. db-engineer (slab seed + schema) → backend-agent.
2. ui-ux-agent parallel.
3. backend-agent → frontend-dev + mobile-dev.
4. devops-engineer (schedulers + Doc AI quota).
5. qa + security final gate.

---

*End of Phase 6D scope.*
