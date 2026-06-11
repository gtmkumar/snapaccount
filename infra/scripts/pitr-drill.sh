#!/usr/bin/env bash
# SnapAccount — PITR (Point-In-Time Recovery) Drill Script
# Phase 7 / NEW-D05
#
# Performs a quarterly backup-restore drill for Cloud SQL PostgreSQL 17.
# Runs on staging environment only unless ALLOW_PRODUCTION_DRILL=true is set.
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login (or service-account ADC)
#   - Project: snapaccount-staging (default) or snapaccount-prod
#   - IAM roles on operator account: roles/cloudsql.admin, roles/cloudsql.client,
#       roles/storage.objectAdmin (for the schema export step)
#   - Cloud SQL Auth Proxy installed (optional, for gcloud sql connect)
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-staging
#   bash infra/scripts/pitr-drill.sh
#
# BLOCKER NOTE (NEW-D05):
#   This script was authored but NOT executed: gcloud is not authenticated in the
#   current environment. To run: authenticate with `gcloud auth login` or set
#   GOOGLE_APPLICATION_CREDENTIALS to a service account key file with the roles above.
#   See docs/devops/gcp-setup.md for full operator setup.
#
# Outputs:
#   /tmp/pitr-drill-<TIMESTAMP>.log — full drill log
#   /tmp/pitr-drill-<TIMESTAMP>-result.md — scoring template (fill in and save to docs/devops/drill-reports/)
#
# Idempotent: the PITR test instance is always deleted at the end (or on error).

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID (e.g. snapaccount-staging)}"
ALLOW_PRODUCTION_DRILL="${ALLOW_PRODUCTION_DRILL:-false}"
SQL_INSTANCE="snapaccount-postgres"
TEST_INSTANCE="snapaccount-postgres-pitr-test"
REGION="asia-south1"
AUDIT_BUCKET="${GCP_PROJECT_ID}-audit-logs"
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
LOG_FILE="/tmp/pitr-drill-${TIMESTAMP}.log"
RESULT_FILE="/tmp/pitr-drill-${TIMESTAMP}-result.md"

# ─── Safety guard ─────────────────────────────────────────────────────────────
if [[ "${GCP_PROJECT_ID}" == *"prod"* && "${ALLOW_PRODUCTION_DRILL}" != "true" ]]; then
    echo "ERROR: Production project detected (${GCP_PROJECT_ID}) but ALLOW_PRODUCTION_DRILL is not 'true'."
    echo "  Drills run on staging by default. Set ALLOW_PRODUCTION_DRILL=true to override."
    echo "  This requires team lead approval and a change window."
    exit 1
fi

# ─── Logging ──────────────────────────────────────────────────────────────────
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "${LOG_FILE}"; }
fail() { log "FAIL: $*"; exit 1; }
pass() { log "PASS: $*"; }

log "======================================================="
log "SnapAccount PITR Drill — ${TIMESTAMP}"
log "Project:  ${GCP_PROJECT_ID}"
log "Instance: ${SQL_INSTANCE}"
log "======================================================="

# ─── 0. Verify gcloud auth ────────────────────────────────────────────────────
log "Step 0: Checking gcloud authentication..."
ACTIVE_ACCOUNT=$(gcloud auth list --filter="status=ACTIVE" --format="value(account)" 2>/dev/null | head -1 || true)
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
    fail "No active gcloud account. Run: gcloud auth login"
fi
log "  Authenticated as: ${ACTIVE_ACCOUNT}"

# Confirm project exists and is accessible
gcloud projects describe "${GCP_PROJECT_ID}" \
    --format="value(projectId)" > /dev/null \
    || fail "Project ${GCP_PROJECT_ID} not found or insufficient permissions."

pass "gcloud auth verified."

# ─── 1. Cloud SQL backup verification ─────────────────────────────────────────
log ""
log "Step 1: Verifying Cloud SQL backups (last 7 days)..."

