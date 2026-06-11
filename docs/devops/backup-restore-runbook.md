# Backup and Restore Drill Runbook

**Phase:** 6F  
**Owner:** devops-engineer (runbook), team lead (drill scheduling)  
**Cadence:** Quarterly (January, April, July, October — first working week)  
**DPDP Act 2023 reference:** Data availability obligation; 7-year document retention requirement

---

## Overview

This runbook covers:

1. Cloud SQL backup verification
2. GCS object versioning check
3. Pub/Sub message retention verification
4. Secret Manager backup
5. Quarterly drill procedure and scoring template

Drills are performed on **staging environment** unless specified otherwise. Production restore drills require team lead approval and a change window.

---

## 1. Cloud SQL Backup Verification

### Automated backups

Cloud SQL is configured with:
- Daily automated backups at 02:00 IST
- 7-day backup retention
- Transaction log retention: 7 days (point-in-time recovery)

**Instance:** `snapaccount-postgres` (region: `asia-south1`)

### Verification commands

```bash
# List recent backups
gcloud sql backups list \
    --instance=snapaccount-postgres \
    --project="${GCP_PROJECT_ID}" \
    --limit=10

# Verify backup status (must be SUCCESSFUL — not FAILED or SKIPPED)
gcloud sql backups list \
    --instance=snapaccount-postgres \
    --project="${GCP_PROJECT_ID}" \
    --filter="status=SUCCESSFUL" \
    --format="table(id,windowStartTime,status,type,diskEncryptionConfiguration)"
```

Expected: at least 7 successful backups in the last 7 days. If any are missing: investigate Cloud SQL instance health and check GCP Console → SQL → Operations.

### Point-in-time recovery (PITR) test — quarterly drill

```bash
# 1. Create a test Cloud SQL instance from a PITR timestamp
#    Use a timestamp from 24 hours ago to verify log coverage
PITR_TIMESTAMP=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                 date -u -d "24 hours ago" +"%Y-%m-%dT%H:%M:%SZ")

gcloud sql instances clone snapaccount-postgres snapaccount-postgres-pitr-test \
    --point-in-time="${PITR_TIMESTAMP}" \
    --project="${GCP_PROJECT_ID}"

# 2. Connect and verify a known record exists
#    (use a stable record: e.g., the oldest user in auth.users)
gcloud sql connect snapaccount-postgres-pitr-test \
    --user=snapaccount-app \
    --database=snapaccount

# Run verification query:
# SELECT COUNT(*) FROM auth.users WHERE created_at < NOW() - INTERVAL '1 day';
# Expected: > 0 rows

# 3. Delete the test instance after verification
gcloud sql instances delete snapaccount-postgres-pitr-test \
    --project="${GCP_PROJECT_ID}" \
    --quiet
```

**Pass criteria:** Test instance restores within 15 minutes. Row count verification query returns expected result.

### Schema-per-service restore test

For a partial restore of a single service schema (e.g., `itr.*` after data corruption):

```bash
# Export the schema and its data to GCS
gcloud sql export sql snapaccount-postgres \
    "gs://${GCP_PROJECT_ID}-audit-logs/backup-drills/itr-schema-$(date +%Y%m%d).sql.gz" \
    --database=snapaccount \
    --table="itr.*" \
    --project="${GCP_PROJECT_ID}"

# Verify the export file exists and has non-zero size
gsutil stat "gs://${GCP_PROJECT_ID}-audit-logs/backup-drills/itr-schema-$(date +%Y%m%d).sql.gz"
```

---

## 2. GCS Object Versioning Check

All document buckets must have object versioning enabled for DPDP Act compliance (right to erasure requires soft-delete with recovery window before permanent deletion).

### Verification

```bash
BUCKETS=(
    "${GCP_PROJECT_ID}-documents"
    "${GCP_PROJECT_ID}-audit-logs"
    "${GCP_PROJECT_ID}-reports"
    "${GCP_PROJECT_ID}-loan-packages"
)

for BUCKET in "${BUCKETS[@]}"; do
    echo "Checking: gs://${BUCKET}"
    gcloud storage buckets describe "gs://${BUCKET}" \
        --format="value(versioning.enabled,lifecycle.rule[0].condition.age,labels)" 2>/dev/null || \
        echo "  ERROR: bucket not found or insufficient permissions"
    echo ""
done
```

**Pass criteria:**
- All 4 buckets exist and are accessible.
- Lifecycle rules are present (check `lifecycle.rule[0]` is not empty).

### Object restore test (quarterly drill)

