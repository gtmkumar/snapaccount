# SnapAccount — Gap Analysis Tier-3 Blind-Spots (2026-06-28)

> Supplement to `gap-analysis-2026-06-10.md` + `gap-analysis-2026-06-11-delta.md`.
> Source: a verified current-state audit on branch `feature/repository-refactor` (the 12→3
> composite consolidation). The audit confirmed the refactor preserved all Phase 7 work
> (build green, all modules + migrations 060–089 present) and that the documented High gaps
> are closed-and-present. This doc records **spec/compliance blind-spots that were never
> tracked under any GAP-/NEW- id**, found by reading the project brief against the code.
> IDs continue at GAP-112+.

---

## A. Fixed in this pass

### GAP-112 — API Gateway had no edge rate limiting — **High** → ✅ FIXED
- **Issue:** `project-brief.md §6` lists "Rate limiting at gateway level" as a core gateway
  responsibility (and the shared-entity list includes `ApiRateLimit`), but
  `backend/Services/Gateway/Program.cs` was a bare YARP proxy — the only rate limits in the
  system were the per-endpoint OTP limits inside the composites (SEC-011). The platform's
  single entry point had no flood/abuse protection.
- **Fix (this pass):** added a global per-client-IP **sliding-window** limiter
  (`AddRateLimiter` + `UseRateLimiter` before `MapReverseProxy`), config-driven via
  `RateLimiting:*` (default 600 req / 60 s / IP, 6 segments, no queue → 429 with
  `Retry-After`). `/healthz` + Aspire liveness are exempt. Added `ForwardedHeaders`
  (XForwardedFor/Proto, cleared known-proxies) so partitioning uses the real client IP
  behind Cloud Run / GCLB, not the proxy hop. Files: `Gateway/Program.cs`,
  `Gateway/appsettings.json`. Builds clean.
- **Follow-up (not blocking):** consider an authenticated-subject partition (org/user) in
  addition to IP for fairer limits behind shared NAT; add a tighter named policy on
  `/auth/*` at the edge; integration test once a gateway test harness exists. Note: trusting
  X-Forwarded-For unconditionally is correct behind GCLB (Google appends it) but would allow
  spoofing if the gateway is ever exposed without that proxy — keep it behind the LB.

---

## B. Partition maintenance — migration delivered; scheduler wiring filed for devops

### GAP-113 — No partition-maintenance job for the monthly-partitioned tables — **Medium** → migration ✅ DONE
- **CORRECTION (2026-06-28):** an earlier draft of this doc called this an *acute 2027
  hard-fail* on the claim that `document.document` had no DEFAULT partition. **That was wrong**
  — migration 002 line 101 creates `document.document_default` and migration 008 line 160
  creates `notification.notification_default`. **Both tables have DEFAULT partitions, so
  inserts NEVER hard-fail.** (The false claim came from a `grep | tail -20` that truncated past
  the default-partition line.)
- **Real issue:** both tables seed monthly partitions only through **2026-12**, and migration
  002's own comment promised a scheduled partition job that was **never built**. Without it,
  every row after 2026-12 lands in the single DEFAULT partition, which (a) defeats partition
  pruning + month-granular retention drops, and (b) eventually **blocks** adding a proper
  partition for that month — Postgres refuses to split a default partition that already holds
  matching rows. So it is a *degradation that worsens over time*, not an outage.
- **Done this pass — migration `090_partition_maintenance.sql`:**
  1. `public.create_monthly_partitions(schema, table, months_ahead)` — idempotent PL/pgSQL
     helper; creates current + N upcoming monthly partitions, skips existing ones, and catches
     the "default partition already holds matching rows" case (RAISE NOTICE, never aborts).
  2. Pre-creates **all of 2027** for both tables (`CREATE TABLE IF NOT EXISTS … PARTITION OF`,
     replay-safe).
  - Verified on a throwaway DB: clean apply + idempotent re-apply; 12/12 2027 partitions;
    a 2027-dated insert routes to its monthly partition (not default); out-of-range insert
    falls back to default; new partitions auto-inherit parent indexes; the function's
    exception path is exercised.