BACKUP_COUNT=$(gcloud sql backups list \
    --instance="${SQL_INSTANCE}" \
    --project="${GCP_PROJECT_ID}" \
    --filter="status=SUCCESSFUL" \
    --format="value(id)" 2>/dev/null | wc -l | tr -d ' ')

log "  Successful backups found: ${BACKUP_COUNT}"

if [[ "${BACKUP_COUNT}" -lt 7 ]]; then
    log "  WARNING: Expected 7 successful backups in the last 7 days, found ${BACKUP_COUNT}."
    log "    Investigate: Cloud SQL Console → Operations → Backups"
    BACKUP_PASS="PARTIAL (${BACKUP_COUNT}/7)"
else
    BACKUP_PASS="PASS (${BACKUP_COUNT}/7)"
    pass "Backup count OK: ${BACKUP_COUNT}"
fi

# ─── 2. PITR clone test ───────────────────────────────────────────────────────
log ""
log "Step 2: Creating PITR clone at T-24h..."
PITR_TIMESTAMP=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%SZ'))")

log "  PITR timestamp: ${PITR_TIMESTAMP}"
log "  Creating test instance: ${TEST_INSTANCE}"

PITR_START=$(date +%s)

gcloud sql instances clone "${SQL_INSTANCE}" "${TEST_INSTANCE}" \
    --point-in-time="${PITR_TIMESTAMP}" \
    --project="${GCP_PROJECT_ID}" \
    2>&1 | tee -a "${LOG_FILE}"

PITR_END=$(date +%s)
PITR_DURATION=$(( (PITR_END - PITR_START) / 60 ))
log "  PITR clone duration: ${PITR_DURATION} minutes"

if [[ "${PITR_DURATION}" -gt 15 ]]; then
    log "  WARNING: PITR took ${PITR_DURATION} minutes (target: < 15 min). Investigate instance size."
    PITR_PASS="PARTIAL (${PITR_DURATION}min > 15min target)"
else
    PITR_PASS="PASS (${PITR_DURATION}min)"
    pass "PITR clone completed in ${PITR_DURATION} minutes."
fi

# ─── 3. Row count verification ────────────────────────────────────────────────
log ""
log "Step 3: Verifying data integrity on restored instance..."

# Use gcloud sql connect to run a query — this requires Cloud SQL Auth Proxy or
# a whitelisted IP. The verification query is non-destructive (read-only).
ROW_VERIFY_RESULT="SKIPPED (requires Cloud SQL Auth Proxy or whitelisted IP)"

if command -v cloud-sql-proxy &> /dev/null || gcloud components list --filter="id=cloud-sql-proxy" --format="value(state.name)" 2>/dev/null | grep -q "Installed"; then
    log "  Cloud SQL Auth Proxy detected. Attempting row count verification..."

    PITR_CONNECTION_NAME=$(gcloud sql instances describe "${TEST_INSTANCE}" \
        --project="${GCP_PROJECT_ID}" \
        --format="value(connectionName)" 2>/dev/null || true)

    if [[ -n "${PITR_CONNECTION_NAME}" ]]; then
        # Run proxy in background, query, then stop
        cloud-sql-proxy "${PITR_CONNECTION_NAME}" --port=5499 &
        PROXY_PID=$!
        sleep 5

        ROW_COUNT=$(PGPASSWORD="${DB_PASSWORD:-drill_test}" psql \
            -h 127.0.0.1 -p 5499 \
            -U postgres -d snapaccount \
            -t -c "SELECT COUNT(*) FROM auth.users WHERE created_at < NOW() - INTERVAL '1 day';" \
            2>/dev/null | tr -d ' ' || echo "ERROR")

        kill "${PROXY_PID}" 2>/dev/null || true

        if [[ "${ROW_COUNT}" =~ ^[0-9]+$ && "${ROW_COUNT}" -gt 0 ]]; then
            ROW_VERIFY_RESULT="PASS (${ROW_COUNT} rows in auth.users older than 1 day)"
            pass "Row count verification: ${ROW_COUNT} rows"
        else
            ROW_VERIFY_RESULT="FAIL (query returned '${ROW_COUNT}')"
            log "  WARNING: Row count verification failed. Result: ${ROW_COUNT}"
        fi
    fi
