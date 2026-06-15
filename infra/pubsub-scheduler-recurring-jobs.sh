#!/usr/bin/env bash
# SnapAccount — Recurring Jobs via Cloud Scheduler + Pub/Sub
#
# Phase 6E/6B/6D initial jobs (4 jobs):
#   gst-deadline-check, itr-deadline-reminders, itr-refund-polling, subscription-renewal-check
#
# Phase 7 Wave 2 additions (D5 — GAP-012 / GAP-042):
#   callback-kpi-mv-refresh    — REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot
#   gst-pre-deadline-callback  — auto-callback if GST return not approved 2 days before deadline
#   itr-form16-missing         — alert if Form 16 not uploaded 3 days after upload deadline
#   (itr-deadline-reminders already covers e-verify Day 1/7/15/25/29 — backend gates these)
#
# Full job matrix: docs/devops/recurring-jobs-decision.md
#
# Schedule change log:
#   Phase 6E initial: itr-deadline-reminders=07:00, itr-refund-polling=09:00
#   Phase 6D update:  itr-deadline-reminders=09:00, itr-refund-polling=10:00 (spec-aligned)
#   Phase 7 Wave 2:   added callback-kpi-mv-refresh, gst-pre-deadline-callback, itr-form16-missing
#
# Decision rationale: docs/devops/recurring-jobs-decision.md
# Scope docs: .claude/orchestrator/phase-6E-scope.md, phase-6B-scope.md, phase-6D-scope.md §devops-engineer
#             .claude/orchestrator/phase-7-tasks/devops-engineer.md §D5
#
# Prerequisites:
#   - infra/setup.sh completed (APIs enabled, Pub/Sub SA exists)
#   - cloudscheduler.googleapis.com API enabled
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod
#   export ENVIRONMENT=production    # or: staging
#   bash infra/pubsub-scheduler-recurring-jobs.sh
#
# Idempotent: safe to re-run. Existing resources are skipped with a log message.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
ENVIRONMENT="${ENVIRONMENT:-production}"
REGION="asia-south1"

# Cloud Scheduler region — must match or be near Cloud Run region.
# asia-south1 supports Cloud Scheduler.
SCHEDULER_REGION="asia-south1"

# Pub/Sub topic name (follows existing snapaccount.* naming convention)
TOPIC="snapaccount.recurring-jobs.due"
DL_TOPIC="${TOPIC}.dead-letter"
SUB_NAME="notification-service-recurring-jobs-sub"

log() { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "─── $* ───"; }

# ─────────────────────────────────────────────
# Step 1: Enable Cloud Scheduler API (idempotent)
# ─────────────────────────────────────────────
section "Enable Cloud Scheduler API"

log "Enabling cloudscheduler.googleapis.com..."
gcloud services enable cloudscheduler.googleapis.com \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || true

# ─────────────────────────────────────────────
# Step 2: Pub/Sub topic + dead-letter + subscription
# ─────────────────────────────────────────────
section "Pub/Sub: snapaccount.recurring-jobs.due"

# Dead-letter topic first (subscription references it)
if ! gcloud pubsub topics describe "${DL_TOPIC}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating dead-letter topic: ${DL_TOPIC}"
    gcloud pubsub topics create "${DL_TOPIC}" \
        --project="${GCP_PROJECT_ID}" \
        --message-retention-duration=14d \
        --labels="app=snapaccount,type=dead-letter,phase=6e"
else
    log "Dead-letter topic ${DL_TOPIC} already exists — skipping"
fi

# Main topic
if ! gcloud pubsub topics describe "${TOPIC}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating topic: ${TOPIC}"
    gcloud pubsub topics create "${TOPIC}" \
        --project="${GCP_PROJECT_ID}" \
        --message-retention-duration=7d \
        --labels="app=snapaccount,phase=6e"
else
    log "Topic ${TOPIC} already exists — skipping"
fi

