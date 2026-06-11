# Incident Response Runbook (GAP-025)

**Owner:** devops-engineer (runbook, log retention) + security-reviewer (VAPT plan)
**Date:** 2026-06-11
**Regulatory basis:** CERT-In Directions 2022 (6h reporting), DPDP Act 2023 / DPB 72h
breach notification, RBI Digital Lending 2025 (supervisory reporting), IT Act 2000/2025.

> **Companion document:** `docs/security/vapt-plan.md` (VAPT schedule — security-reviewer).
> **DPO contact:** `mobile/src/config/privacyContact.ts` (TL-10 — pending DPO appointment).

---

## Part A — Severity Classification Matrix

All incidents are classified by Severity 1–4 at the time of detection. Classification may be
upgraded as more information becomes available. Downgrade requires team lead sign-off.

| Severity | Name | Definition | Examples | Max Time to Declare |
|---|---|---|---|---|
| **S1** | Critical | Active exploit, confirmed data breach, or complete service outage affecting paying customers | Unauthorized DB access; credential leak confirmed exploited; all 12 Cloud Run services down; ransomware | Immediately (< 15 min) |
| **S2** | Major | Partial service degradation affecting a regulated feature, suspected breach pending investigation, or SLA breach > 30 min | Auth service down (no logins); CERT-In-reportable incident suspected; Cloud SQL unreachable; payment webhook failures > 1h | < 1 hour |
| **S3** | Moderate | Single non-critical service degraded, elevated error rates but workarounds available, potential data quality issue | Document OCR unavailable; GST filing endpoint errors; admin panel login loop; Pub/Sub consumer lag > 10 min | < 4 hours |
| **S4** | Low | Cosmetic issue, single-user report, infrastructure warning (no user impact yet) | Dashboard widget shows stale data; Cloud Monitoring alert fired but no user reports; single failed Hangfire job | < 24 hours (next business day for off-hours) |

### S1/S2 Escalation Rule

Any incident involving the following data classes is **automatically S1**:
- Confirmed or suspected unauthorized access to PAYMENT, KYC, or PAN data
- Firebase Auth compromise (affects all sessions)
- SESSION_JWT_SECRET exposure
- Cloud SQL credential exposure

---

## Part B — On-Call Expectations

### B.1 Rotation and Contact

| Role | Responsibility | Contact method |
|---|---|---|
| On-call DevOps | First responder; infra triage; Cloud Run / Cloud SQL / GCS diagnosis | PagerDuty (primary) → WhatsApp backup |
| On-call Backend | Application-layer diagnosis; service restart decisions | PagerDuty |
| Team Lead | S1/S2 decisions; external comms; regulator notifications; Cloud SQL restore approval | Direct call + WhatsApp |
| DPO (TL-10 pending) | DPDP breach assessment; Data Protection Board notification | Per `privacyContact.ts` once appointed |
| Legal | RBI supervisory notification; CERT-In statutory notice | Contact via team lead |

### B.2 Response Time SLAs

| Severity | First acknowledgement | Incident bridge opens | Status update cadence |
|---|---|---|---|
| S1 | 15 minutes (24×7) | Immediately | Every 30 min until resolved |
| S2 | 1 hour (24×7) | Within 1 hour | Every 2 hours |
| S3 | 4 hours (business hours) | As needed | Daily |
| S4 | Next business day | Not required | End of resolution |

### B.3 Communication Channels

- **Internal war room:** Dedicated WhatsApp group `#incident-war-room` (team lead creates per incident)
- **Customer communication:** Status page (TBD — add to GAP backlog); interim: team lead sends email via SendGrid blast for S1 affecting > 10% of active users
- **Regulatory communication:** See Part D (external reporting obligations)

---

## Part C — Incident Response Playbook

### C.1 Detection → Declaration

```
Detection (alert / user report / security scan)
    │
    ▼
On-call DevOps acknowledges within SLA
    │
    ▼
Initial triage (5-15 min):
  - Which services are affected? (Cloud Run dashboard)
  - Are there active exploits or data access anomalies? (Cloud Logging)
  - Is this a known maintenance event? (infra/staging-to-prod-promotion.md)
    │
    ▼
Classify severity (S1/S2/S3/S4)
    │
    ├─ S1/S2 ──► Notify team lead immediately → open incident bridge
    │
    └─ S3/S4 ──► Log in incident tracker → standard resolution flow
```

### C.2 Containment Steps by Incident Type

#### C.2.1 Suspected Credential/Key Compromise

