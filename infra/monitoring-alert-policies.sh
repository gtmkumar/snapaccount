#!/usr/bin/env bash
# SnapAccount — Cloud Monitoring SLO Alert Policies (NEW-D06)
# Phase 7 / NEW-D06
#
# Creates Cloud Monitoring alert policies for every SLO documented in
# docs/devops/observability-slos.md.
#
# What this creates (idempotent — safe to re-run):
#   For each microservice:
#     1. Latency alert policy  — fires when p95 latency exceeds SLO threshold
#                                for 2 consecutive 5-minute periods (10 min total)
#     2. Error rate alert policy — fires when 5xx request rate exceeds
#                                  0.1 req/s for 2 consecutive 5-minute periods
#   Plus:
#     3. Pub/Sub message-lag alert — per-subscription oldest_unacked_message_age
#     4. Email notification channel placeholder (or reuse existing)
#
# Design notes (see docs/devops/observability-slos.md):
#   - Alerting window: 5-minute alignment periods, alert after 2 violations (10 min).
#   - Metrics source: Cloud Run built-in metrics (run.googleapis.com/*).
#   - This script creates THRESHOLD-BASED alerts as a baseline.
#     For production oncall, upgrade to burn-rate alerts via GCP Console → Monitoring → SLOs.
#   - Existing policies with the same display name are DELETED and recreated to stay idempotent.
#     (gcloud monitoring policies update is unreliable with complex condition JSON.)
#
# Prerequisites:
#   - gcloud CLI authenticated with monitoring.googleapis.com enabled
#   - infra/setup.sh already executed (notification channel email may already exist)
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod    # or snapaccount-staging
#   export ENVIRONMENT=production             # or staging
#   export ALERT_EMAIL=devops@snapaccount.in  # override if needed
#   bash infra/monitoring-alert-policies.sh
#
# APPLY NOTHING manually — this script manages its own state via gcloud API.
# Notification channel is a PLACEHOLDER if ALERT_EMAIL is not a verified channel yet.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
ENVIRONMENT="${ENVIRONMENT:-production}"
ALERT_EMAIL="${ALERT_EMAIL:-devops@snapaccount.in}"

log()     { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "════════════════════════════════════════════"; echo "  $*"; echo "════════════════════════════════════════════"; }
warn()    { echo "[$(date +%H:%M:%S)] WARNING: $*"; }

ENV_LABEL="${ENVIRONMENT}"

# ─── SLO table (source: docs/devops/observability-slos.md) ───────────────────
#
# Format: "cloud-run-service-name:p95_latency_ms:error_rate_threshold_pct"
# error_rate_threshold_pct is the percentage of requests that can be 5xx
# (0.1 = 0.1% = 1 in 1000). Converted to a fraction for the alert condition.
#
# ─── SLO data ─────────────────────────────────────────────────────────────────
declare -a SERVICES=(
    "auth-service:500:0.001"
    "document-service:2000:0.005"
    "chat-service:200:0.001"
    "accounting-service:800:0.005"
    "gst-service:1000:0.005"
    "loan-service:2000:0.005"
    "itr-service:2000:0.005"
    "notification-service:300:0.001"
    "report-service:5000:0.010"
    "subscription-service:500:0.001"
    "ai-service:5000:0.010"
    "callback-service:500:0.005"
)

# ─── Pub/Sub lag thresholds (seconds) ─────────────────────────────────────────
# notification-service subscriptions: 60s max (SMS/push delay)
# all other subscriptions: 300s (5 min)
NOTIFICATION_LAG_THRESHOLD=60
DEFAULT_LAG_THRESHOLD=300

# ─── Helper: escape service name for policy display name ──────────────────────
policy_name() {
    local service="$1"
    local type="$2"
    echo "SnapAccount ${service} ${type} SLO Alert (${ENV_LABEL})"
}

# ─── Step 1: Notification channel ─────────────────────────────────────────────
section "Step 1: Notification Channel"

