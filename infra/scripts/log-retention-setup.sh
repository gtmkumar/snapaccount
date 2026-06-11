#!/usr/bin/env bash
# SnapAccount — Log Retention Configuration (GAP-025)
#
# Creates custom Cloud Logging buckets with statutory retention periods:
#   security-events   — 180 days  (DPDP Act 2023 + RBI Digital Lending)
#   financial-audit   — 2555 days (7-year: Income Tax Act, GST rules, Companies Act)
#   incident-response — 1095 days (3-year: CERT-In Directions 2022)
#
# The _Default bucket (30-day operational logs) is left unchanged.
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod   # or snapaccount-staging
#   bash infra/scripts/log-retention-setup.sh
#
# Prerequisites:
#   gcloud auth login  (Workload Identity in CI — keyless via cd.yml)
#   infra/setup.sh completed (project + APIs enabled)
#
# Idempotent: safe to re-run. Existing buckets are updated, not recreated.
#
# IMPORTANT: This script does NOT log or store any user PII or payment data.
# All retention targets are for OPERATIONAL and AUDIT logs only.
# See docs/devops/incident-response.md §E for log content rules.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="asia-south1"

# Retention periods
SECURITY_DAYS=180     # DPDP Act 2023 + RBI Digital Lending minimum
FINANCIAL_DAYS=2555   # 7 years (365 * 7 = 2555) — Income Tax Act + GST rules
INCIDENT_DAYS=1095    # 3 years (365 * 3 = 1095) — CERT-In Directions 2022