```bash
# Step 1: Immediately revoke the compromised credential
# Firebase service account key (GAP-001 pattern):
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=firebase-adminsdk@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# Step 2: Rotate the secret in Secret Manager
printf '%s' '<new-value>' | gcloud secrets versions add SECRET_NAME \
  --data-file=- --project="${GCP_PROJECT_ID}"

# Step 3: Force new Cloud Run revisions to pick up rotated secret
for SERVICE in auth-service document-service accounting-service gst-service \
    loan-service itr-service chat-service notification-service report-service \
    subscription-service ai-service callback-service; do
  gcloud run services update "${SERVICE}" \
    --region=asia-south1 --project="${GCP_PROJECT_ID}" \
    --no-traffic  # no-traffic update to force revision without routing
done

# Step 4: Revoke all active sessions (SESSION_JWT_SECRET rotation invalidates all JWTs)
# Users will be prompted to log in again — this is the intended behavior for a key compromise

# Step 5: Preserve audit evidence
gcloud logging read \
  "resource.type=cloud_run_revision AND severity>=WARNING" \
  --project="${GCP_PROJECT_ID}" \
  --freshness=24h \
  --format=json > /tmp/incident-$(date +%Y%m%d-%H%M%S)-audit.json
```

#### C.2.2 Cloud SQL Unreachable / Data Corruption

```bash
# Step 1: Check instance status
gcloud sql instances describe snapaccount-postgres \
  --project="${GCP_PROJECT_ID}" --format="value(state)"

# Step 2: Check recent backup
gcloud sql backups list \
  --instance=snapaccount-postgres \
  --project="${GCP_PROJECT_ID}" \
  --filter="status=SUCCESSFUL" --limit=3

# Step 3: If PITR restore needed — follow docs/devops/backup-restore-runbook.md
# PITR requires team lead approval (irreversible point-in-time restore)

# Step 4: If connection issue only (not data corruption):
# Check VPC connector status
gcloud compute networks vpc-access connectors describe snapaccount-vpc-connector \
  --region=asia-south1 --project="${GCP_PROJECT_ID}"
```

#### C.2.3 Cloud Run Service Down (all replicas failing)

```bash
# Step 1: Check recent deployment
gcloud run revisions list \
  --service=auth-service --region=asia-south1 \
  --project="${GCP_PROJECT_ID}" --limit=3

# Step 2: Roll back to last healthy revision
gcloud run services update-traffic auth-service \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-south1 --project="${GCP_PROJECT_ID}"

# Step 3: Diagnose failing revision logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=auth-service AND severity>=ERROR" \
  --project="${GCP_PROJECT_ID}" --freshness=1h --format=json | head -100
```

#### C.2.4 Suspected Unauthorized Data Access (Breach Investigation)

```bash
# Step 1: Immediately preserve logs (do not allow auto-expiry)
# Create a dedicated log sink for the incident window
gcloud logging sinks create incident-$(date +%Y%m%d) \
  storage.googleapis.com/snapaccount-audit-logs-${GCP_PROJECT_ID} \
  --log-filter='resource.type="cloud_sql_database" OR resource.type="cloud_run_revision"' \
  --project="${GCP_PROJECT_ID}"

# Step 2: Check Cloud SQL audit logs for unusual queries
gcloud logging read \
  'resource.type="cloud_sql_database" AND protoPayload.methodName=("cloudsql.instances.query")' \
  --project="${GCP_PROJECT_ID}" \
  --freshness=24h --format=json > /tmp/sql-audit-$(date +%Y%m%d).json

# Step 3: Check for unusual IP access patterns
gcloud logging read \
  'resource.type="cloud_run_revision" AND httpRequest.status>=200 AND httpRequest.status<300' \
  --project="${GCP_PROJECT_ID}" \
  --freshness=6h --format=json | \
  python3 -c "import json,sys; [print(r.get('httpRequest',{}).get('remoteIp','?')) for r in (json.loads(l) for l in sys.stdin if l.strip())]" | \
  sort | uniq -c | sort -rn | head -20

# Step 4: Assess what data classes were potentially accessed
# (Use Cloud SQL audit logs to identify which schemas/tables were queried)

# Step 5: Contact DPO + legal for DPDP assessment (see Part D)
```

### C.3 Post-Incident Actions

All S1/S2 incidents require a post-incident review (PIR) within 5 business days:

1. **Timeline reconstruction** — minute-by-minute from detection to resolution
2. **Root cause** — technical root cause (5 Whys)
3. **Impact assessment** — which users, what data classes, duration
4. **Regulatory assessment** — did this meet CERT-In / DPB reporting thresholds? (see Part D)
5. **Corrective actions** — infra hardening, monitoring improvements, process changes
6. **Update runbook** — if this playbook was insufficient, amend it