- **Scheduler wiring — also DONE this pass:** monthly Cloud Scheduler job `partition-maintenance`
  (`0 2 1 * *` IST) → Pub/Sub `PARTITION_MAINTENANCE` → dedicated subscriptions
  `finance-partition-maintenance-sub` / `platform-partition-maintenance-sub`, each consumed by a
  `PartitionMaintenanceSubscriber` (shared infra) that resolves a per-composite
  `IPartitionMaintenanceHandler` running `create_monthly_partitions` for its owned table
  (Finance → document.document, Platform → notification.notification). Added to
  `infra/pubsub-scheduler-recurring-jobs.sh`; backend builds clean; Document (60) + Notification
  (114) suites green. The script is idempotent; it runs against GCP at deploy time.
- **Retention (detach+drop) — also DONE this pass, OFF by default:** migration
  `091_partition_retention.sql` installs `public.drop_old_partitions(schema, table, retain_months)`
  (default 84 months). The monthly handler calls it only when
  `PartitionMaintenance:RetentionEnabled=true` (default false); it never touches the DEFAULT
  partition and skips partitions with dependent rows (NOTICE, no cascade/abort) — throwaway-DB
  verified (old dropped, FK/view-blocked partition skipped, default+recent kept, idempotent).
  ⚠️ document.document is FK-referenced + has an archive/GCS-purge path → reconcile before enabling;
  notification.notification is the natural candidate.
- **Remaining (deploy-time devops only):** run `infra/pubsub-scheduler-recurring-jobs.sh` against
  the GCP project (creates the job + subscriptions; needs project + gcloud auth — a TL/deploy gate)
  and do a per-table review before flipping `RetentionEnabled` on. **Owner:** devops-engineer.
  **Priority: Low** (all code/SQL shipped; only cloud execution + an ops decision remain).

---

## C. Filed — smaller / documentation

### GAP-114 — No gateway request/response logging or correlation-id propagation — **Medium** → ✅ FIXED (2026-06-28)
- `project-brief.md §6` lists "Request/response logging" as a gateway responsibility.
  `Gateway/Program.cs` had none — no access log, no correlation-id minted/propagated to the
  composites. Per-service OpenTelemetry exists, but there was no single edge audit/forensic
  trail tying a client request to its downstream fan-out.
- **Fix (this pass):** added correlation-id middleware in `Gateway/Program.cs` that mints an
  `X-Correlation-Id` (or honours an inbound one), echoes it on the response, and emits one
  structured access-log line per request (method / path / status / latency / client-IP / cid).
  Registered first so it wraps the rate limiter → throttled (429) requests are logged + correlated
  too. A YARP `AddRequestTransform` stamps the (possibly minted) id onto every proxied request so
  the composites' OpenTelemetry traces share the same `X-Correlation-Id`. Gateway builds clean.
- **Follow-up (not blocking):** composites could enrich their Serilog scope from the inbound
  `X-Correlation-Id`; consider sampling/structured-sink config for the edge access log in prod.

### GAP-115 — No disaster-recovery plan (RPO/RTO, multi-region, Cloud SQL failover) — **Medium** → ✅ DONE (plan; 2026-06-28)
- Risk register (`project-brief.md §15`) names "GCP region outage" with only a vague
  "multi-region failover consideration" — never converted to a tracked plan. A
  `backup-restore-runbook` exists but the first PITR restore drill was never executed
  (see NEW-D05). For a financial system under DPDP retention, untested restorability + no
  RPO/RTO targets is a real continuity gap.
- **Done (this pass):** authored `docs/devops/disaster-recovery.md` — per-tier RPO/RTO targets
  (Tier-0 DB RPO ≤ 5 min / RTO ≤ 1 h), Cloud SQL HA (zone) + `asia-south2` cross-region read-replica
  promotion (region) staying India-only for DPDP localization, GCS dual-region for Tier-1 buckets,
  Redis/Pub/Sub posture, a step-by-step region-loss failover + failback runbook, and a drill
  matrix that wires the PITR pass-bar to these targets. The plan is "not done" until the first
  PITR drill report (NEW-D05) is filed.
