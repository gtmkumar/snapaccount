# SnapAccount — Handoff: Tier-3 tail closed + full green re-verify

> **Date:** 2026-06-29
> **Author:** Claude Opus 4.8 (1M context)
> **Branch:** `feature/repository-refactor`
> **Head:** `e92b122` (pushed to `origin`)
> **PR:** https://github.com/gtmkumar/snapaccount/pull/41 → `main` (open)
> **Status:** All delegable code complete & verified green. Remaining queue is entirely **TL-gated / deploy-time**.

---

## TL;DR

The 3-composite refactor branch is feature-complete. The **104-gap doc-vs-implementation remediation**
(4 waves, migrations through 109) was already committed; this session **re-verified the whole tree green**
and **closed the last 3 delegable tier-3 items** (GAP-114/115/116). Everything that remains in the project
now requires credentials, a GCP project, or a TL decision — there is no further code I can ship without those.

---

## What was done this session

| Item | Type | What shipped |
|---|---|---|
| **GAP-114** | Gateway (backend) | Request access-logging + `X-Correlation-Id` mint-or-honour middleware in `Gateway/Program.cs` (registered before the rate limiter, so 429s are logged + correlated too); YARP `AddRequestTransform` propagates the id downstream to the composites. |
| **GAP-116** | Backend + Mobile | Anonymous, config-driven `GET /app/min-version?platform=&version=` (`GetAppVersionPolicyQuery`, `AppVersion:{Ios\|Android}:*` config; server computes `updateRequired`/`updateAvailable`; **fail-open** on bad input). New gateway route `platform-app` (`/app/{**catch-all}`→platform). Mobile `src/api/appVersion.ts` (fail-open, 6 s timeout) + `ForceUpdateGate` wrapping `RootNavigator` in `App.tsx` (hard block / dismissible nudge) + i18n `mobile.appUpdate.*` en/hi/bn. |
| **GAP-115** | Docs (devops) | `docs/devops/disaster-recovery.md` — per-tier RPO/RTO, Cloud SQL HA + `asia-south2` cross-region replica failover (India-only for DPDP localization), GCS dual-region, failover/failback runbook, drill matrix. |

Tracking updated: `.claude/orchestrator/status.md` + `gap-analysis-2026-06-28-tier3.md` (all marked closed).

---

## Verification (all green, this session)

- **Backend:** builds **0 errors**; all 12 unit suites green — Auth **793** (+13 new), Gst 217, Chat 199,
  Loan 171, Notif 114, Sub 110, Itr 80, Doc 60, Acct 60, Ai 98, Report 55, Callback 35 (**1,992 total**).
- **Admin:** lint clean, build clean, vitest **1,105/1,105**.
- **Mobile:** type-check clean, lint clean, jest **95 suites / 862 tests** (+1 suite, +3 new).
- 104-gap remediation confirmed committed: **1,541 files vs `main`**, migrations → 109.

---

## ⚠️ Gotchas for the next session (cost me time — don't repeat)

1. **Test projects live at repo-root `tests/unit/<Svc>/` and `tests/integration/<Svc>/`, NOT under `backend/`.**
   A test file written under `backend/tests/...` is compiled by *nothing* and silently never runs.
   (Caught it because the AuthService count didn't move.)
2. **`cd backend && dotnet test` runs ZERO tests** — the backend `.slnx` doesn't include the test projects.
   Run them per-service: `dotnet test tests/unit/<Svc>/<Svc>.Tests.csproj`.
3. **Some sandbox `mv`/`rm` calls are denied** — write to the correct path the first time; use `rm` with a
   specific file path (not `rm -rf <dir>` from root) if cleanup is needed.

---

## What remains — ALL TL-gated / deploy-time (no delegable code left)

- **Credentials & secrets:** Firebase service-account key **rotation** (GAP-001, leaked key), Razorpay
  webhook secret, KYC sandbox creds, Play Integrity / App Attest creds + GCP project number (activates
  real GAP-064 device attestation — needs a fresh mobile dev build).
- **Decisions:** GAP-104 invoicing decision (gates 105/109), GAP-073 bank pilots (gates 039), DPO appointment.
- **Deploy-time infra (devops, needs GCP project + `gcloud` auth):**
  - Run `infra/pubsub-scheduler-recurring-jobs.sh` (GAP-113 partition-maintenance + recurring jobs).
  - Provision `asia-south2` Cloud SQL cross-region read replica; convert Tier-1 GCS buckets to dual-region;
    export Cloud SQL backups cross-region (GAP-115).
  - Execute the first **PITR drill** (NEW-D05) + tabletop failover; file reports in `docs/devops/drill-reports/`.
  - Per-release: set production `AppVersion:{Ios|Android}:*` floors (GAP-116 operating lever).
- **CI billing** (GitHub Actions minutes) so the pipeline can run on PRs.

---

## How to pick up

1. **If `main` merge is approved:** merge PR #41, then the new baseline for any future audit is the
   3-composite layout with migrations → 109.
2. **For the next code task:** the tree is green; run the per-surface gates above before/after any change.
3. **For deployment:** work the TL-gated list top-down — credentials first (they unblock real verification
   of KYC/attestation/payments), then the devops infra-provisioning items.

Run commands: backend per-service `dotnet test tests/unit/<Svc>/...`; admin `cd src/admin && npm run lint && npm run build && npx vitest run`; mobile `cd mobile && npm run type-check && npm run lint && npx jest`.