```bash
# 1. Find a versioned object
gsutil ls -a "gs://${GCP_PROJECT_ID}-documents/" | head -5

# 2. Delete the object (creates a delete marker)
gsutil rm "gs://${GCP_PROJECT_ID}-documents/<test-object-path>"

# 3. Restore the previous version
gsutil cp "gs://${GCP_PROJECT_ID}-documents/<test-object-path>#<generation-number>" \
          "gs://${GCP_PROJECT_ID}-documents/<test-object-path>"

# 4. Verify restored object matches original (checksum)
gsutil hash "gs://${GCP_PROJECT_ID}-documents/<test-object-path>"
```

**Note:** Use a non-production test object. Never delete real user documents during a drill.

### DPDP Act erasure workflow test

The right-to-erasure workflow deletes GCS objects permanently (not just marking for lifecycle delete). Verify the DocumentService erasure endpoint correctly calls `storage.objects.delete` and that the object is unrecoverable after deletion (no versioned copies remain):

```bash
# After triggering erasure via DocumentService API (POST /documents/{id}/erase):
gsutil ls -a "gs://${GCP_PROJECT_ID}-documents/<erased-object-path>"
# Expected: CommandException: One or more URLs matched no objects.
```

---

## 3. Pub/Sub Message Retention Verification

All Pub/Sub topics are configured with 7-day message retention. Subscriptions with 7-day ack deadline ensure no messages are lost during service downtime up to 7 days.

### Verification

```bash
# List all SnapAccount topics and verify retention duration
gcloud pubsub topics list \
    --project="${GCP_PROJECT_ID}" \
    --filter="labels.app=snapaccount" \
    --format="table(name,messageRetentionDuration)"

# Verify subscription ack deadlines and dead-letter configuration
gcloud pubsub subscriptions list \
    --project="${GCP_PROJECT_ID}" \
    --filter="labels.app=snapaccount" \
    --format="table(name,ackDeadlineSeconds,messageRetentionDuration,deadLetterPolicy.maxDeliveryAttempts)"
```

**Pass criteria:**
- All topics have `messageRetentionDuration=604800s` (7 days).
- All subscriptions have `ackDeadlineSeconds=60` and `deadLetterPolicy.maxDeliveryAttempts=5`.
- Dead-letter topics exist for each primary topic.

### Dead-letter queue inspection (quarterly drill)

```bash
# Check dead-letter queues for accumulated unprocessed messages
for DL_TOPIC in $(gcloud pubsub topics list \
        --project="${GCP_PROJECT_ID}" \
        --filter="labels.type=dead-letter" \
        --format="value(name)"); do

    # Pull up to 10 messages (non-destructive with --auto-ack=false)
    gcloud pubsub subscriptions pull \
        "${DL_TOPIC}-sub" \
        --limit=10 \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || true

    echo "Dead-letter topic: ${DL_TOPIC}"
done
```

If dead-letter queues contain messages: investigate the root cause (malformed payload, service bug, schema mismatch) before the next drill.

---

## 4. Secret Manager Backup

Secret Manager is a GCP-managed service — Google is responsible for infrastructure availability. However, secret values themselves must be backed up to prevent accidental deletion or version corruption.

### Verification — all secrets have at least 2 versions

```bash
# List all SnapAccount secrets and their version counts
gcloud secrets list \
    --project="${GCP_PROJECT_ID}" \
    --filter="labels.app=snapaccount" \
    --format="table(name,createTime)" | while read SECRET_LINE; do
    SECRET_NAME=$(echo "${SECRET_LINE}" | awk '{print $1}')
    VERSION_COUNT=$(gcloud secrets versions list "${SECRET_NAME}" \
        --project="${GCP_PROJECT_ID}" \
        --filter="state=ENABLED" \
        --format="value(name)" 2>/dev/null | wc -l | tr -d ' ')
    echo "${SECRET_NAME}: ${VERSION_COUNT} enabled version(s)"
done
```

**Pass criteria:** Every secret has at least 1 enabled version. Secrets with `REPLACE_ME` value should be flagged as incomplete (not a failure, but a pre-launch blocker).

### Export secret names to audit log (quarterly drill)

```bash
# Export a list of all secret names (NOT values) for audit trail
gcloud secrets list \
    --project="${GCP_PROJECT_ID}" \
    --filter="labels.app=snapaccount" \
    --format="json" > /tmp/secret-inventory-$(date +%Y%m%d).json

# Upload to audit log bucket
gsutil cp /tmp/secret-inventory-$(date +%Y%m%d).json \
    "gs://${GCP_PROJECT_ID}-audit-logs/secret-inventory/$(date +%Y%m%d).json"

echo "Secret inventory uploaded. Count: $(cat /tmp/secret-inventory-$(date +%Y%m%d).json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
```