PIR document template: save to `.claude/orchestrator/incident-reports/PIR-YYYY-MM-DD.md`

---

## Part D — Regulatory Reporting Obligations

### D.1 CERT-In — 6-Hour Reporting (IT Act 2000, CERT-In Directions 2022)

**Trigger:** Any of the following must be reported to CERT-In within **6 hours of detection**:
- Targeted scanning/probing of critical networks
- Compromise of critical systems
- Unauthorized access to IT systems and data
- Defacement of websites or portals
- Malicious code attacks
- Attacks on servers and network infrastructure
- Identity theft / spoofing / phishing attacks
- Denial of Service (DoS) / DDoS attacks
- Attacks on Internet of Things (IoT) devices
- Attacks via emails
- Rogue mobile applications
- Data breach / data leak
- Attacks on critical infrastructure (payments infrastructure falls in scope)

**Where to report:**
```
CERT-In Incident Reporting
Portal: https://incident.cert-in.org.in
Email:  incident@cert-in.org.in
Phone:  1800-11-4949 (toll-free, 24×7)
```

**What to include in the CERT-In report:**
- Incident ID (internal reference)
- Date and time of detection (IST)
- Type of incident (from the list above)
- Affected systems and data types
- Estimated impact (number of users, data volume)
- Actions taken so far
- Contact person details (name, email, phone)

**Who files:** Team lead + Legal. DevOps prepares the technical summary within 2 hours of
incident declaration for S1 incidents.

**6-Hour Clock:** Starts from the moment the incident is DETECTED (alert fired, user reported,
or security tool flagged) — not from when it is confirmed. File a preliminary report within 6
hours even if investigation is incomplete; update with a follow-up report once confirmed.

```
T+0h   Incident detected
T+1h   On-call DevOps acknowledges + initial triage
T+2h   DevOps technical summary ready
T+3h   Team lead assesses CERT-In reporting threshold
T+5h   CERT-In preliminary report filed (if threshold met)
T+6h   CERT-In deadline
T+24h  Follow-up report with full details
```

### D.2 DPDP Act 2023 — 72-Hour Data Protection Board Notification

**Trigger:** Any personal data breach (unauthorized access, disclosure, alteration, or loss of
personal data — PII, KYC, financial data of natural persons).

**Where to report:** Data Protection Board of India (DPB)
```
Portal: https://dataprotectionboard.gov.in (once operational)
Interim: Ministry of Electronics and IT (MeitY) at https://meity.gov.in
Email:  dpb@meity.gov.in (interim address — verify before use)
```

**72-Hour Clock:** Starts from when the organization "becomes aware" of the breach. Detection
of a potential breach starts the clock; confirmation is not required to begin reporting.

**DPO Involvement (TL-10 — pending appointment):**
- Once DPO is appointed, ALL DPB notifications must be co-signed by the DPO
- Until appointment, team lead is the designated contact for DPB
- DPO contact config: `mobile/src/config/privacyContact.ts` (update once TL-10 complete)

**What to include in DPB notification:**
1. Nature of the personal data breach
2. Categories and approximate number of data principals affected
3. Categories and approximate volume of personal data records concerned
4. Contact details of DPO (or team lead if DPO not yet appointed)
5. Description of likely consequences
6. Description of measures taken or proposed to address the breach
7. Whether the breach has been reported to CERT-In (cross-reference)

**User notification:** If the breach is likely to result in high risk to rights and freedoms
of affected data principals, notify them individually (in addition to DPB). Use the
`NotificationService` broadcast channel. Template: "We detected unauthorized access to your
account data. [Specific data types] may have been affected. We recommend [actions]. Contact
us at [DPO contact]."

### D.3 RBI Supervisory Notification

**Trigger:** Any incident materially affecting payment processing, loan disbursement, or
user data associated with a regulated entity (partner banks, Razorpay). Also triggered if
the incident involves a third-party vendor failure affecting our regulated operations.

**Where to report:** Report to SnapAccount's regulatory liaison at the partner bank AND to
RBI's DPSS (Department of Payment and Settlement Systems) via the bank's RBI reporting channel.

**Timeline:** RBI does not specify a fixed clock for lending platforms (not PSOs directly),
but as an LSP (Loan Service Provider), notify within **24 hours** of incident declaration for
S1/S2 incidents affecting loan data. Follow the partner bank's IRR (Incident Reporting
Requirements) documentation.

**What to include:** Loan application IDs affected, whether disbursement data was accessed,
partner bank name, corrective actions taken.

---

## Part E — Log Retention Policy

