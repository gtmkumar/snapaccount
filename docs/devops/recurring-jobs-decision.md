# Recurring Jobs Architecture Decision — Hangfire vs Cloud Scheduler

**Phase:** 6E (Notifications + Callbacks)
**Scope doc:** `.claude/orchestrator/phase-6E-scope.md` §devops-engineer item 1
**Decision date:** 2026-04-25
**Author:** devops-engineer
**Status:** DECIDED — Cloud Scheduler + Pub/Sub (Option B)

---

## Problem

Phase 6E requires recurring deadline reminder jobs for Indian compliance deadlines:

- **GST:** fire notification at D-7, D-3, D-1 before each return due date.
- **ITR:** e-verify reminders at Day 1, 7, 15, 25, 29 after filing until verified.
- **ITR refund polling:** poll Income Tax portal daily to detect refund status changes.
- **Subscription renewals:** notify users approaching subscription expiry daily.

The platform runs on **Google Cloud Run** — fully managed, serverless, scale-to-zero by default.
Two viable approaches were evaluated.

---

## Option A — Hangfire

Hangfire is a .NET-native recurring job library with a rich scheduling DSL, a built-in dashboard,
and support for CRON expressions. It is already present in AuthService for in-request background
continuations (Phase 5).

**Pros:**
- .NET-native — familiar to backend team, same language as the rest of the codebase.
- Rich scheduling DSL (CRON + named intervals + continuations).
- Dashboard at `/hangfire` for visibility into job history, retries, failures.
- Retry / backoff policies built in.
- Correlation with the .NET exception logging pipeline (Serilog / Cloud Logging).

**Cons:**
- **Requires at least one always-on instance** to process the background queue.
  Cloud Run with `min-instances=0` (scale-to-zero) will miss scheduled fires when no instance
  is running. NotificationService would need `min-instances=1`.
- `min-instances=1` costs approximately **$7–15/month** (1 vCPU / 512Mi, asia-south1)
  for an otherwise idle service — significant for a zero-budget launch phase.
- Hangfire stores job state in PostgreSQL. For SnapAccount's schema-per-service pattern,
  this adds the `hangfire` schema to the shared PostgreSQL instance, increasing coupling.
- Hangfire job processing competes with request-handling CPU on the same Cloud Run instance,
  increasing tail latency under load.
- Cloud Run has a **60-minute request timeout** — Hangfire's server loop must be kept alive
  via long-poll requests, which is non-trivial on Cloud Run without workarounds.
- More moving parts: Hangfire server + PostgreSQL job storage + dashboard auth.

**Verdict:** Viable only if NotificationService requires `min-instances=1` for other reasons
(e.g., real-time SignalR). In SnapAccount's current architecture, it does not.

---

## Option B — Cloud Scheduler + Pub/Sub (RECOMMENDED)

Cloud Scheduler is a fully managed, serverless CRON job service on GCP. Each job publishes
a message to a Pub/Sub topic on schedule. NotificationService (or any subscriber) processes
the message — it is woken from scale-zero only when work arrives.

**Architecture:**

```
Cloud Scheduler (CRON)
       │  publishes message with job-type payload
       ▼
Pub/Sub topic: snapaccount.recurring-jobs.due
       │  push subscription (or pull)
       ▼
NotificationService Cloud Run (wakes from scale-zero)
       │  dispatches fan-out per affected orgs/users
       ▼
FCM / MSG91 / SendGrid
```

**Pros:**
- **Scale-to-zero compatible.** NotificationService wakes on demand; no `min-instances=1`
  required for scheduling. Cloud Run handles the cold-start (typically < 2s for .NET AOT
  or published .NET 10 binaries).
- **Free tier:** 3 jobs/month free, then $0.10/job/month. Initial 4 jobs = $0.10/month
  after free tier — effectively free at launch scale.
- **GCP-IAM managed.** OIDC token on scheduler → Pub/Sub requires no application-level
  auth code. Service accounts handle it.
- **Decoupled.** Scheduler → Pub/Sub → subscriber is loosely coupled. NotificationService
  can be replaced or scaled independently.
- **Retry handled by Pub/Sub.** Messages are retried with exponential backoff if
  NotificationService returns a non-2xx acknowledgement. Dead-letter topic captures
  messages that exhaust retries (14-day retention per `infra/setup.sh` pattern).
- **No PostgreSQL schema additions.** Job state lives in Pub/Sub, not in the database.
- **Auditability.** Cloud Scheduler logs every job invocation to Cloud Logging.

**Cons:**
- **CRON granularity only** — minimum interval is 1 minute. GST D-7/D-3/D-1 reminders
  are date-relative, so the handler must query which orgs have deadlines on today's date.
  The scheduler fires the job daily; the handler does the date math. This is correct and
  is the standard pattern for deadline-relative notifications.
- **No built-in dashboard.** Job history is in Cloud Logging / Cloud Monitoring, not a
  dedicated UI. For SnapAccount's scale (SME, India), this is acceptable.
