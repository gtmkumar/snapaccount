# Live Test & Fix Verification — 2026-06-11 (orchestrator session)

> Companion to: `.claude/qa/live-web-sweep-2026-06-11.md` (qa-web API sweep), `.claude/qa/live-android-sweep-2026-06-11.md` (qa-mobile Android sweep), `gap-analysis-2026-06-11-delta.md` (gap state). Branch `2026-06-10-s5t4`.

## What ran this session

1. **Task board rebuilt** (30 tasks) from the consolidated 2026-06-11 delta gap analysis; per-agent owners + priorities.
2. **Local stack**: native Postgres :5432 (12 schemas), Aspire 12/12 services healthy (:5101–:5112; CallbackService now boots under Aspire), admin :3000, Android emulator.
3. **qa-web API sweep**: 46 endpoints → 30 PASS / 16 FAIL (5 Critical). All failures EF↔DB divergence or wrong RBAC status mapping.
4. **Fix waves (3 backend rounds + 5 migrations)** — see below.
5. **Orchestrator visual browser sweep (Playwright)**: login → dashboard → loans → subscriptions → GST notices → ITR → reports → documents → team → callbacks KPI. All verified clean post-fix.
6. **qa-mobile Android sweep**: full app E2E on emulator-5554 → 11 findings (1 Critical), fixes dispatched.

## Fixes landed & re-verified live (API + browser)

| Original finding | Fix | Verified |
|---|---|---|
| WEB-01/02 GST notices + ITC 500 | EF column maps (org_id etc.), GENERATED column Ignore | 200 + page clean |
| WEB-03 Loans 500 | PartnerBank jsonb align + LoanProductConfiguration (round 2) | 200 + page clean |
| WEB-04 ITR filings 500 | Assessee/Filing remap + admin-wide org-scoped listing + DPDP cols (068) + reviewed_by_ca_id (069) | 200 + page clean |
| WEB-05 Subscriptions 500 | ToTable fixes + Subscription anonymization Ignore→067 cols | 200 + real MRR in UI |
| WEB-06 Reports 500 | ReportJob→report.report map | 200 + page clean |
| WEB-07/08 Notifications DLQ/celebrations 500 | DlqItem column maps + notification_event table (066) + real celebrations query | 200 |
| WEB-09/11 RBAC 400/500 + permission-name leak | Error.ToHttpResult() → 403 generic | 403/403/403 verified |
| WEB-10 + binding-500 class | 10 endpoints: required primitives → defaults/nullable+400 | 400 semantics verified |
| WEB-12 B15 buttons disabled | B15 endpoints (4 routes) + migration 065 + frontend wiring | Wired; RBAC-gated |
| WEB-13/14 i18n key + accounting 500 | key fix + accounting table remaps | 200 |
| Round-3: GST notices no-org 500, ITR admin list 400, /loans/kpi + /itr/filings/kpi 404, callback KPI range+shape, dashboard pending-count drift | All fixed (backend round 3 + frontend Zod normalize) | All 200; pages render |

**EF↔DB divergence class CLOSED**: EfSmoke test suites added for Gst(7)/Loan(9)/Subscription(5)/Itr(14) = 35 tests, all green; full backend unit suite 1,143 green. Migrations 065–069 applied + idempotent; replay drift found in 060/061 (declared but never landed locally) — covered idempotently by 066.

## Android findings (qa-mobile) — fix bundle dispatched to mobile-dev

Critical AND-08 (PrivacyCenterScreen crash — `items` optional chain) + AND-09 (crash exits app) + 9 Medium/Low (raw i18n keys in chat chips, missing doc filenames, wrong Language Settings route, icon/layout issues). Mobile baseline: jest 438/438 (infra debt fixed this session — was 16/40 suites).

## Other closures this session

- Specs: `docs/design/accessibility-standard.md` (2 regulatory blockers found AND fixed same-session: SR-accessible KFS/consent gates), `docs/design/design-elevation-spec.md` (S0–S7 slices).
- DevOps: Razorpay webhook secret slot, CI font-verify job, Razorpay activation runbook, PITR drill script, 26 SLO alert policies (apply blocked on gcloud auth → TL queue).
- Frontend: Settings real subscription stats (fabricated numbers removed), react-i18next fully removed (single i18n runtime, en/hi/bn 1611 keys each + CI parity test).
- Docs: `docs/api/endpoints.md` regenerated (all 12 services, Privacy/KFS/kpi routes, [MOCK-DEFAULT] markers, JWT claims + KFS locale rules).
- AI decision: `.claude/orchestrator/ai-service-architecture-decision.md` (unblocks GAP-030).
- DB: callback KPI MV audited org-safe (IST bucketing documented); DPDP anonymization column inventory complete.

## Open after this session (task board)

- #4 GAP-101 GSTN IMS (High, regulatory) · #5 GAP-100 MCA edit-log (High) · #9 GAP-030 AI P7a (High) · #14 GAP-102 IT Act 2025 schema (High-design)
- #22 iOS live sweep (after Android fixes land) · #23 DPDP coverage + SEC-056 + KPI IDOR test · #26 UX elevation implementation · #27 contract follow-ups · #29 MV vocab drift · #30 SLA % format
- #24 team-lead queue: CI billing, Firebase key rotation (GAP-001 still live), DPO, Razorpay webhook secret value, KYC creds, GAP-104 product decision, gcloud-auth operator steps (PITR drill + alert policies)

## Closing rounds (post-iOS)

- **iOS sweep** (iPhone 17 Pro / iOS 26.5, signed dev build): 10/10 Android-fix items PASS on iOS; 42 screenshots. Report: `.claude/qa/live-ios-sweep-2026-06-11.md`.
- **"Startup crash" resolved**: was a stale Metro bundle serving pre-fix PrivacyCenterScreen on Android — no second bug. Privacy API client now normalizes all consent payload shapes (items/consents/Consents) so the failure class is dead at the source. Mobile jest: 460/460.
- **IOS-02 root cause**: `GET /loans/products` did not exist in LoanService → implemented (list + by-id, shapes matched to mobile client), consents DTO served dual-shape additively (admin unaffected — verified no admin consumer). Backend suite: 1,185 green. Verified live: /loans/products 200, /auth/me/consents `{consents:[],items:[]}`.
- **Migration 070**: `loan.products.read` seeded + granted by mirroring `loan.eligibility.check` (ORG_ADMIN, SUPER_ADMIN). RBAC audience confirmed sufficient: the whole loan flow (incl. application.create) is ORG_ADMIN-tier, and mobile business owners are ORG_ADMIN of their org.
- **qa-web coverage round**: DPDP privacy coverage 58%→~84% (+21 tests); SEC-056 verdict WIRED (gap entry was stale); PermissionCatalog inactive-perm filtering confirmed intentional (+5 tests); callback-KPI IDOR integration tests PASS (Testcontainers, IST-boundary bucketing proven).
- IOS-03 (DPO card under tab bar) fixed with safe-area padding.

## Process notes

- `pkill -f <ServiceName>.Api` kills Aspire children too — use port-scoped kill for standalone diagnostics.
- Convention-mapped (no HasColumnName) properties are a distinct divergence class from explicit maps — both must be diffed (recipe in db memory).