- **Remaining (deploy-time / TL-gated):** provision the `asia-south2` replica, confirm/convert
  Tier-1 buckets to dual-region + cross-region backup export, and execute the first PITR + tabletop
  failover drills. **Owner:** devops-engineer. **Priority: Low** (plan shipped; only cloud execution remains).

### GAP-116 — No mobile force-update / minimum-supported-version kill-switch — **Medium** → ✅ FIXED (2026-06-28)
- `mobile/app.json` + the gap docs had no force-update, minimum-version gate, or remote
  kill-switch. For a fintech app that must push security fixes (e.g. TLS-pin rotation, GAP-006)
  and retire vulnerable client versions, this is operationally important.
- **Fix (this pass) — backend:** anonymous `GET /app/min-version?platform=&version=` (PlatformService,
  config-driven `AppVersion:{Ios|Android}:*`, MediatR `GetAppVersionPolicyQuery` mirroring the
  privacy-contact config-endpoint pattern). Server computes `updateRequired` (current < floor) +
  `updateAvailable` (current < latest); **fail-open** — unknown platform / unparseable version never
  blocks. New gateway route `platform-app` (`/app/{**catch-all}` → platform). 13 unit tests.
- **Fix (this pass) — mobile:** `src/api/appVersion.ts` client (fail-open, 6 s timeout) +
  `ForceUpdateGate` wrapping `RootNavigator` in `App.tsx`: `updateRequired` → non-dismissible
  full-screen block with store-link CTA; `updateAvailable` → dismissible nudge banner; else (or any
  error) renders children. i18n `mobile.appUpdate.*` added en/hi/bn (parity preserved). 3 component tests.
- **Verified:** backend builds 0 err, AuthService 793 (+13); mobile type-check/lint clean, jest 862 (+3, +1 suite).
- **Follow-up (TL):** set production `AppVersion:*` floors per release; optionally back with Firebase Remote Config.

---

## D. Tier-2 items closed alongside this audit (code, not docs)

- **GAP-110 (loan fraud gate) — wired & tested.** `RunFraudChecksCommand`/`FraudCheck`
  existed but no submit/package handler invoked them (no-op gate). `SubmitApplicationCommandHandler`
  now enforces it: a latest-verdict-per-check-type **Fail always blocks** submission (422),
  and `FraudCheck:EnforceOnSubmit` (soft-launch flag, default false) additionally requires the
  pre-check to have been run. 5 new tests; 171 loan tests green.
- **NEW-D17 (QuestPDF Indic fonts) — registration wired & tested.** The Dockerfile *downloads*
  Inter + Noto Devanagari/Bengali into `/app/fonts` at build time, but nothing ever called
  `FontManager.RegisterFont`, so they were unused → Hindi/Bengali PDFs rendered tofu even in
  prod. Added `QuestPdfFontConfig.RegisterBundledFonts` (idempotent, no-throw, env/config
  path-resolved), wired into `AddReportInfrastructure`; QuestPDF 2024.3+ automatic glyph
  fallback handles the rest. 3 new tests; 55 report tests green.

---

## E. Priority roll-up (this doc)

| Priority | Items |
|---|---|
| **High** | GAP-112 (✅ fixed — gateway rate limiting) |
| **Medium** | GAP-113 (✅ migration + scheduler wiring done; deploy → devops), GAP-114 (✅ fixed — gateway logging + correlation-id), GAP-115 (✅ DR plan written; replica/drill → devops), GAP-116 (✅ fixed — mobile force-update gate) |

> **2026-06-28 update:** GAP-114 and GAP-116 are fully closed in code (gateway + PlatformService + mobile, all tests green); GAP-115's DR plan is written (`docs/devops/disaster-recovery.md`) with only deploy-time replica provisioning + the first drill remaining. **All tier-3 items are now either fixed or down to deploy-time/TL-gated execution — no delegable code work remains in this supplement.**

> Correction log: GAP-113 was briefly mis-rated **High/acute** on a false "no default partition → 2027 hard-fail" reading; both tables have DEFAULT partitions, so it is a Medium degradation issue, not an outage.

*End of Tier-3 supplement.*