log "Looking for existing email notification channel: ${ALERT_EMAIL}"
CHANNEL_NAME=$(gcloud alpha monitoring channels list \
    --project="${GCP_PROJECT_ID}" \
    --filter="displayName='SnapAccount Alerts ${ENV_LABEL}'" \
    --format="value(name)" 2>/dev/null | head -1 || true)

if [[ -z "${CHANNEL_NAME}" ]]; then
    log "  Creating new email notification channel..."
    CHANNEL_NAME=$(gcloud alpha monitoring channels create \
        --project="${GCP_PROJECT_ID}" \
        --display-name="SnapAccount Alerts ${ENV_LABEL}" \
        --type=email \
        --channel-labels="email_address=${ALERT_EMAIL}" \
        --format="value(name)" 2>/dev/null || true)

    if [[ -z "${CHANNEL_NAME}" ]]; then
        warn "Could not create notification channel via gcloud alpha."
        warn "  Create manually: GCP Console → Monitoring → Alerting → Notification Channels"
        warn "  Then re-run this script. Alert policies will be created without a notification channel."
        CHANNEL_NAME=""
    else
        log "  Created: ${CHANNEL_NAME}"
    fi
else
    log "  Found existing channel: ${CHANNEL_NAME}"
fi

NOTIFICATION_CHANNELS_JSON="[]"
if [[ -n "${CHANNEL_NAME}" ]]; then
    NOTIFICATION_CHANNELS_JSON="[\"${CHANNEL_NAME}\"]"
fi

# ─── Helper: create or replace an alert policy from a JSON tempfile ───────────
# Args: $1 = display_name  $2 = policy_json_file
upsert_policy() {
    local display_name="$1"
    local policy_json="$2"

    # Delete existing policy with this display name (idempotent)
    local existing
    existing=$(gcloud alpha monitoring policies list \
        --project="${GCP_PROJECT_ID}" \
        --filter="displayName='${display_name}'" \
        --format="value(name)" 2>/dev/null | head -1 || true)

    if [[ -n "${existing}" ]]; then
        log "    Deleting existing policy: ${existing}"
        gcloud alpha monitoring policies delete "${existing}" \
            --project="${GCP_PROJECT_ID}" \
            --quiet 2>/dev/null || warn "Could not delete ${existing} — continuing"
    fi

    # Create the new policy
    gcloud alpha monitoring policies create \
        --policy-from-file="${policy_json}" \
        --project="${GCP_PROJECT_ID}" \
        2>/dev/null \
    && log "    Created: ${display_name}" \
    || warn "    Failed to create: ${display_name} (check policy JSON at ${policy_json})"
}

# ─── Step 2: Per-service latency + error rate alerts ──────────────────────────
section "Step 2: Per-Service SLO Alert Policies"