# Pull subscription for NotificationService
# NotificationService pulls messages and processes by job_type field in payload.
# Using pull (not push) because Cloud Run scales to zero — push requires a live endpoint,
# which defeats the scale-to-zero benefit. Notification service polls via background worker.
# Alternatively, Cloud Scheduler can push directly to a Cloud Run endpoint; but pull via
# Pub/Sub subscription is more resilient to cold starts.
if ! gcloud pubsub subscriptions describe "${SUB_NAME}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating subscription: ${SUB_NAME}"
    gcloud pubsub subscriptions create "${SUB_NAME}" \
        --topic="${TOPIC}" \
        --project="${GCP_PROJECT_ID}" \
        --ack-deadline=300 \
        --max-delivery-attempts=5 \
        --dead-letter-topic="${DL_TOPIC}" \
        --message-retention-duration=7d \
        --labels="app=snapaccount,phase=6e,consumer=notification-service"
else
    log "Subscription ${SUB_NAME} already exists — skipping"
fi

# Phase 7: Additional pull subscription for CallbackService recurring-jobs consumer.
# CallbackService handles: CALLBACK_KPI_MV_REFRESH, GST_PRE_DEADLINE_CALLBACK job types.
# Uses the same snapaccount.recurring-jobs.due topic (single-topic, payload-discriminated).
CALLBACK_SUB_NAME="callback-service-recurring-jobs-sub"
if ! gcloud pubsub subscriptions describe "${CALLBACK_SUB_NAME}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating subscription: ${CALLBACK_SUB_NAME}"
    gcloud pubsub subscriptions create "${CALLBACK_SUB_NAME}" \
        --topic="${TOPIC}" \
        --project="${GCP_PROJECT_ID}" \
        --ack-deadline=600 \
        --max-delivery-attempts=3 \
        --dead-letter-topic="${DL_TOPIC}" \
        --message-retention-duration=7d \
        --labels="app=snapaccount,phase=7,consumer=callback-service"
else
    log "Subscription ${CALLBACK_SUB_NAME} already exists — skipping"
fi

# Grant Cloud Pub/Sub service account permission to publish to dead-letter
# (required when dead-letter is configured on a subscription)
PUBSUB_SA="service-$(gcloud projects describe "${GCP_PROJECT_ID}" \
    --format='value(projectNumber)')@gcp-sa-pubsub.iam.gserviceaccount.com"

log "Granting Pub/Sub SA dead-letter publisher permission..."
gcloud pubsub topics add-iam-policy-binding "${DL_TOPIC}" \
    --project="${GCP_PROJECT_ID}" \
    --member="serviceAccount:${PUBSUB_SA}" \
    --role="roles/pubsub.publisher" 2>/dev/null || \
    log "  (already bound or SA not yet available — verify manually)"

log "Granting Pub/Sub SA subscriber permission on main subscription..."
gcloud pubsub subscriptions add-iam-policy-binding "${SUB_NAME}" \
    --project="${GCP_PROJECT_ID}" \
    --member="serviceAccount:${PUBSUB_SA}" \
    --role="roles/pubsub.subscriber" 2>/dev/null || \
    log "  (already bound or SA not yet available — verify manually)"

# ─────────────────────────────────────────────
# Step 3: Service account for Cloud Scheduler
# (Scheduler needs permission to publish to the Pub/Sub topic)
# ─────────────────────────────────────────────
section "Cloud Scheduler service account"

SCHEDULER_SA="cloud-scheduler-sa"
SCHEDULER_SA_EMAIL="${SCHEDULER_SA}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "${SCHEDULER_SA_EMAIL}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating service account: ${SCHEDULER_SA_EMAIL}"
    gcloud iam service-accounts create "${SCHEDULER_SA}" \
        --project="${GCP_PROJECT_ID}" \
        --display-name="Cloud Scheduler — recurring jobs publisher" \
        --description="Used by Cloud Scheduler jobs to publish to Pub/Sub recurring-jobs topic"