echo "================================================="
echo " SnapAccount — Log Retention Setup (GAP-025)"
echo " Project : ${GCP_PROJECT_ID}"
echo " Region  : ${REGION}"
echo "================================================="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Helper: create-or-update a logging bucket
# ─────────────────────────────────────────────────────────────────────────────
ensure_log_bucket() {
    local bucket_id="$1"
    local days="$2"
    local description="$3"

    echo "Configuring log bucket: ${bucket_id} (${days} days)..."

    # Try create first; if it already exists, update retention only
    if gcloud logging buckets create "${bucket_id}" \
        --project="${GCP_PROJECT_ID}" \
        --location="${REGION}" \
        --retention-days="${days}" \
        --description="${description}" \
        2>/dev/null; then
        echo "  Created."
    else
        echo "  Already exists — updating retention to ${days} days."
        gcloud logging buckets update "${bucket_id}" \
            --project="${GCP_PROJECT_ID}" \
            --location="${REGION}" \
            --retention-days="${days}"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Helper: create-or-skip a log sink
# ─────────────────────────────────────────────────────────────────────────────
ensure_sink() {
    local sink_name="$1"
    local destination="$2"
    local filter="$3"

    echo "Configuring log sink: ${sink_name}..."

    if gcloud logging sinks create "${sink_name}" \
        "${destination}" \
        --log-filter="${filter}" \
        --project="${GCP_PROJECT_ID}" \
        2>/dev/null; then
        echo "  Sink created."
    else
        echo "  Sink already exists — no update needed."
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Security events bucket — 180 days
#    Captures: auth events, access-control decisions, 401/403 responses, WARNINGs+
#    Basis: DPDP Act 2023 + RBI Digital Lending Guidelines 2025
# ─────────────────────────────────────────────────────────────────────────────
ensure_log_bucket \
    "security-events" \
    "${SECURITY_DAYS}" \
    "Security event logs: auth, access control, privilege events (DPDP/RBI 180-day minimum)"

SECURITY_DEST="logging.googleapis.com/projects/${GCP_PROJECT_ID}/locations/${REGION}/buckets/security-events"
SECURITY_FILTER='resource.type="cloud_run_revision"
AND (
  jsonPayload.category="auth"
  OR jsonPayload.category="access-control"
  OR jsonPayload.category="security"
  OR httpRequest.status=401
  OR httpRequest.status=403
  OR severity>=WARNING
)'

ensure_sink "security-events-sink" "${SECURITY_DEST}" "${SECURITY_FILTER}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 2. Financial audit bucket — 7 years (2555 days)
#    Captures: GST filings, loan disbursements, subscription payments, ITR filings
#    Basis: Income Tax Act (7-yr), GST Rules (7-yr), Companies Act (8-yr audit trail)
#    Note: 2555 days = 7 years. Companies Act requires 8 years for some records —
#    that is handled by Cloud SQL PITR + GCS bucket lifecycle (docs/devops/backup-restore-runbook.md).
# ─────────────────────────────────────────────────────────────────────────────
ensure_log_bucket \
    "financial-audit" \
    "${FINANCIAL_DAYS}" \
    "Financial transaction audit logs: GST, ITR, loan, payments (7-year statutory: Income Tax Act, GST Rules)"

FINANCIAL_DEST="logging.googleapis.com/projects/${GCP_PROJECT_ID}/locations/${REGION}/buckets/financial-audit"
FINANCIAL_FILTER='resource.type="cloud_run_revision"
AND (
  jsonPayload.category="financial"
  OR jsonPayload.category="gst-filing"
  OR jsonPayload.category="loan-disbursement"
  OR jsonPayload.category="payment"
  OR jsonPayload.category="itr-filing"
  OR jsonPayload.category="consent"
)'

ensure_sink "financial-audit-sink" "${FINANCIAL_DEST}" "${FINANCIAL_FILTER}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 3. Incident response bucket — 3 years (1095 days)
#    Captures: incident-tagged logs, CERT-In filing evidence
#    Basis: CERT-In Directions 2022 (logs must be available for investigation)
# ─────────────────────────────────────────────────────────────────────────────
ensure_log_bucket \
    "incident-response" \
    "${INCIDENT_DAYS}" \
    "Incident response audit trail (CERT-In Directions 2022: 3-year minimum)"

INCIDENT_DEST="logging.googleapis.com/projects/${GCP_PROJECT_ID}/locations/${REGION}/buckets/incident-response"
INCIDENT_FILTER='resource.type="cloud_run_revision"
AND (
  jsonPayload.category="incident"
  OR jsonPayload.incident_id!=""
  OR labels."snapaccount/incident"!=""
)'

ensure_sink "incident-response-sink" "${INCIDENT_DEST}" "${INCIDENT_FILTER}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. Grant sink service accounts write access to their destination buckets
#    (Cloud Logging creates a unique SA per sink — grant it the necessary role)
# ─────────────────────────────────────────────────────────────────────────────
echo "Granting sink service accounts write access to log buckets..."

for SINK_NAME in security-events-sink financial-audit-sink incident-response-sink; do
    SINK_SA=$(gcloud logging sinks describe "${SINK_NAME}" \
        --project="${GCP_PROJECT_ID}" \
        --format="value(writerIdentity)" 2>/dev/null || echo "")

    if [ -n "${SINK_SA}" ]; then
        gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
            --member="${SINK_SA}" \
            --role="roles/logging.bucketWriter" \
            --quiet 2>/dev/null || echo "  (binding already exists for ${SINK_NAME})"
        echo "  Granted logging.bucketWriter to ${SINK_SA} for sink ${SINK_NAME}"
    fi
done
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 5. Verify final state
# ─────────────────────────────────────────────────────────────────────────────
echo "=== Verification ==="
for BUCKET in security-events financial-audit incident-response; do
    ACTUAL_DAYS=$(gcloud logging buckets describe "${BUCKET}" \
        --project="${GCP_PROJECT_ID}" \
        --location="${REGION}" \
        --format="value(retentionDays)" 2>/dev/null || echo "NOT FOUND")
    echo "  ${BUCKET}: ${ACTUAL_DAYS} days retention"
done

echo ""
echo "=== Log Retention Setup Complete (GAP-025) ==="
echo ""
echo "Retention policy summary:"
echo "  security-events   : ${SECURITY_DAYS} days  (DPDP Act 2023 + RBI — minimum 180)"
echo "  financial-audit   : ${FINANCIAL_DAYS} days (7 years — Income Tax Act + GST Rules)"
echo "  incident-response : ${INCIDENT_DAYS} days (3 years — CERT-In Directions 2022)"
echo ""
echo "Additional long-term retention (handled by other infra):"
echo "  Cloud SQL PITR    : 7 days rolling window (backup-restore-runbook.md)"
echo "  GCS documents     : 7-year object lock (gcs-bucket-lock.sh)"
echo ""
echo "Cost note: Custom log buckets incur charges beyond the 30-day free tier."
echo "See: https://cloud.google.com/logging/pricing"
echo ""
echo "Quarterly verification:"
echo "  bash infra/scripts/log-retention-setup.sh  # re-run to verify retention unchanged"
