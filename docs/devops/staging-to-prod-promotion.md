# Staging to Production Promotion Runbook

**Phase:** 6F  
**Owner:** devops-engineer (infra steps), team lead (final approval gate)  
**Last updated:** 2026-04-25

---

## Overview

This runbook describes the checklist and procedure for promoting a release from staging to production. It covers:

1. Pre-promotion gates (QA, security, compliance, flags)
2. Infrastructure promotion steps
3. Cloud Run deployment (blue-green pattern)
4. Post-deployment verification
5. Rollback triggers and procedure

No deployment to production should occur without every gate below being confirmed. Gates are ordered: fail-fast at the earliest possible point.

---

## Pre-promotion gates

Work through these gates in order. Do not proceed past a failed gate.

### Gate 1: QA sign-off

- [ ] All automated CI tests pass on the release branch (GitHub Actions `ci.yml` — green)
- [ ] QA team has run the full E2E test suite on staging and signed off
- [ ] All P0 and P1 bugs are resolved or deferred with team lead approval
- [ ] Mobile app (if releasing): QA-mobile has run Expo staging build on physical devices
- [ ] Admin panel (if releasing): qa-web has completed cross-browser testing (Chrome, Safari, Firefox)

**Gate owner:** QA team (qa-web, qa-mobile)

### Gate 2: Security re-audit

- [ ] security-reviewer has completed a final pass on all changes in the release
- [ ] No unresolved HIGH or CRITICAL security findings (see `docs/security/`)
- [ ] All SEC flags from previous phases are resolved or formally accepted risk (documented)
- [ ] No secrets in git history (`git log --all --full-diff -p | grep -i "password\|secret\|key" | grep -v REPLACE_ME` clean)
- [ ] `gcloud container analysis occurrences list` — no CRITICAL CVEs in deployed images

**Gate owner:** security-reviewer

### Gate 3: DPDP compliance verified

- [ ] Data localization confirmed: all Cloud Run services and Cloud SQL in `asia-south1`
- [ ] Document retention lifecycle rules verified on all GCS buckets (≥ 7 years — see backup-restore-runbook.md Section 2)
- [ ] Right-to-erasure workflow tested on staging (Section 2 of backup-restore-runbook.md)
- [ ] Consent management UI reviewed by team lead
- [ ] No PII sent to external services outside India without documented consent

**Gate owner:** team lead (compliance sign-off)

### Gate 4: Phase flags cleared

All `P6-FLAG-*` items must be either resolved or formally deferred with a documented owner:

| Flag | Description | Status |
|---|---|---|
| P6-FLAG-04 | GSTN sandbox onboarding (5-10 business days) | Resolved / Deferred |
| P6-FLAG-REDIS-TIER | Memorystore STANDARD_HA approval for production | Resolved / Deferred |
| P6-FLAG-BUCKET-LOCK | Loan packages Bucket Lock approval | Resolved / Deferred |
| (add new flags here) | | |

To mark a flag as deferred: create a GitHub issue with label `prod-blocker`, assign to the owner, and document the deferred risk in this table.

**Gate owner:** team lead

### Gate 5: Infrastructure readiness

- [ ] Production Memorystore Redis is STANDARD_HA tier (not BASIC)
- [ ] Cloud SQL production instance has deletion protection enabled
- [ ] All `REPLACE_ME` secrets in Secret Manager have been replaced with real values
- [ ] GitHub Actions variables (`GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_CI_SERVICE_ACCOUNT`) are set for production
- [ ] VPC connector `snapaccount-vpc-connector` is running (`gcloud compute networks vpc-access connectors describe`)
- [ ] Artifact Registry images for all services are tagged and available

Verify infrastructure readiness:

```bash
export GCP_PROJECT_ID=snapaccount-prod

# Check for REPLACE_ME secrets
gcloud secrets list --project="${GCP_PROJECT_ID}" \
    --filter="labels.app=snapaccount" \
    --format="value(name)" | while read SECRET; do
    VALUE=$(gcloud secrets versions access latest \
        --secret="${SECRET}" \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || echo "ERROR")
    if [ "${VALUE}" = "REPLACE_ME" ]; then
        echo "BLOCKER: Secret ${SECRET} still has REPLACE_ME value"
    fi
done

# Check Redis tier
gcloud redis instances describe snapaccount-redis \
    --region=asia-south1 \
    --project="${GCP_PROJECT_ID}" \
    --format="value(tier)"
# Expected: STANDARD_HA
```