- **Cold start on first wake.** For a daily 06:00 IST job, NotificationService will cold-start
  if it has been idle. .NET 10 published binaries cold-start in < 3s on Cloud Run 1 vCPU.
  The notification fan-out itself is async, so cold-start delay is invisible to users.
- **Hangfire stays for continuations.** In-request background continuations (e.g., send OTP
  after user registration in AuthService) continue to use Hangfire — this is correct use of
  Hangfire on Cloud Run (short-lived, fire-and-forget, bounded by the request lifetime).

---

## Decision: Option B — Cloud Scheduler + Pub/Sub

Cloud Scheduler + Pub/Sub is the correct choice for SnapAccount's current infrastructure.
Scale-to-zero on Cloud Run is a cost constraint for the launch phase. Hangfire is retained
**only** for in-request background continuations where it is already in use (AuthService).
Hangfire must NOT be used for recurring jobs in NotificationService.

If the team later requires sub-minute precision or complex job chaining, this decision
should be revisited — but CRON granularity is sufficient for all Indian compliance
deadline use cases (GST, ITR, subscription).

---

## Full Cloud Scheduler Job Matrix

> **Last updated:** 2026-06-10 (Phase 7 Wave 2 — D5, GAP-012 / GAP-042)
>
> All times are **IST (Asia/Kolkata, UTC+5:30)**. Provisioned in `infra/pubsub-scheduler-recurring-jobs.sh`.

**Pub/Sub topic:** `snapaccount.recurring-jobs.due`

**Message payload schema (JSON):**
```json
{
  "job_type": "GST_DEADLINE_CHECK",
  "triggered_at": "2026-04-25T00:30:00Z",
  "source": "cloud-scheduler"
}
```

NotificationService / CallbackService handlers switch on `job_type`.

---

### Phase 6 Jobs (active)

| Job name | Cron (IST) | `job_type` payload | Target Service | Backend endpoint / handler | Idempotency | Notes |
|---|---|---|---|---|---|---|
| `gst-deadline-check` | `0 6 * * *` (daily 06:00) | `GST_DEADLINE_CHECK` | NotificationService → GstService | `GstDeadlineCheckHandler` — queries `gst.gst_returns` for returns due in 7/3/1 days; emits D-7/D-3/D-1 push + SMS per org | One notification per (org, return_type, due_date, days_before) per day via dedup cache | Phase 6B |
| `itr-deadline-reminders` | `0 9 * * *` (daily 09:00) | `ITR_DEADLINE_REMINDERS` | NotificationService → ItrService | Backend gates on filing season (May–Sept); queries unverified filings; fires e-verify reminders at **Day 1 / 7 / 15 / 25 / 29** after filing date | One reminder per (filing_id, day_slot) per day | Phase 6D; Day-25 also creates an auto-callback (plan G8.1) — PENDING-B19 |
| `itr-refund-polling` | `0 10 * * *` (daily 10:00) | `ITR_REFUND_POLLING` | ItrService | Mock `ItrRefundPollingHandler` (keep behind flag — GAP-042); polls IT portal for refund status changes | Idempotent — only notifies on status change | Phase 6D; real IT portal integration is ERI registration scope |
| `subscription-renewal-check` | `0 8 * * *` (daily 08:00) | `SUBSCRIPTION_RENEWAL_CHECK` | SubscriptionService → NotificationService | Queries `subscription.subscriptions` for orgs expiring in 7/3/1 days; sends renewal push + email | One notification per (org, expiry_date, days_before) per 6h (dedup) | Phase 6E |

---

### Phase 7 Wave 2 Jobs (new — D5)

| Job name | Cron (IST) | `job_type` payload | Target Service | Backend endpoint / handler | Auth | Idempotency | Status |
|---|---|---|---|---|---|---|---|
| `callback-kpi-mv-refresh` | `30 0 * * *` (daily 00:30) | `CALLBACK_KPI_MV_REFRESH` | CallbackService | `POST /callbacks/internal/refresh-kpi-mv` — executes `REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot` | OIDC (service account `cloud-scheduler-sa`) | MV REFRESH is idempotent; safe to re-run | **PENDING-B19** (backend Wave 3 must implement the internal endpoint) |
| `gst-pre-deadline-callback` | `0 7 * * *` (daily 07:00) | `GST_PRE_DEADLINE_CALLBACK` | CallbackService | `POST /callbacks/internal/gst-pre-deadline` — queries GstService for unapproved returns due in ≤2 days; creates callback records (priority=HIGH) | Pub/Sub subscription | `INSERT ... ON CONFLICT (org_id, return_period, callback_type, day_key) DO NOTHING` | **PENDING-B19** |
| `itr-form16-missing` | `0 11 * * *` (daily 11:00) | `ITR_FORM16_MISSING` | NotificationService + CallbackService | Checks salaried users with no Form 16 uploaded > 3 days after June 15; creates callback + sends push | Pub/Sub subscription | One alert per (user_id, assessment_year) per day | **PENDING-B19**; gate: only active June 15 – July 31 |