### E.1 Statutory Retention Requirements

| Log Type | Data Class | Retention Required | Basis |
|---|---|---|---|
| Security event logs (auth, access, privilege escalation) | AUTH, OPERATIONAL | **180 days minimum** | DPDP Act 2023 + RBI Digital Lending |
| Financial transaction logs (loan disbursement, GST filing, subscription payments) | PAYMENT, FINANCIAL | **7 years** | Income Tax Act + GST rules + Companies Act |
| User consent records | PII, AUTH | **7 years (after consent withdrawn + erasure)** | DPDP Act 2023 |
| Document upload audit trail | KYC, FINANCIAL | **7 years** | Document retention obligation |
| Incident response logs | OPERATIONAL | **3 years** | CERT-In Directions 2022 |
| Cloud Run operational logs (non-security) | OPERATIONAL | **30 days** | Operational standard |
| Cloud Monitoring metrics | OPERATIONAL | **6 weeks** (Cloud Monitoring default) | Operational standard |

### E.2 GCP Log Retention Configuration

Cloud Logging default retention is 30 days for most log types (`_Default` bucket). To meet
the 180-day and 7-year requirements, configure custom log buckets:

```bash
#!/usr/bin/env bash
# Configure log retention per statutory requirements (GAP-025)
# Run after infra/setup.sh Step 1 (project creation)
# No gcloud execution without auth — run by operator after: gcloud auth login

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="asia-south1"

echo "=== SnapAccount Log Retention Configuration (GAP-025) ==="

# ─────────────────────────────────────────────────────────────────
# 1. Security events bucket — 180-day retention (DPDP + RBI)
# ─────────────────────────────────────────────────────────────────
echo "Creating security-events log bucket (180-day retention)..."
gcloud logging buckets create security-events \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=180 \
  --description="Security event logs: auth, access control, privilege events (DPDP/RBI 180-day)" \
  2>/dev/null || echo "  (bucket already exists — updating retention)"

gcloud logging buckets update security-events \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=180

# Route security-relevant logs to this bucket
gcloud logging sinks create security-events-sink \
  "logging.googleapis.com/projects/${GCP_PROJECT_ID}/locations/${REGION}/buckets/security-events" \
  --log-filter='
    resource.type="cloud_run_revision"
    AND (
      jsonPayload.category="auth"
      OR jsonPayload.category="access-control"
      OR jsonPayload.category="security"
      OR httpRequest.status=401
      OR httpRequest.status=403
      OR severity>=WARNING
    )
  ' \
  --project="${GCP_PROJECT_ID}" \
  2>/dev/null || echo "  (sink already exists)"

echo "  Security-events bucket: 180-day retention in ${REGION}"

# ─────────────────────────────────────────────────────────────────
# 2. Financial audit log bucket — 7-year retention (statutory)
# ─────────────────────────────────────────────────────────────────
echo "Creating financial-audit log bucket (7-year = 2555-day retention)..."
gcloud logging buckets create financial-audit \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=2555 \
  --description="Financial transaction audit: GST filings, loan disbursements, payments (7-year statutory)" \
  2>/dev/null || echo "  (bucket already exists — updating retention)"

gcloud logging buckets update financial-audit \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=2555

# Route financial transaction logs (structured log field: category=financial)
gcloud logging sinks create financial-audit-sink \
  "logging.googleapis.com/projects/${GCP_PROJECT_ID}/locations/${REGION}/buckets/financial-audit" \
  --log-filter='
    resource.type="cloud_run_revision"
    AND (
      jsonPayload.category="financial"
      OR jsonPayload.category="gst-filing"
      OR jsonPayload.category="loan-disbursement"
      OR jsonPayload.category="payment"
      OR jsonPayload.category="itr-filing"
    )
  ' \
  --project="${GCP_PROJECT_ID}" \
  2>/dev/null || echo "  (sink already exists)"

echo "  Financial-audit bucket: 2555-day (7-year) retention in ${REGION}"

# ─────────────────────────────────────────────────────────────────
# 3. Incident response log bucket — 3-year retention (CERT-In)
# ─────────────────────────────────────────────────────────────────
echo "Creating incident-response log bucket (3-year = 1095-day retention)..."
gcloud logging buckets create incident-response \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=1095 \
  --description="Incident response audit trail (CERT-In Directions 2022: 3-year)" \
  2>/dev/null || echo "  (bucket already exists)"

gcloud logging buckets update incident-response \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --retention-days=1095

echo "  Incident-response bucket: 1095-day (3-year) retention in ${REGION}"

# ─────────────────────────────────────────────────────────────────
# 4. Default bucket — 30-day retention for operational logs
# ─────────────────────────────────────────────────────────────────
# The _Default bucket is managed by GCP and defaults to 30 days.
# Operational logs (health checks, debug output) do not require longer retention.
echo "Verifying _Default bucket retention (operational logs — 30 days is sufficient)..."
gcloud logging buckets describe _Default \
  --project="${GCP_PROJECT_ID}" \
  --location="${REGION}" \
  --format="value(retentionDays)" 2>/dev/null || echo "  (global default bucket)"

echo ""
echo "=== Log Retention Configuration Complete ==="
echo ""
echo "Buckets created:"
echo "  security-events   — 180 days  (DPDP + RBI requirement)"
echo "  financial-audit   — 2555 days  (7-year statutory)"
echo "  incident-response — 1095 days  (3-year CERT-In)"
echo ""
echo "IMPORTANT: Log sinks created above will incur additional Cloud Logging costs."
echo "Estimate: ~0.50 USD/GB for logs ingested to custom buckets."
echo "Long-term log storage (> 30 days) billed at archive rates."
echo ""
echo "Verify sinks are active:"
echo "  gcloud logging sinks list --project=${GCP_PROJECT_ID}"
```

