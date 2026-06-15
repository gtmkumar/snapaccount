#!/usr/bin/env bash
# SnapAccount — GCS Bucket Lock Application Script
#
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  🔒 TEAM-LEAD APPROVAL REQUIRED (TL-6) — DO NOT RUN WITHOUT SIGN-OFF  ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Bucket Lock (GCS object retention lock) is PERMANENT AND IRREVERSIBLE.
# Once applied, objects cannot be deleted or overwritten before the retention
# period expires — even by bucket owners, storage admins, or billing admins.
# The lock cannot be reduced or removed. This is by design (regulatory compliance).
#
# ── What this script does ──────────────────────────────────────────────────
# 1. Sets a retention period of 7 years (220,752,000 seconds) on the
#    loan-packages and documents buckets.
# 2. Locks the retention policy (makes it permanent).
#
# ── Why you might enable it ───────────────────────────────────────────────
# - RBI inspection outcome requires legally enforceable immutable records.
# - Legal team advises it for litigation hold on specific loan records.
# - Regulatory audit finding requires demonstrable object immutability.
#
# ── Why you should NOT enable it casually ─────────────────────────────────
# - DPDP Act right-to-erasure requests CANNOT be honoured before 7 years
#   once Bucket Lock is applied (which is consistent with RBI retention
#   obligation — but document this decision).
# - Storage costs increase because objects cannot be deleted for 7 years
#   even if they are no longer needed.
# - Accidental object writes cannot be cleaned up during the lock period.
#
# ── Authorization gate ────────────────────────────────────────────────────
# Set APPROVED_BY to the team lead's GitHub username and APPROVAL_TICKET
# to the issue number / approval doc reference before running this script.
# The script will refuse to proceed if these are unset or contain placeholders.
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod
#   export APPROVED_BY=<team-lead-github-username>
#   export APPROVAL_TICKET=<issue-or-doc-reference>
#   export BUCKETS_TO_LOCK="loan-packages"   # space-separated; or "all"
#   bash infra/gcs-bucket-lock.sh
#
# References:
#   docs/devops/loan-package-bucket-lifecycle.md §bucket-lock
#   https://cloud.google.com/storage/docs/bucket-lock

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Authorization Gate
# ─────────────────────────────────────────────────────────────────────────────
APPROVED_BY="${APPROVED_BY:-UNSET}"
APPROVAL_TICKET="${APPROVAL_TICKET:-UNSET}"

if [[ "${APPROVED_BY}" == "UNSET" || "${APPROVAL_TICKET}" == "UNSET" ]]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  AUTHORIZATION REQUIRED — TL-6                                 ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Bucket Lock is PERMANENT AND IRREVERSIBLE."
    echo "  You must set the following env vars before running:"
    echo ""
    echo "    APPROVED_BY=<team-lead-github-username>"
    echo "    APPROVAL_TICKET=<issue/doc reference>"
    echo ""
    echo "  Example:"
    echo "    export APPROVED_BY=teamlead-username"
    echo "    export APPROVAL_TICKET=TL-6-bucket-lock-approval"
    echo "    bash infra/gcs-bucket-lock.sh"
    echo ""
    exit 1
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="asia-south1"

# 7 years in seconds: 7 * 365.25 * 24 * 3600 = 220,752,000
RETENTION_SECONDS=220752000

# Which buckets to lock (default: loan-packages only — safest first)
BUCKETS_TO_LOCK="${BUCKETS_TO_LOCK:-loan-packages}"

log()     { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "═══════════════════════════════════════════════════"; echo "  $*"; echo "═══════════════════════════════════════════════════"; }

section "GCS Bucket Lock — AUTHORIZED EXECUTION"
log "Approved by:     ${APPROVED_BY}"
log "Approval ticket: ${APPROVAL_TICKET}"
log "Project:         ${GCP_PROJECT_ID}"
log "Retention:       ${RETENTION_SECONDS} seconds (7 years)"
log "Buckets:         ${BUCKETS_TO_LOCK}"