else
    log "Service account ${SCHEDULER_SA_EMAIL} already exists — skipping"
fi

# Grant the scheduler SA permission to publish to the topic
log "Granting ${SCHEDULER_SA_EMAIL} pubsub.topics.publish on ${TOPIC}..."
gcloud pubsub topics add-iam-policy-binding "${TOPIC}" \
    --project="${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SCHEDULER_SA_EMAIL}" \
    --role="roles/pubsub.publisher" 2>/dev/null || \
    log "  (binding already exists — skipping)"

# ─────────────────────────────────────────────
# Step 4: Cloud Scheduler jobs
#
# All CRON schedules use IST (Asia/Kolkata).
# Payload schema:
#   { "job_type": "<JOB_TYPE>", "triggered_at": "<ISO8601>", "source": "cloud-scheduler" }
# NotificationService handler switches on job_type — see recurring-jobs-decision.md.
# ─────────────────────────────────────────────
section "Cloud Scheduler jobs"

# Helper: create or update a scheduler job targeting Pub/Sub
create_scheduler_job() {
    local job_name="$1"
    local schedule="$2"
    local payload="$3"
    local description="$4"

    # Add environment suffix for staging to avoid conflicts
    local full_job_name="${job_name}"
    if [ "${ENVIRONMENT}" = "staging" ]; then
        full_job_name="${job_name}-staging"
    fi

    if gcloud scheduler jobs describe "${full_job_name}" \
            --location="${SCHEDULER_REGION}" \
            --project="${GCP_PROJECT_ID}" &>/dev/null; then
        log "Updating scheduler job: ${full_job_name}"
        gcloud scheduler jobs update pubsub "${full_job_name}" \
            --project="${GCP_PROJECT_ID}" \
            --location="${SCHEDULER_REGION}" \
            --schedule="${schedule}" \
            --time-zone="Asia/Kolkata" \
            --topic="projects/${GCP_PROJECT_ID}/topics/${TOPIC}" \
            --message-body="${payload}" \
            --description="${description}" \
            --oidc-service-account-email="${SCHEDULER_SA_EMAIL}"
    else
        log "Creating scheduler job: ${full_job_name}"
        gcloud scheduler jobs create pubsub "${full_job_name}" \
            --project="${GCP_PROJECT_ID}" \
            --location="${SCHEDULER_REGION}" \
            --schedule="${schedule}" \
            --time-zone="Asia/Kolkata" \
            --topic="projects/${GCP_PROJECT_ID}/topics/${TOPIC}" \
            --message-body="${payload}" \
            --description="${description}" \
            --oidc-service-account-email="${SCHEDULER_SA_EMAIL}" \
            --max-retry-attempts=3 \
            --max-retry-duration=10m \
            --min-backoff-duration=30s \
            --max-backoff-duration=300s \
            --max-doublings=3 \
            --attempt-deadline=10m
    fi
    log "  ${full_job_name}: ${schedule} IST → ${payload}"
}

# ── Job 1: GST Deadline Check ──────────────────
# Fires daily at 06:00 IST. Handler queries orgs with GST return due in 7/3/1 days
# and fans out D-7, D-3, D-1 notifications per org per return type (GSTR-1, GSTR-3B, etc.)
create_scheduler_job \
    "gst-deadline-check" \
    "0 6 * * *" \
    '{"job_type":"GST_DEADLINE_CHECK","source":"cloud-scheduler"}' \
    "Daily 06:00 IST: check orgs with GST returns due in D-7/D-3/D-1 and fan out notifications"

# ── Job 2: ITR Deadline Reminders ─────────────
# Phase 6D: fires daily at 09:00 IST year-round.
# gcloud Cloud Scheduler does not support seasonal cron natively. The job fires every day;
# ItrService backend gates the actual fan-out: full reminder sequence during May–September
# tax season (ITR-1/4 due July 31), weekly digest outside that window.
# Handler queries unverified ITR filings and fires e-verify reminders at Day 1/7/15/25/29
# after filing date. Business-rule gating is owned by backend-agent (ItrService).
create_scheduler_job \
    "itr-deadline-reminders" \
    "0 9 * * *" \
    '{"job_type":"ITR_DEADLINE_REMINDERS","source":"cloud-scheduler"}' \
    "Daily 09:00 IST: check unverified ITR filings; backend gates seasonal vs weekly fan-out"

