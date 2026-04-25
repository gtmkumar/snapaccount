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

## Initial Cloud Scheduler Jobs

All times are in IST (Asia/Kolkata, UTC+5:30). Provisioned in `infra/pubsub-scheduler-recurring-jobs.sh`.

| Job name | Schedule (IST) | Pub/Sub payload `job_type` | Description |
|---|---|---|---|
| `gst-deadline-check` | Daily 06:00 | `GST_DEADLINE_CHECK` | Query orgs with GST return due in 7/3/1 days; fan out D-7, D-3, D-1 notifications |
| `itr-deadline-reminders` | Daily 07:00 (May–Sept peak; year-round off-peak) | `ITR_DEADLINE_REMINDERS` | Query unverified ITR filings; fire e-verify reminders at Day 1/7/15/25/29 |
| `itr-refund-polling` | Daily 09:00 | `ITR_REFUND_POLLING` | Poll Income Tax portal for refund status changes on pending ITRs |
| `subscription-renewal-check` | Daily 08:00 | `SUBSCRIPTION_RENEWAL_CHECK` | Query orgs with subscription expiring in 7/3/1 days; send renewal push + email |

**Pub/Sub topic:** `snapaccount.recurring-jobs.due`

**Message payload schema (JSON):**
```json
{
  "job_type": "GST_DEADLINE_CHECK",
  "triggered_at": "2026-04-25T00:30:00Z",
  "source": "cloud-scheduler"
}
```

NotificationService handler switches on `job_type` and performs the database query +
fan-out for that job type. This single-topic / payload-discriminated approach keeps
Pub/Sub subscription count low and is easy to extend with new job types.

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