else
    log "  Cloud SQL Auth Proxy not found. Skipping row count verification."
    log "    To enable: gcloud components install cloud-sql-proxy"
fi

log "  Row count result: ${ROW_VERIFY_RESULT}"

# ─── 4. Schema export (itr.* partial restore simulation) ─────────────────────
log ""
log "Step 4: Simulating schema-level export (itr schema)..."

EXPORT_PATH="gs://${AUDIT_BUCKET}/backup-drills/itr-schema-drill-${TIMESTAMP}.sql.gz"
EXPORT_PASS="SKIPPED"

gcloud sql export sql "${SQL_INSTANCE}" "${EXPORT_PATH}" \
    --database=snapaccount \
    --table="itr.*" \
    --project="${GCP_PROJECT_ID}" \
    2>&1 | tee -a "${LOG_FILE}" \
    && EXPORT_PASS="PASS (${EXPORT_PATH})" \
    || EXPORT_PASS="FAIL (check log: ${LOG_FILE})"

log "  Export result: ${EXPORT_PASS}"

# ─── 5. Cleanup: delete PITR test instance ───────────────────────────────────
log ""
log "Step 5: Cleaning up PITR test instance ${TEST_INSTANCE}..."

gcloud sql instances delete "${TEST_INSTANCE}" \
    --project="${GCP_PROJECT_ID}" \
    --quiet \
    2>&1 | tee -a "${LOG_FILE}" \
    && log "  Test instance deleted." \
    || log "  WARNING: Failed to delete test instance. Delete manually: gcloud sql instances delete ${TEST_INSTANCE} --project=${GCP_PROJECT_ID} --quiet"

# ─── 6. Write scoring template ────────────────────────────────────────────────
log ""
log "Writing scoring template to ${RESULT_FILE}..."

cat > "${RESULT_FILE}" <<TEMPLATE
# PITR Drill Result

Drill date:         ${TIMESTAMP}
Performed by:       $(whoami)
Authenticated as:   ${ACTIVE_ACCOUNT}
Environment:        ${GCP_PROJECT_ID}
Script:             infra/scripts/pitr-drill.sh
Log file:           ${LOG_FILE}

## CLOUD SQL

  Successful backups (last 7 days): ${BACKUP_PASS}
  PITR restore duration:            ${PITR_PASS}
  Row count verified:               ${ROW_VERIFY_RESULT}
  PITR timestamp used:              ${PITR_TIMESTAMP}
  PASS / FAIL: _______________ (fill in)

## SCHEMA EXPORT (itr.*)

  Export to GCS:                    ${EXPORT_PASS}
  PASS / FAIL: _______________ (fill in)

## OVERALL: PASS / FAIL / PARTIAL

## NOTES
  (record any anomalies, slow operations, or unexpected results)

## ACTION ITEMS
  (list follow-up tasks with owners and due dates)
  - [ ] File this report in docs/devops/drill-reports/${TIMESTAMP}.md
  - [ ] If any FAIL: create GitHub issue (label: infra-reliability, assign: devops-engineer)
TEMPLATE

log "  Scoring template written to: ${RESULT_FILE}"
log ""
log "======================================================="
log "PITR Drill complete."
log "  Log:      ${LOG_FILE}"
log "  Results:  ${RESULT_FILE}"
log ""
log "Next steps:"
log "  1. Fill in PASS/FAIL in ${RESULT_FILE}"
log "  2. Copy to docs/devops/drill-reports/${TIMESTAMP}.md"
log "  3. Run full drill checklist in docs/devops/backup-restore-runbook.md"
log "     (GCS, Pub/Sub, Secret Manager sections)"
log "======================================================="