for entry in "${SERVICES[@]}"; do
    IFS=':' read -r service latency_ms error_fraction <<< "${entry}"

    log ""
    log "Service: ${service} (p95 < ${latency_ms}ms, error rate < ${error_fraction})"

    # ── Latency alert ──────────────────────────────────────────────────────────
    LATENCY_NAME=$(policy_name "${service}" "Latency")
    LATENCY_THRESHOLD_MS="${latency_ms}"

    LATENCY_JSON=$(mktemp /tmp/slo-policy-latency-XXXXXX.json)
    cat > "${LATENCY_JSON}" <<JSON
{
  "displayName": "${LATENCY_NAME}",
  "documentation": {
    "content": "## ${service} p95 Latency SLO Alert\n\nFires when p95 request latency exceeds ${LATENCY_THRESHOLD_MS}ms for 10 consecutive minutes.\n\n**SLO target:** p95 < ${LATENCY_THRESHOLD_MS}ms\n**Source:** docs/devops/observability-slos.md\n**Runbook:** Check Cloud Run Logs → filter by service_name=${service}; look for slow external API calls, GCS/DB timeouts.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "${service} p95 latency > ${LATENCY_THRESHOLD_MS}ms",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "crossSeriesReducer": "REDUCE_PERCENTILE_95",
            "perSeriesAligner": "ALIGN_DELTA",
            "groupByFields": ["resource.labels.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${LATENCY_THRESHOLD_MS},
        "duration": "600s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "1800s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ${NOTIFICATION_CHANNELS_JSON},
  "userLabels": {
    "app": "snapaccount",
    "service": "${service}",
    "slo_type": "latency",
    "environment": "${ENV_LABEL}",
    "phase": "7"
  }
}
JSON

    upsert_policy "${LATENCY_NAME}" "${LATENCY_JSON}"
    rm -f "${LATENCY_JSON}"

    # ── Error rate alert ───────────────────────────────────────────────────────
    ERROR_NAME=$(policy_name "${service}" "Error Rate")
    # error_fraction is the fraction of total requests that are 5xx (e.g. 0.001 = 0.1%)
    # Cloud Monitoring alert threshold is req/s absolute, not a ratio.
    # We use 0.1 req/s as the alert threshold — this matches the 5xx absolute rate
    # used by cloud-monitoring-dashboards.sh.
    # For services with higher error budgets (e.g. report-service, ai-service: 1%),
    # the threshold is still 0.1 req/s for the alert (absolute floor).
    ERROR_THRESHOLD_RPS="0.1"

    ERROR_JSON=$(mktemp /tmp/slo-policy-error-XXXXXX.json)
    cat > "${ERROR_JSON}" <<JSON
{
  "displayName": "${ERROR_NAME}",
  "documentation": {
    "content": "## ${service} Error Rate SLO Alert\n\nFires when 5xx request rate exceeds ${ERROR_THRESHOLD_RPS} req/s for 10 consecutive minutes.\n\n**SLO target:** error rate < ${error_fraction} (fraction)\n**Source:** docs/devops/observability-slos.md\n**Runbook:** Check Cloud Run Logs → filter by service_name=${service} AND http_request.status>=500; look for unhandled exceptions, EF Core errors, external service failures.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "${service} 5xx rate > ${ERROR_THRESHOLD_RPS} req/s",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "crossSeriesReducer": "REDUCE_SUM",
            "perSeriesAligner": "ALIGN_RATE",
            "groupByFields": ["resource.labels.service_name"]
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${ERROR_THRESHOLD_RPS},
        "duration": "600s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "1800s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ${NOTIFICATION_CHANNELS_JSON},
  "userLabels": {
    "app": "snapaccount",
    "service": "${service}",
    "slo_type": "error_rate",
    "environment": "${ENV_LABEL}",
    "phase": "7"
  }
}
JSON

    upsert_policy "${ERROR_NAME}" "${ERROR_JSON}"
    rm -f "${ERROR_JSON}"
done

# ─── Step 3: Pub/Sub message-lag alerts ───────────────────────────────────────
section "Step 3: Pub/Sub Message-Lag Alerts"

log "Creating Pub/Sub lag alerts..."
log "  notification-service subscriptions: > ${NOTIFICATION_LAG_THRESHOLD}s"
log "  all other subscriptions: > ${DEFAULT_LAG_THRESHOLD}s"

# Notification-service subscriptions get a tighter threshold (60s)
NOTIFICATION_LAG_NAME="SnapAccount notification-service Pub/Sub Lag SLO Alert (${ENV_LABEL})"
NOTIFICATION_LAG_JSON=$(mktemp /tmp/slo-pubsub-notification-XXXXXX.json)
cat > "${NOTIFICATION_LAG_JSON}" <<JSON
{
  "displayName": "${NOTIFICATION_LAG_NAME}",
  "documentation": {
    "content": "## Pub/Sub Message Lag Alert — notification-service\n\nFires when oldest_unacked_message_age exceeds ${NOTIFICATION_LAG_THRESHOLD}s on any notification-service subscription.\n\n**Impact:** SMS/push notifications delayed by > 1 minute — user-visible lag.\n**Runbook:** Check notification-service Cloud Run logs for subscriber exceptions. Verify NotificationService is healthy (/healthz). Check subscription backlog in Cloud Console → Pub/Sub → Subscriptions.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "notification-service subscription lag > ${NOTIFICATION_LAG_THRESHOLD}s",
      "conditionThreshold": {
        "filter": "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" AND resource.labels.subscription_id=monitoring.regex.full_match(\".*notification.*\")",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_MAX"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${NOTIFICATION_LAG_THRESHOLD},
        "duration": "300s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "1800s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ${NOTIFICATION_CHANNELS_JSON},
  "userLabels": {
    "app": "snapaccount",
    "slo_type": "pubsub_lag",
    "environment": "${ENV_LABEL}",
    "phase": "7"
  }
}
JSON

upsert_policy "${NOTIFICATION_LAG_NAME}" "${NOTIFICATION_LAG_JSON}"
rm -f "${NOTIFICATION_LAG_JSON}"

# All other subscriptions: 300s threshold
DEFAULT_LAG_NAME="SnapAccount All Subscriptions Pub/Sub Lag SLO Alert (${ENV_LABEL})"
DEFAULT_LAG_JSON=$(mktemp /tmp/slo-pubsub-default-XXXXXX.json)
cat > "${DEFAULT_LAG_JSON}" <<JSON
{
  "displayName": "${DEFAULT_LAG_NAME}",
  "documentation": {
    "content": "## Pub/Sub Message Lag Alert — All Subscriptions\n\nFires when oldest_unacked_message_age exceeds ${DEFAULT_LAG_THRESHOLD}s (5 minutes) on any non-notification subscription.\n\n**Impact:** Background processing delayed — may affect GST filing, document OCR, loan events, etc.\n**Runbook:** Identify the lagging subscription in Cloud Console → Pub/Sub. Check the consuming service's Cloud Run logs. Look for consumer failures or service restarts.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Any subscription lag > ${DEFAULT_LAG_THRESHOLD}s",
      "conditionThreshold": {
        "filter": "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" AND resource.labels.project_id=\"${GCP_PROJECT_ID}\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_MAX"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": ${DEFAULT_LAG_THRESHOLD},
        "duration": "600s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "autoClose": "3600s"
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ${NOTIFICATION_CHANNELS_JSON},
  "userLabels": {
    "app": "snapaccount",
    "slo_type": "pubsub_lag",
    "environment": "${ENV_LABEL}",
    "phase": "7"
  }
}
JSON

upsert_policy "${DEFAULT_LAG_NAME}" "${DEFAULT_LAG_JSON}"
rm -f "${DEFAULT_LAG_JSON}"

# ─── Step 4: Summary ──────────────────────────────────────────────────────────
section "Summary"

echo ""
echo "SLO alert policies provisioned for environment: ${ENV_LABEL}"
echo ""
echo "  Per-service alerts created:"
echo "    ${#SERVICES[@]} services × 2 alert types (latency + error rate) = $((${#SERVICES[@]} * 2)) policies"
echo "  Pub/Sub lag alerts: 2 policies (notification-service tight threshold + all-subscriptions default)"
echo ""
echo "  Notification channel: ${CHANNEL_NAME:-NOT SET (create manually in GCP Console)}"
echo "  Alert email: ${ALERT_EMAIL}"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Verify policies in GCP Console → Monitoring → Alerting"
echo "     (filter by label: app=snapaccount)"
echo ""
echo "  2. For production oncall, upgrade to burn-rate SLOs:"
echo "     GCP Console → Monitoring → SLOs → Create SLO → Request-based"
echo "     Good requests: response_code_class != '5xx'"
echo "     Targets: 99.9% (auth/chat/notification/subscription), 99.5% (others)"
echo "     See: docs/devops/observability-slos.md § Recommended: Cloud Monitoring Availability SLO"
echo ""
echo "  3. If notification channel shows 'NOT SET': create it in GCP Console, then"
echo "     re-run this script to wire the channel to all policies."
echo ""
echo "  4. To apply to staging: export ENVIRONMENT=staging && bash infra/monitoring-alert-policies.sh"
echo ""