> **Save this script to:** `infra/scripts/log-retention-setup.sh`
> Run after `infra/setup.sh` completes. Idempotent (safe to re-run).

### E.3 Log Content Rules (Enforcement)

Logs routed to the 180-day / 7-year buckets must NOT contain:
- Raw PAN numbers (even partially — use only `PAN_LAST_4`)
- Bank account numbers or IFSCs
- Razorpay payment IDs in bulk export (store only in Cloud SQL)
- Aadhaar numbers in any form

Structured logging convention (backend services must follow):
```csharp
// CORRECT — opaque reference in log
_logger.LogInformation("Loan disbursed {LoanApplicationId} for org {OrgId}", 
    loanApplicationId, orgId);

// WRONG — never log payment field values
_logger.LogInformation("Disbursed ₹{Amount} to account {AccountNumber} IFSC {Ifsc}",
    amount, accountNumber, ifsc);
```

### E.4 Log Retention Verification (Quarterly)

```bash
# Verify retention settings are intact (run quarterly — same cadence as backup drill)
for BUCKET in security-events financial-audit incident-response; do
  DAYS=$(gcloud logging buckets describe "${BUCKET}" \
    --project="${GCP_PROJECT_ID}" \
    --location=asia-south1 \
    --format="value(retentionDays)" 2>/dev/null || echo "NOT FOUND")
  echo "Bucket ${BUCKET}: ${DAYS} days"
done
# Expected output:
# Bucket security-events: 180 days
# Bucket financial-audit: 2555 days
# Bucket incident-response: 1095 days
```

---

## Part F — Incident Tracker

All incidents must be logged in `.claude/orchestrator/incident-reports/` with the filename
`INC-YYYY-MM-DD-<short-description>.md`. Minimum required fields:

```markdown
# Incident: <short title>
**Date:** YYYY-MM-DD
**Severity:** S1 / S2 / S3 / S4
**Status:** OPEN / RESOLVED / PIR-COMPLETE
**Detected by:** (alert name / user report / security scan)
**Declared by:** (on-call name)
**Resolved by:** (name)

## Timeline (IST)
- HH:MM — Event
- HH:MM — Event

## Impact
- Services affected:
- Users affected (estimate):
- Data classes potentially involved:

## Root Cause
(Brief technical description)

## Regulatory Assessment
- CERT-In threshold met? YES / NO / UNDER REVIEW
  - If YES: filed at HH:MM on YYYY-MM-DD (reference: <CERT-In ticket ID>)
- DPB threshold met? YES / NO / UNDER REVIEW
  - If YES: filed at HH:MM on YYYY-MM-DD
- RBI supervisory notification required? YES / NO

## Corrective Actions
- [ ] Action 1 (owner, due date)
- [ ] Action 2

## PIR
(Link to PIR document once complete)
```

---

## Related Documents

- `docs/security/vapt-plan.md` — VAPT schedule (security-reviewer, GAP-025 companion)
- `docs/devops/data-residency-map.md` — data residency map (GAP-107)
- `docs/devops/backup-restore-runbook.md` — PITR + GCS restore procedures
- `docs/devops/external-deps-secret-mapping.md` — secret inventory for breach scope assessment
- `docs/security/security-report.md` — security baseline
- `infra/scripts/pitr-drill.sh` — PITR restore drill script
- `mobile/src/config/privacyContact.ts` — DPO contact (pending TL-10)