# ── Job 3: ITR Refund Polling ──────────────────
# Phase 6D: fires daily at 10:00 IST.
# Handler polls Income Tax portal for refund status on all pending ITRs.
# Notifies user when refund status changes (e.g., INITIATED → REFUNDED).
# Note: IT portal rate-limits ~600 req/hour; ItrService must implement per-org throttling
# and exponential backoff. See docs/devops/document-ai-quota-itr.md for quota context.
create_scheduler_job \
    "itr-refund-polling" \
    "0 10 * * *" \
    '{"job_type":"ITR_REFUND_POLLING","source":"cloud-scheduler"}' \
    "Daily 10:00 IST: poll Income Tax portal for refund status changes on pending ITRs"

# ── Job 4: Subscription Renewal Check ─────────
# Fires daily at 08:00 IST.
# Handler queries orgs with subscription expiring in 7/3/1 days and sends renewal
# push notification + email. Deduplication: do not send if same event sent in last 6h.
create_scheduler_job \
    "subscription-renewal-check" \
    "0 8 * * *" \
    '{"job_type":"SUBSCRIPTION_RENEWAL_CHECK","source":"cloud-scheduler"}' \
    "Daily 08:00 IST: notify orgs with subscription expiring in 7/3/1 days"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 7 Wave 2 Jobs (D5 — GAP-012 / GAP-042)
# ─────────────────────────────────────────────────────────────────────────────

# ── Job 5: Callback KPI Materialized View Refresh (P6-HANDOFF-07) ──────────
# Fires daily at 00:30 IST (midnight + 30 min) — off-peak, after day boundary.
# Executes: REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot
# The CONCURRENTLY option requires a unique index on (org_id, snapshot_date),
# which was confirmed present (Wave 1 migration 061).
# Idempotency: REFRESH MV is idempotent by design — re-running does not create
# duplicate rows, it updates in-place. Safe to retry on failure.
# Backend endpoint: CallbackService must implement a POST /callbacks/internal/refresh-kpi-mv
# that executes the REFRESH command. This endpoint is INTERNAL (no Firebase auth — use
# service-account OIDC for Cloud Scheduler authentication).
# PENDING-B19: backend-agent Wave 3 must implement POST /callbacks/internal/refresh-kpi-mv
create_scheduler_job \
    "callback-kpi-mv-refresh" \
    "30 0 * * *" \
    '{"job_type":"CALLBACK_KPI_MV_REFRESH","source":"cloud-scheduler","mv":"callback.kpi_daily_snapshot"}' \
    "Daily 00:30 IST: REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot (P6-HANDOFF-07)"

# ── Job 6: GST Pre-Deadline Auto-Callback ──────────────────────────────────
# Fires daily at 07:00 IST.
# Handler: checks for orgs where a GST return is due in ≤2 days AND the return
# has NOT been approved/filed. Creates a CallbackService callback record
# (priority=HIGH, type=GST_PRE_DEADLINE) so an ops agent calls the user.
# Complements the GST_DEADLINE_CHECK job (Job 1) which sends notifications;
# this job creates an actionable callback task for the human ops team.
# Idempotency: handler must use INSERT ... ON CONFLICT to avoid duplicate callbacks
# for the same (org_id, return_period, callback_type) within the same day.
# PENDING-B19: backend-agent Wave 3 must implement the GST_PRE_DEADLINE_CALLBACK handler
#   in CallbackService — receives the Pub/Sub message and queries GstService for
#   unApproved returns due in ≤2 days, then creates callback records.
create_scheduler_job \
    "gst-pre-deadline-callback" \
    "0 7 * * *" \
    '{"job_type":"GST_PRE_DEADLINE_CALLBACK","source":"cloud-scheduler","days_before_deadline":2}' \
    "Daily 07:00 IST: auto-callback for orgs with unapproved GST return due in ≤2 days (plan E4.1)"