**Never export secret VALUES. This command exports names and metadata only.**

---

## 5. Quarterly Drill Procedure

### Automated drill script (NEW-D05)

The PITR component of the quarterly drill is scripted in `infra/scripts/pitr-drill.sh`.
Run it first; then complete GCS / Pub/Sub / Secret Manager sections manually (Sections 2–4 above).

```bash
# Prerequisites
gcloud auth login
# (or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json)

export GCP_PROJECT_ID=snapaccount-staging
bash infra/scripts/pitr-drill.sh

# Output files
#   /tmp/pitr-drill-<TIMESTAMP>.log      — full execution log
#   /tmp/pitr-drill-<TIMESTAMP>-result.md — scoring template (pre-filled from script)
```

**BLOCKER (NEW-D05):** The script was authored but not yet executed because `gcloud` is not
authenticated in the current environment. The first operator to run a quarterly drill must:
1. `gcloud auth login` (or configure ADC via a service account with `roles/cloudsql.admin` +
   `roles/cloudsql.client` + `roles/storage.objectAdmin` on `snapaccount-staging`).
2. Run the script.
3. File the result in `docs/devops/drill-reports/YYYY-MM-DD.md`.

### Scheduling

Drills are performed in the first working week of each quarter:

| Quarter | Target month | Drill date |
|---|---|---|
| Q1 | January | First Monday of January |
| Q2 | April | First Monday of April |
| Q3 | July | First Monday of July |
| Q4 | October | First Monday of October |

Drills take approximately 2 hours. Schedule a 3-hour window for first-time drills.

### Pre-drill checklist

- [ ] Notify team lead 1 week in advance (staging drill — no customer impact)
- [ ] Confirm staging environment is in a known-good state
- [ ] Verify `gcloud` CLI is authenticated to `snapaccount-staging` project
- [ ] Create a GCS test object for the restore test
- [ ] Set `GCP_PROJECT_ID=snapaccount-staging`

### Drill execution order

1. **Cloud SQL** — Run PITR test (Section 1). Record restore duration.
2. **GCS** — Run object restore test (Section 2). Record restore duration.
3. **Pub/Sub** — Run dead-letter queue inspection (Section 3). Record message count.
4. **Secret Manager** — Run secret inventory export (Section 4). Verify count matches expected.

### Scoring template

Copy this table to your drill report and fill in results:

```
Drill date:         YYYY-MM-DD
Performed by:       <name>
Environment:        staging
Duration:           <total hours>

CLOUD SQL
  PITR restore duration:        ___ minutes   (target: < 15 min)
  PITR row count verified:      YES / NO
  Backups in last 7 days:       ___ / 7       (target: 7/7)
  PASS / FAIL:

GCS
  Object restore successful:    YES / NO
  Restore duration:             ___ minutes   (target: < 5 min)
  Erasure workflow verified:    YES / NO
  Object versioning confirmed:  YES / NO (all 4 buckets)
  PASS / FAIL:

PUB/SUB
  Topics with 7-day retention:  ___ / total   (target: all)
  Dead-letter queues empty:     YES / NO
  Subscriptions ack deadline:   confirmed 60s: YES / NO
  PASS / FAIL:

SECRET MANAGER
  All secrets have enabled version: YES / NO
  REPLACE_ME secrets (pre-launch blockers): ___
  Secret inventory uploaded:    YES / NO
  PASS / FAIL:

OVERALL:  PASS / FAIL / PARTIAL
NOTES:
  (record any anomalies, slow operations, or failed checks)

ACTION ITEMS:
  (list any follow-up tasks with owners and due dates)
```

### Post-drill

- File the completed scoring template in `docs/devops/drill-reports/YYYY-MM-DD.md`
- If any check failed: create a GitHub issue with label `infra-reliability` and assign to devops-engineer
- If Secret Manager has unresolved `REPLACE_ME` values: escalate to team lead (pre-launch blocker)

---

## Related files

- `infra/scripts/pitr-drill.sh` — automated PITR drill script (NEW-D05)
- `docs/devops/drill-reports/` — filed quarterly drill reports (create directory on first drill)
- `infra/setup.sh` — Cloud SQL backup config (Step 5), GCS lifecycle (Step 7), Pub/Sub retention (Step 8), Secret Manager (Step 9)
- `docs/devops/loan-package-bucket-lifecycle.md` — Loan packages bucket lifecycle and Bucket Lock decision
- `docs/devops/staging-to-prod-promotion.md` — Staging to production promotion checklist
- `docs/devops/observability-slos.md` — SLOs and monitoring dashboards