---

### GST 7/3/1-Day Reminder Detail

The `gst-deadline-check` job covers all GST deadline reminder use cases in a single daily fan-out:

| Reminder | Trigger | Return types | Channel |
|---|---|---|---|
| D-7 | 7 days before due date | GSTR-1, GSTR-3B, GSTR-9, GSTR-9C | Push + SMS |
| D-3 | 3 days before due date | GSTR-1, GSTR-3B | Push + SMS + Email |
| D-1 | 1 day before due date | GSTR-1, GSTR-3B | Push + SMS + Email (high urgency) |

Monthly GSTR-1 due date: 11th of month. GSTR-3B due date: 20th. Quarterly variants: as per QRMP scheme.

---

### ITR E-Verify Reminder Cadence

The `itr-deadline-reminders` job handles all e-verify reminder steps:

| Day after filing | Message | Channel | Special action |
|---|---|---|---|
| Day 1 | "Your ITR has been filed! Please e-verify within 30 days to complete the process." | Push | — |
| Day 7 | "7 days passed — e-verify your ITR return now to avoid it being treated as not filed." | Push + SMS | — |
| Day 15 | "Half the e-verify window has passed (15/30 days). E-verify your ITR immediately." | Push + SMS + Email | — |
| Day 25 | "Only 5 days left to e-verify. Urgent action required." | Push + SMS + Email | **Auto-callback created** (plan G8.1, priority=URGENT) — PENDING-B19 |
| Day 29 | "FINAL REMINDER: 1 day left to e-verify your ITR (Day 29 of 30)." | Push + SMS + Email | — |

All reminders: gated on `itr.verification_queue.status NOT IN ('VERIFIED', 'WITHDRAWN')`.

---

### Subscription Renewal Reminder Detail

| Days to expiry | Message | Channel |
|---|---|---|
| 7 days | "Your SnapAccount subscription expires in 7 days. Renew to keep filing GST and ITR." | Push + Email |
| 3 days | "3 days left — renew your subscription now to avoid service interruption." | Push + Email + SMS |
| 1 day | "URGENT: Your subscription expires tomorrow. Renew immediately." | Push + SMS + Email (high urgency) |

---

### Callback KPI MV Refresh (P6-HANDOFF-07)

The `callback-kpi-mv-refresh` job fires at 00:30 IST (after midnight) to refresh the
`callback.kpi_daily_snapshot` materialized view for the previous day's data:

```sql
-- Executed by CallbackService internal endpoint:
REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;
```

**Why CONCURRENTLY?**
The `kpi_daily_snapshot` MV has a unique index on `(org_id, snapshot_date)` (confirmed by
Wave 1 migration 061). `CONCURRENTLY` allows reads during refresh — the admin `/callbacks/kpi`
endpoint remains responsive while the MV updates. Without `CONCURRENTLY`, the MV locks for
the duration of the refresh (unacceptable during business hours).

**Why 00:30 IST?**
- Midnight (00:00) is often when scheduled tasks from other services run simultaneously.
- 00:30 provides a 30-minute offset to reduce resource contention on the DB.
- The MV snapshots `snapshot_date = CURRENT_DATE - 1` so yesterday's data is complete.

**PENDING-B19 implementation notes for backend-agent:**
- Create `POST /callbacks/internal/refresh-kpi-mv` (no Firebase auth — OIDC from Scheduler).
- The endpoint should verify the OIDC token's service account is `cloud-scheduler-sa`.
- Execute `REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot` in a `try/catch`.
- On success: return HTTP 200 with `{ "refreshed_at": "...", "rows_updated": N }`.
- On failure: return HTTP 500; Pub/Sub will retry (max 3 attempts, 30s/5m/10m backoff).
- Add a short-circuit: if `snapshot_date = CURRENT_DATE - 1` rows already exist with
  `updated_at > NOW() - INTERVAL '23 hours'`, skip and return 200 (idempotency guard).

---

## Hangfire Boundary (allowed use cases only)

Hangfire REMAINS in use for:
- **AuthService:** post-registration welcome email / OTP resend background fire (Phase 5,
  already implemented). This is a fire-and-forget continuation bounded by the request.
- **Any service:** short-lived (< 5 min) background continuations triggered within a request.

Hangfire MUST NOT be used for:
- Recurring scheduled jobs (use Cloud Scheduler instead).
- Long-running polling loops (use Cloud Run Jobs or Cloud Scheduler instead).
- Any job requiring `min-instances=1` to guarantee execution.

---

## References

- [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing)
- [Cloud Scheduler + Pub/Sub pattern](https://cloud.google.com/scheduler/docs/tut-pub-sub)
- [Cloud Run scale-to-zero and min-instances](https://cloud.google.com/run/docs/configuring/min-instances)
- [Hangfire on Cloud Run — known limitations](https://docs.hangfire.io/en/latest/deployment-to-production/making-aspnet-app-always-running.html)
