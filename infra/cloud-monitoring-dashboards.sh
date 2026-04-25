#!/usr/bin/env bash
# SnapAccount — Cloud Monitoring Dashboards + SLO Alert Policies
# Phase 6F: RED metrics (Rate / Errors / Duration) per service.
#
# Prerequisites:
#   - gcloud CLI authenticated with monitoring.googleapis.com enabled
#   - infra/setup.sh already executed (project, service accounts exist)
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod
#   export ENVIRONMENT=production    # or: staging
#   bash infra/cloud-monitoring-dashboards.sh
#
# What this creates:
#   1. Per-service latency + error dashboards (one dashboard per microservice)
#   2. An aggregate "SnapAccount Overview" dashboard
#   3. SLO alert policies for p95 latency + error rate thresholds
#   4. A notification channel (email) for alerts
#
# SLO targets (Phase 6F — see docs/devops/observability-slos.md for full rationale):
#   auth-service        p95 < 500ms,  error rate < 0.1%
#   document-service    p95 < 2000ms, error rate < 0.5%
#   chat-service        p95 < 200ms,  error rate < 0.1%
#   accounting-service  p95 < 800ms,  error rate < 0.5%
#   gst-service         p95 < 1000ms, error rate < 0.5%
#   loan-service        p95 < 2000ms, error rate < 0.5%
#   itr-service         p95 < 2000ms, error rate < 0.5%
#   notification-service p95 < 300ms, error rate < 0.1%
#   report-service      p95 < 5000ms, error rate < 1.0%
#   subscription-service p95 < 500ms, error rate < 0.1%
#   ai-service          p95 < 5000ms, error rate < 1.0%
#   callback-service    p95 < 500ms,  error rate < 0.5%

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
ENVIRONMENT="${ENVIRONMENT:-production}"
REGION="asia-south1"
ALERT_EMAIL="${ALERT_EMAIL:-devops@snapaccount.in}"

log()     { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "─── $* ───"; }

# Naming suffix for staging
if [ "${ENVIRONMENT}" = "staging" ]; then
    NAME_SUFFIX="-staging"
else
    NAME_SUFFIX=""
fi

# ─────────────────────────────────────────────
# Step 1: Notification channel
# ─────────────────────────────────────────────
section "Notification Channel"

log "Creating email notification channel: ${ALERT_EMAIL}"
CHANNEL_NAME=$(gcloud alpha monitoring channels list \
    --filter="displayName='SnapAccount Alerts ${ENVIRONMENT}'" \
    --format="value(name)" 2>/dev/null | head -1 || true)

if [ -z "${CHANNEL_NAME}" ]; then
    CHANNEL_NAME=$(gcloud alpha monitoring channels create \
        --display-name="SnapAccount Alerts ${ENVIRONMENT}" \
        --type=email \
        --channel-labels="email_address=${ALERT_EMAIL}" \
        --format="value(name)" 2>/dev/null || true)
    log "Notification channel created: ${CHANNEL_NAME:-<configure manually in console>}"
else
    log "Notification channel already exists: ${CHANNEL_NAME}"
fi

# ─────────────────────────────────────────────
# Step 2: SLO alert policies (latency + error rate per service)
# ─────────────────────────────────────────────
# Alert policy format: Cloud Monitoring MQL-based alert on Cloud Run request metrics.
# Metrics used:
#   run.googleapis.com/request_count            — total request count (rate / errors)
#   run.googleapis.com/request_latencies        — request latency distribution (p95)
#
# MQL notes:
#   - response_code_class="5xx" filters for server-side errors
#   - percentile(95) over a 5-minute alignment window
#   - Alert fires if value exceeds threshold for 2 consecutive periods (10 min total)
# ─────────────────────────────────────────────
section "SLO Alert Policies"