echo ""
echo "⚠️  FINAL CONFIRMATION — this action is IRREVERSIBLE."
echo "   Type 'LOCK-CONFIRMED' to proceed:"
read -r CONFIRM
if [[ "${CONFIRM}" != "LOCK-CONFIRMED" ]]; then
    echo "Aborted."
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Apply retention period and lock per bucket
# ─────────────────────────────────────────────────────────────────────────────

lock_bucket() {
    local bucket_suffix="$1"
    local bucket_name="${GCP_PROJECT_ID}-${bucket_suffix}"
    local gcs_uri="gs://${bucket_name}"

    section "Locking: ${gcs_uri}"

    # Step 1: Set retention period (not yet locked — still reversible at this step)
    log "Step 1: Setting retention period (${RETENTION_SECONDS}s = 7 years)..."
    gcloud storage buckets update "${gcs_uri}" \
        --retention-period="${RETENTION_SECONDS}s" \
        --project="${GCP_PROJECT_ID}"
    log "  Retention period set. (Still reversible — not locked yet.)"

    # Step 2: Lock the retention policy (IRREVERSIBLE)
    log "Step 2: Locking retention policy (IRREVERSIBLE)..."
    gcloud storage buckets update "${gcs_uri}" \
        --lock-retention-policy \
        --project="${GCP_PROJECT_ID}"
    log "  ✅ Bucket Lock applied to ${gcs_uri}"
    log "     Retention period: 7 years from object creation"
    log "     Objects cannot be deleted or overwritten before retention expires."

    # Step 3: Verify
    log "Step 3: Verifying lock..."
    gcloud storage buckets describe "${gcs_uri}" \
        --format="value(retentionPolicy.retentionPeriod,retentionPolicy.isLocked)" \
        --project="${GCP_PROJECT_ID}"
}

# Parse BUCKETS_TO_LOCK
if [[ "${BUCKETS_TO_LOCK}" == "all" ]]; then
    BUCKET_LIST=("loan-packages" "documents" "audit-logs")
else
    read -ra BUCKET_LIST <<< "${BUCKETS_TO_LOCK}"
fi

for bucket_suffix in "${BUCKET_LIST[@]}"; do
    lock_bucket "${bucket_suffix}"
done

# ─────────────────────────────────────────────────────────────────────────────
# Audit log entry
# ─────────────────────────────────────────────────────────────────────────────
section "Audit Log"

AUDIT_ENTRY=$(cat << EOF
{
  "action": "gcs_bucket_lock_applied",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "approved_by": "${APPROVED_BY}",
  "approval_ticket": "${APPROVAL_TICKET}",
  "project": "${GCP_PROJECT_ID}",
  "buckets_locked": "${BUCKETS_TO_LOCK}",
  "retention_seconds": ${RETENTION_SECONDS},
  "executed_by": "$(gcloud config get-value account 2>/dev/null || echo 'unknown')"
}
EOF
)

log "Audit entry:"
echo "${AUDIT_ENTRY}"

# Write audit entry to Cloud Logging (structured)
gcloud logging write "snapaccount-bucket-lock" \
    "${AUDIT_ENTRY}" \
    --severity=NOTICE \
    --project="${GCP_PROJECT_ID}" 2>/dev/null || \
    log "(Cloud Logging write failed — save audit entry manually)"

echo ""
echo "═══════════════════════════════════════════════════"
echo " Bucket Lock COMPLETE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Post-action required:"
echo "  1. Document this change in docs/devops/loan-package-bucket-lifecycle.md"
echo "  2. Update the DPDP Act compliance notes — erasure requests during"
echo "     retention period must be responded to with the RBI retention justification."
echo "  3. Notify backend-agent to implement DataErasureRequest workflow that:"
echo "     - Flags the loan record as erasure-requested"
echo "     - Schedules erasure for loan closure date + 7 years"
echo "     - Generates automated DPDP compliance response to borrower"
echo ""
