# Observability — SLOs and Dashboards

**Phase:** 6F  
**Owner:** devops-engineer  
**Last updated:** 2026-04-25

---

## Overview

SnapAccount uses the **RED method** for service-level observability:

- **R**ate — requests per second (overall throughput)
- **E**rrors — 5xx responses per second (server-side failure rate)
- **D**uration — request latency percentiles (p50, p95, p99)

Metrics source: **Cloud Run built-in metrics** via `run.googleapis.com/*` metric types. No custom instrumentation required — Cloud Run emits these automatically.

Dashboards and alert policies are provisioned by `infra/cloud-monitoring-dashboards.sh`.

---

## SLO Targets by Service

SLOs are defined as **p95 latency** and **error rate** thresholds. These targets reflect the operational characteristics of each service (I/O intensity, external API dependencies, document generation overhead).

| Service | p95 Latency | Error Rate | Rationale |
|---|---|---|---|
| auth-service | < 500ms | < 0.1% | Token validation / Firebase OTP — user-blocking; must be fast |
| document-service | < 2000ms | < 0.5% | GCS upload + Document AI OCR pipeline; 2s accounts for GCS write latency |
| chat-service | < 200ms | < 0.1% | Real-time messaging; 200ms is the perceptible threshold for interactive chat |
| accounting-service | < 800ms | < 0.5% | Journal entry writes + ledger queries; 800ms allows for complex report queries |
| gst-service | < 1000ms | < 0.5% | GSTN API calls are ~500ms; 1000ms leaves room for retry + validation |
| loan-service | < 2000ms | < 0.5% | Partner bank API calls + credit scoring; external dependency budget |
| itr-service | < 2000ms | < 0.5% | IT Portal API + Document AI Form 16 OCR pipeline |
| notification-service | < 300ms | < 0.1% | Async dispatch; 300ms is max acceptable delay before push/SMS feels laggy |
| report-service | < 5000ms | < 1.0% | QuestPDF generation (amortisation schedules, GST returns) is CPU-intensive |
| subscription-service | < 500ms | < 0.1% | Razorpay webhook processing; must be fast to avoid Razorpay retries |
| ai-service | < 5000ms | < 1.0% | Vertex AI / Gemini inference; LLM calls are inherently high-latency |
| callback-service | < 500ms | < 0.5% | Callback scheduling + status updates; not user-blocking |

### SLO measurement windows

- **Alerting window:** 5 minutes (alignment period), alert fires after 2 consecutive violations (10 min total).
- **Reporting window:** 30-day rolling window for monthly SLO reports.
- **Error budget:** 99.9% availability target for critical services (auth, chat, notification, subscription). 99.5% for others.

---

## Metrics Reference

### Rate

```
resource.type="cloud_run_revision"
metric.type="run.googleapis.com/request_count"
aggregation: ALIGN_RATE over 60s, grouped by response_code_class
```

### Errors (5xx)

```
resource.type="cloud_run_revision"
metric.type="run.googleapis.com/request_count"
metric.labels.response_code_class="5xx"
aggregation: ALIGN_RATE over 60s
```

### Duration (latency)

```
resource.type="cloud_run_revision"
metric.type="run.googleapis.com/request_latencies"
aggregation: ALIGN_PERCENTILE_95 over 60s
```

### Supporting metrics (in per-service dashboards)

| Metric | Description |
|---|---|
| `run.googleapis.com/container/instance_count` | Active instance count (scaling visibility) |
| `run.googleapis.com/container/cpu/utilizations` | Container CPU utilization (scale trigger) |
| `run.googleapis.com/container/memory/utilizations` | Memory pressure (OOM risk) |

---

## Dashboard Structure

Each microservice has a dedicated 6-tile dashboard (2 rows x 3 columns):

| Row 1 | | |
|---|---|---|
| Request Rate (req/s) | Error Rate (5xx/s) | p50 / p95 / p99 Latency |

| Row 2 | | |
|---|---|---|
| Instance Count | CPU Utilization | Memory Utilization |

An aggregate **SnapAccount Overview** dashboard shows all services on a single page for cross-service comparison (rate, error rate, p95 latency — one chart each with per-service series).

### Accessing dashboards

```
https://console.cloud.google.com/monitoring/dashboards?project=<GCP_PROJECT_ID>
```

Dashboards are named: `SnapAccount — <Service Name> (production|staging)`

---

## Alert Policies

Two alert types per service (provisioned by `infra/cloud-monitoring-dashboards.sh`):

1. **Latency alert** — fires when p95 latency exceeds the threshold in the SLO table above for 10 consecutive minutes.
2. **Error rate alert** — fires when 5xx request rate exceeds 0.1 req/s for 10 consecutive minutes.

Alerts notify `devops@snapaccount.in` (override via `ALERT_EMAIL` env var before running the script).

### Recommended: Cloud Monitoring Availability SLO

For production, configure Cloud Monitoring's native **SLO feature** (GCP Console → Monitoring → SLOs) for more accurate error-ratio measurement:

1. Create a **Request-based SLO** (Availability) for each service.
2. Good requests: `response_code_class != "5xx"`.
3. Target: 99.9% (auth, chat, notification, subscription) or 99.5% (others).
4. Alert on **burn rate** (error budget consumption rate) rather than raw thresholds.

The `cloud-monitoring-dashboards.sh` script creates threshold-based alerts as a baseline. Upgrade to burn-rate alerts for production oncall coverage.

---

## SignalR / Chat-specific metrics

ChatService has additional observability requirements due to WebSocket connections:

| What to monitor | How |
|---|---|
| Active WebSocket connections | Custom metric: emit `signalr.connections.active` gauge from ChatService (backend-agent). Use `AddMetrics` + OpenTelemetry exporter to Cloud Monitoring. |
| Redis backplane latency | StackExchange.Redis profiling (backend-agent). Log slow commands > 100ms. |
| Typing indicator presence key count | Redis `DBSIZE` or `SCAN` with `presence:*` pattern (ops script). |
| Message fan-out failures | Log `IHubContext.Clients.Group(...).SendAsync` failures and emit a custom error counter. |

---

## Pub/Sub message lag (supplemental)

For services that consume Pub/Sub (all 12 services), monitor:

```
pubsub.googleapis.com/subscription/oldest_unacked_message_age
```

Alert if oldest unacked message age exceeds:
- notification-service subscriptions: > 60 seconds (SMS/push delay impact)
- other subscriptions: > 300 seconds (5 minutes)

Configure via GCP Console → Monitoring → Alert Policies → Add Condition → Pub/Sub metric.

---

## Related files

- `infra/cloud-monitoring-dashboards.sh` — provision dashboards + alert policies
- `infra/setup.sh` — Step 12: notification channel setup
- `docs/devops/signalr-backplane-decision.md` — ChatService Redis + SignalR architecture
- `docs/devops/backup-restore-runbook.md` — operational runbook (quarterly drill)