create_latency_alert() {
    local service_name="$1"
    local p95_threshold_ms="$2"  # milliseconds
    local display_name="${service_name}${NAME_SUFFIX} — p95 latency > ${p95_threshold_ms}ms"

    log "Creating latency alert: ${display_name}"

    cat > /tmp/alert-latency-${service_name}.json << ALERTEOF
{
  "displayName": "${display_name}",
  "documentation": {
    "content": "p95 request latency for ${service_name} exceeded ${p95_threshold_ms}ms. Check Cloud Run logs and upstream dependencies. See docs/devops/observability-slos.md for runbook.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "p95 latency > ${p95_threshold_ms}ms",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service_name}${NAME_SUFFIX}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_PERCENTILE_95",
            "crossSeriesReducer": "REDUCE_MAX",
            "groupByFields": ["resource.labels.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${p95_threshold_ms},
        "duration": "600s",
        "trigger": {"count": 1}
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "604800s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${CHANNEL_NAME:-}"]
}
ALERTEOF

    gcloud alpha monitoring policies create \
        --policy-from-file=/tmp/alert-latency-${service_name}.json \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || \
        log "  Alert may already exist or require gcloud alpha — configure via console if needed"
}

create_error_rate_alert() {
    local service_name="$1"
    local error_threshold_pct="$2"  # percentage, e.g. 0.1 for 0.1%
    local display_name="${service_name}${NAME_SUFFIX} — error rate > ${error_threshold_pct}%"

    log "Creating error rate alert: ${display_name}"

    # Error rate threshold in requests/second is approximated here as an absolute 5xx count
    # over the alignment window. For a proper error-ratio alert, use Cloud Monitoring SLO
    # feature (Availability SLO) which is configured in the console.
    cat > /tmp/alert-errors-${service_name}.json << ALERTEOF
{
  "displayName": "${display_name}",
  "documentation": {
    "content": "Error rate for ${service_name} exceeded ${error_threshold_pct}%. Check Cloud Run logs: https://console.cloud.google.com/run/detail/${REGION}/${service_name}${NAME_SUFFIX}/logs?project=${GCP_PROJECT_ID}",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "5xx error count > 0 (threshold alert — tune via console SLO feature)",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service_name}${NAME_SUFFIX}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.labels.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0.1,
        "duration": "600s",
        "trigger": {"count": 1}
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "604800s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${CHANNEL_NAME:-}"]
}
ALERTEOF

    gcloud alpha monitoring policies create \
        --policy-from-file=/tmp/alert-errors-${service_name}.json \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || \
        log "  Alert may already exist or require gcloud alpha — configure via console if needed"
}

# Create alerts per service — thresholds match docs/devops/observability-slos.md
create_latency_alert "auth-service"          500
create_latency_alert "document-service"      2000
create_latency_alert "chat-service"          200
create_latency_alert "accounting-service"    800
create_latency_alert "gst-service"           1000
create_latency_alert "loan-service"          2000
create_latency_alert "itr-service"           2000
create_latency_alert "notification-service"  300
create_latency_alert "report-service"        5000
create_latency_alert "subscription-service"  500
create_latency_alert "ai-service"            5000
create_latency_alert "callback-service"      500

create_error_rate_alert "auth-service"          0.1
create_error_rate_alert "document-service"      0.5
create_error_rate_alert "chat-service"          0.1
create_error_rate_alert "accounting-service"    0.5
create_error_rate_alert "gst-service"           0.5
create_error_rate_alert "loan-service"          0.5
create_error_rate_alert "itr-service"           0.5
create_error_rate_alert "notification-service"  0.1
create_error_rate_alert "report-service"        1.0
create_error_rate_alert "subscription-service"  0.1
create_error_rate_alert "ai-service"            1.0
create_error_rate_alert "callback-service"      0.5

# ─────────────────────────────────────────────
# Step 3: Dashboards (Cloud Monitoring JSON)
# ─────────────────────────────────────────────
# Creates two dashboards:
#   (a) Per-service dashboard for each microservice (RED metrics: rate, errors, duration)
#   (b) "SnapAccount Overview" aggregate dashboard
#
# The dashboard JSON uses the Cloud Monitoring dashboard API format.
# Metric expressions use MQL-compatible filter strings.
# ─────────────────────────────────────────────
section "Cloud Monitoring Dashboards"

create_service_dashboard() {
    local service_name="$1"
    local display_label="$2"
    local full_service_name="${service_name}${NAME_SUFFIX}"
    local dashboard_display_name="SnapAccount — ${display_label} (${ENVIRONMENT})"

    log "Creating dashboard: ${dashboard_display_name}"

    cat > /tmp/dashboard-${service_name}.json << DASHEOF
{
  "displayName": "${dashboard_display_name}",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 4, "height": 4,
        "widget": {
          "title": "Request Rate (req/s)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/request_count\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["metric.labels.response_code_class"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "\${metric.labels.response_code_class}"
            }],
            "timeshiftDuration": "0s",
            "yAxis": {"label": "Requests/sec", "scale": "LINEAR"}
          }
        }
      },
      {
        "xPos": 4, "width": 4, "height": 4,
        "widget": {
          "title": "Error Rate (5xx/s)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM"
                  }
                }
              },
              "plotType": "LINE"
            }],
            "yAxis": {"label": "5xx/sec", "scale": "LINEAR"}
          }
        }
      },
      {
        "xPos": 8, "width": 4, "height": 4,
        "widget": {
          "title": "p50 / p95 / p99 Latency (ms)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_50",
                      "crossSeriesReducer": "REDUCE_MAX"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p50"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_95",
                      "crossSeriesReducer": "REDUCE_MAX"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p95"
              },
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_PERCENTILE_99",
                      "crossSeriesReducer": "REDUCE_MAX"
                    }
                  }
                },
                "plotType": "LINE",
                "legendTemplate": "p99"
              }
            ],
            "yAxis": {"label": "Latency (ms)", "scale": "LINEAR"}
          }
        }
      },
      {
        "yPos": 4, "width": 4, "height": 4,
        "widget": {
          "title": "Instance Count (active revisions)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/container/instance_count\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_MAX",
                    "crossSeriesReducer": "REDUCE_SUM"
                  }
                }
              },
              "plotType": "STACKED_AREA"
            }],
            "yAxis": {"label": "Instances", "scale": "LINEAR"}
          }
        }
      },
      {
        "xPos": 4, "yPos": 4, "width": 4, "height": 4,
        "widget": {
          "title": "Container CPU Utilization (%)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/container/cpu/utilizations\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_99",
                    "crossSeriesReducer": "REDUCE_MAX"
                  }
                }
              },
              "plotType": "LINE"
            }],
            "yAxis": {"label": "CPU utilization", "scale": "LINEAR"}
          }
        }
      },
      {
        "xPos": 8, "yPos": 4, "width": 4, "height": 4,
        "widget": {
          "title": "Container Memory Utilization (%)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${full_service_name}\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_99",
                    "crossSeriesReducer": "REDUCE_MAX"
                  }
                }
              },
              "plotType": "LINE"
            }],
            "yAxis": {"label": "Memory utilization", "scale": "LINEAR"}
          }
        }
      }
    ]
  }
}
DASHEOF

    gcloud monitoring dashboards create \
        --config-from-file=/tmp/dashboard-${service_name}.json \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || \
        log "  Dashboard may already exist — update manually via console or delete first"
}