**Gate owner:** devops-engineer

---

## Deployment procedure

### Step 1: Tag the release image

```bash
export GCP_PROJECT_ID=snapaccount-prod
export STAGING_TAG=<staging-image-tag>    # e.g. git SHA from staging deploy
export RELEASE_TAG=v$(date +%Y.%m.%d)-1  # e.g. v2026.04.25-1
REGISTRY="asia-south1-docker.pkg.dev/${GCP_PROJECT_ID}/snapaccount/services"

SERVICES=(auth-service document-service accounting-service gst-service loan-service \
          itr-service chat-service notification-service report-service \
          subscription-service ai-service callback-service admin-panel)

for SVC in "${SERVICES[@]}"; do
    # Re-tag the staging image as the release version
    gcloud artifacts docker tags add \
        "${REGISTRY}/${SVC}:${STAGING_TAG}" \
        "${REGISTRY}/${SVC}:${RELEASE_TAG}"
    gcloud artifacts docker tags add \
        "${REGISTRY}/${SVC}:${STAGING_TAG}" \
        "${REGISTRY}/${SVC}:latest"
    echo "Tagged: ${SVC}:${RELEASE_TAG}"
done
```

### Step 2: Run database migrations

Database migrations run before the Cloud Run services are updated to ensure schema compatibility:

```bash
# Trigger the db-migrate workflow (GitHub Actions)
gh workflow run db-migrate.yml \
    --field environment=production \
    --field image_tag="${RELEASE_TAG}" \
    --repo "${GITHUB_ORG}/snapaccount"

# Monitor migration job
gh run watch --repo "${GITHUB_ORG}/snapaccount"
```

Alternatively, run the migration Cloud Run job directly:

```bash
gcloud run jobs execute db-migration-job \
    --region=asia-south1 \
    --project="${GCP_PROJECT_ID}" \
    --wait
```

**If migration fails:** STOP. Do not deploy new Cloud Run revisions. Investigate the migration error, fix the migration script (database-agent), and re-run.

### Step 3: Blue-green deployment via Cloud Run revisions

Cloud Run supports traffic splitting between revisions, enabling a blue-green pattern:

```bash
export GCP_PROJECT_ID=snapaccount-prod
export ENVIRONMENT=production
export IMAGE_TAG="${RELEASE_TAG}"

# Deploy all services (creates new revisions with 0% traffic)
# --no-traffic flag: deploy without shifting traffic immediately
bash infra/cloud-run-services.sh
```

Wait for all services to report `READY` before shifting traffic:

```bash
for SVC in auth-service document-service accounting-service gst-service loan-service \
           itr-service chat-service notification-service report-service \
           subscription-service ai-service callback-service admin-panel; do
    STATUS=$(gcloud run services describe "${SVC}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")
    echo "${SVC}: ${STATUS}"
done
```

**Note:** `infra/cloud-run-services.sh` does not use `--no-traffic` — traffic shifts immediately upon deploy. For a true blue-green promotion, modify the `gcloud run deploy` calls to add `--no-traffic`, then run a separate `gcloud run services update-traffic` command. This is a future enhancement tracked in the GitHub repository.

### Step 4: Tag the production revision

After all services are deployed and traffic is shifted:

```bash
for SVC in auth-service document-service accounting-service gst-service loan-service \
           itr-service chat-service notification-service report-service \
           subscription-service ai-service callback-service; do
    # Get the latest revision name
    REVISION=$(gcloud run services describe "${SVC}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --format="value(status.latestReadyRevisionName)")

    # Tag it for audit trail
    gcloud run revisions update "${REVISION}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --update-labels="release=${RELEASE_TAG},promoted-date=$(date +%Y-%m-%d)"

    echo "Tagged revision: ${SVC} → ${REVISION}"
done
```

---

## Post-deployment verification

Run these checks within 15 minutes of deployment:

```bash
# 1. All services report Ready
for SVC in auth-service document-service accounting-service gst-service loan-service \
           itr-service chat-service notification-service report-service \
           subscription-service ai-service callback-service admin-panel; do
    URL=$(gcloud run services describe "${SVC}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --format="value(status.url)" 2>/dev/null || echo "N/A")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" \
        -H "Authorization: Bearer $(gcloud auth print-identity-token)" 2>/dev/null || echo "ERR")
    echo "${SVC}: ${HTTP_CODE}  (${URL})"
done
# Expected: all 200 or 204

# 2. Check Cloud Monitoring for error spikes (5 minutes post-deploy)
# Open: https://console.cloud.google.com/monitoring/dashboards?project=snapaccount-prod
# Look for: error rate > 0 or latency regression > 2x baseline

# 3. Check Pub/Sub dead-letter queues for new messages
for DL_TOPIC in $(gcloud pubsub topics list \
        --project="${GCP_PROJECT_ID}" \
        --filter="labels.type=dead-letter" \
        --format="value(name)"); do
    MSG_COUNT=$(gcloud pubsub subscriptions describe "${DL_TOPIC}-sub" \
        --project="${GCP_PROJECT_ID}" \
        --format="value(messageRetentionDuration)" 2>/dev/null || echo "N/A")
    echo "${DL_TOPIC}: ${MSG_COUNT}"
done

# 4. ChatService SignalR check
# Verify a WebSocket connection can be established to the chat-service URL
# (requires a test token — run from the admin panel or mobile app in staging)
```

**Pass criteria:**
- All `/health` endpoints return 2xx.
- No error spikes in Cloud Monitoring for 10 minutes post-deploy.
- Pub/Sub dead-letter queues empty or no new messages since deploy.

---

## Rollback triggers

Initiate rollback immediately if any of the following occur within 30 minutes of deployment:

| Trigger | Threshold | Action |
|---|---|---|
| Error rate spike | > 1% 5xx for 5 consecutive minutes on any service | Rollback immediately |
| p95 latency regression | > 3x pre-deploy baseline on auth/chat/notification | Rollback immediately |
| Health check failure | Any service `/health` returns non-2xx | Rollback immediately |
| Database migration failure | Migration job exits non-zero | Stop deploy; rollback DB (see below) |
| SignalR connection failure | ChatService WebSocket handshake fails | Rollback chat-service only |
| Pub/Sub message accumulation | Dead-letter queue grows > 100 messages/5 min | Rollback affected service |

### Rollback procedure

Cloud Run keeps the previous revision available. Roll back by routing all traffic to the previous revision:

```bash
# Roll back a specific service to the previous revision
rollback_service() {
    local SVC="$1"
    local PREVIOUS_REVISION
    PREVIOUS_REVISION=$(gcloud run revisions list \
        --service="${SVC}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --sort-by="~createTime" \
        --limit=2 \
        --format="value(metadata.name)" | tail -1)

    echo "Rolling back ${SVC} to ${PREVIOUS_REVISION}..."
    gcloud run services update-traffic "${SVC}" \
        --region=asia-south1 \
        --project="${GCP_PROJECT_ID}" \
        --to-revisions="${PREVIOUS_REVISION}=100"
    echo "Rollback complete: ${SVC} → ${PREVIOUS_REVISION}"
}

# Rollback all services (production emergency)
for SVC in auth-service document-service accounting-service gst-service loan-service \
           itr-service chat-service notification-service report-service \
           subscription-service ai-service callback-service admin-panel; do
    rollback_service "${SVC}"
done
```

### Database rollback

If a migration failure caused data corruption:

```bash
# Use PITR to restore to pre-migration state
# See docs/devops/backup-restore-runbook.md Section 1 for PITR procedure

# CAUTION: PITR replaces the entire instance — all post-PITR writes are lost.
# Use only for migration-induced corruption.
# Coordinate with db-engineer before executing.
```

---

## Post-rollback

After rollback:

1. Open a GitHub issue with label `prod-incident`, severity `P0`, assigned to team lead.
2. Document what failed, when, and which services were affected.
3. Do not re-attempt promotion until the root cause is identified and fixed.
4. Run the full QA + security gate cycle again before next promotion attempt.

---

## Related files

- `infra/cloud-run-services.sh` — service deployment script
- `infra/setup.sh` — infrastructure bootstrap
- `infra/cloud-monitoring-dashboards.sh` — dashboard provisioning
- `docs/devops/backup-restore-runbook.md` — backup verification and PITR procedures
- `docs/devops/observability-slos.md` — SLO targets and alerting
- `.github/workflows/cd.yml` — automated production deployment workflow