# ── Job 7: ITR Form-16 Missing Alert ─────────────────────────────────────
# Fires daily at 11:00 IST.
# Handler: checks for salaried users (ITR-1/2/3) who have an active ITR for the
# current AY but no Form 16 (Part A or Part B) uploaded, AND it is more than 3
# days past June 15 (statutory deadline for employers to issue Form 16).
# Creates a callback record and sends a push notification reminding the user to
# request Form 16 from their employer.
# Seasonal: gate in backend — only run June 15 through July 31 (ITR filing window).
# If fired outside the window, the handler returns immediately (no-op).
# Idempotency: one alert per user per AY per day (deduplicated via notification table).
# PENDING-B19: backend-agent Wave 3 must implement the ITR_FORM16_MISSING handler.
create_scheduler_job \
    "itr-form16-missing" \
    "0 11 * * *" \
    '{"job_type":"ITR_FORM16_MISSING","source":"cloud-scheduler","days_after_deadline":3}' \
    "Daily 11:00 IST: alert users missing Form 16 more than 3 days after June 15 deadline"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Recurring Jobs Infra COMPLETE"
echo " Environment: ${ENVIRONMENT}"
echo " Topic:       ${TOPIC}"
echo " Subscription: ${SUB_NAME}"
echo "═══════════════════════════════════════════════"
echo ""
echo "Cloud Scheduler jobs:"
gcloud scheduler jobs list \
    --location="${SCHEDULER_REGION}" \
    --project="${GCP_PROJECT_ID}" \
    --format="table(name,schedule,state)" 2>/dev/null || \
    echo "  (use: gcloud scheduler jobs list --location=${SCHEDULER_REGION})"
echo ""
echo "Pub/Sub subscriptions:"
echo "  notification-service-recurring-jobs-sub — handles: GST_DEADLINE_CHECK, ITR_DEADLINE_REMINDERS,"
echo "                                             ITR_REFUND_POLLING, SUBSCRIPTION_RENEWAL_CHECK,"
echo "                                             ITR_FORM16_MISSING"
echo "  callback-service-recurring-jobs-sub     — handles: CALLBACK_KPI_MV_REFRESH,"
echo "                                             GST_PRE_DEADLINE_CALLBACK (PENDING-B19)"
echo ""
echo "PENDING-B19 (backend Wave 3) — backend-agent must implement:"
echo "  POST /callbacks/internal/refresh-kpi-mv     — REFRESH MV CONCURRENTLY callback.kpi_daily_snapshot"
echo "  POST /callbacks/internal/gst-pre-deadline   — auto-callback for unapproved returns ≤2 days to deadline"
echo "  ITR_FORM16_MISSING handler                  — in NotificationService, gate: June 15 – July 31"
echo "  ITR_DEADLINE_REMINDERS Day-25 auto-callback — in CallbackService (plan G8.1)"
echo ""
echo "Next steps:"
echo "  1. Verify NotificationService handles job_type payloads from '${TOPIC}'"
echo "  2. Verify CallbackService handles CALLBACK_KPI_MV_REFRESH and GST_PRE_DEADLINE_CALLBACK (after B19)"
echo "  3. Test job trigger manually:"
echo "     gcloud scheduler jobs run gst-deadline-check --location=${SCHEDULER_REGION}"
echo "     gcloud scheduler jobs run callback-kpi-mv-refresh --location=${SCHEDULER_REGION}"
echo "  4. Monitor: Cloud Logging > scheduler.googleapis.com/executions"
echo "  5. Full matrix documentation: docs/devops/recurring-jobs-decision.md"
echo ""