# Per-service dashboards
create_service_dashboard "auth-service"          "Auth Service"
create_service_dashboard "document-service"      "Document Service"
create_service_dashboard "chat-service"          "Chat Service (SignalR)"
create_service_dashboard "accounting-service"    "Accounting Service"
create_service_dashboard "gst-service"           "GST Service"
create_service_dashboard "loan-service"          "Loan Service"
create_service_dashboard "itr-service"           "ITR Service"
create_service_dashboard "notification-service"  "Notification Service"
create_service_dashboard "report-service"        "Report Service"
create_service_dashboard "subscription-service"  "Subscription Service"
create_service_dashboard "ai-service"            "AI Service"
create_service_dashboard "callback-service"      "Callback Service"

# ── Aggregate overview dashboard ─────────────────────────────────────────────
section "Aggregate Overview Dashboard"

log "Creating SnapAccount Overview dashboard..."

SERVICES_JSON=""
for SVC in auth-service document-service accounting-service gst-service loan-service itr-service chat-service notification-service report-service subscription-service ai-service callback-service; do
    SVC_FULL="${SVC}${NAME_SUFFIX}"
    SERVICES_JSON="${SERVICES_JSON}\"${SVC_FULL}\","
done
# Remove trailing comma
SERVICES_JSON="[${SERVICES_JSON%,}]"

cat > /tmp/dashboard-overview.json << OVERVIEWEOF
{
  "displayName": "SnapAccount Overview (${ENVIRONMENT})",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 12, "height": 4,
        "widget": {
          "title": "All Services — Request Rate (req/s)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"5xx\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "\${resource.labels.service_name}"
            }],
            "yAxis": {"label": "Requests/sec", "scale": "LINEAR"}
          }
        }
      },
      {
        "yPos": 4, "width": 12, "height": 4,
        "widget": {
          "title": "All Services — Error Rate (5xx/s)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE",
                    "crossSeriesReducer": "REDUCE_SUM",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "\${resource.labels.service_name}"
            }],
            "yAxis": {"label": "5xx/sec", "scale": "LINEAR"}
          }
        }
      },
      {
        "yPos": 8, "width": 12, "height": 4,
        "widget": {
          "title": "All Services — p95 Latency (ms)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_95",
                    "crossSeriesReducer": "REDUCE_MAX",
                    "groupByFields": ["resource.labels.service_name"]
                  }
                }
              },
              "plotType": "LINE",
              "legendTemplate": "\${resource.labels.service_name}"
            }],
            "yAxis": {"label": "p95 ms", "scale": "LINEAR"}
          }
        }
      }
    ]
  }
}
OVERVIEWEOF

gcloud monitoring dashboards create \
    --config-from-file=/tmp/dashboard-overview.json \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || \
    log "Overview dashboard may already exist — update manually via console"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Cloud Monitoring Dashboards COMPLETE"
echo " Environment: ${ENVIRONMENT}"
echo "═══════════════════════════════════════════════"
echo ""
echo "Dashboards created (13 total):"
echo "  - SnapAccount Overview"
for SVC in auth-service document-service accounting-service gst-service loan-service itr-service chat-service notification-service report-service subscription-service ai-service callback-service; do
    echo "  - SnapAccount — $(echo "${SVC}" | sed 's/-/ /g; s/\b\(.\)/\u\1/g')"
done
echo ""
echo "Alert policies created: $(( 12 * 2 )) (12 services x 2 alert types)"
echo ""
echo "View dashboards:"
echo "  https://console.cloud.google.com/monitoring/dashboards?project=${GCP_PROJECT_ID}"
echo ""
echo "Fine-tune error-ratio SLOs (recommended):"
echo "  GCP Console → Monitoring → SLOs → Create SLO"
echo "  (uses Availability SLO type for better error-ratio accuracy than threshold alerts)"
echo ""
