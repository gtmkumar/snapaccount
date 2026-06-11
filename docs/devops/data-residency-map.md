# Data Residency Map — RBI Payment-Data Localization (GAP-107)

**Owner:** devops-engineer + security-reviewer (review)
**Date:** 2026-06-11
**Regulatory basis:** RBI Storage of Payment System Data circular (2018, reiterated 2022),
RBI Digital Lending Guidelines 2025, DPDP Act 2023 (data localization for Significant Data
Fiduciaries), IT Act 2000/2025 (jurisdiction).

---

## 1. Scope and Classification

This document enumerates every data store, queue, log sink, and third-party service that
touches SnapAccount data. Each entry records:

- **Physical region** — where the data actually resides at rest
- **Data classes** — which sensitivity categories flow through this store
- **RBI localization stance** — compliance verdict for payment-related data
- **Action item** — flag if a non-India-resident path exists for payment data

### Data Classes Used in This Document

| Class | Examples |
|---|---|
| **PAYMENT** | UPI ref, Razorpay order ID, amount, IFSC, bank account number, EMI schedule |
| **PII** | Name, email, mobile, address, date of birth |
| **KYC** | PAN, Aadhaar (last 4 digits), GSTIN, business PAN |
| **FINANCIAL** | Journal entries, ledger balances, GST returns, ITR data |
| **AUTH** | Session JWT, OTP hashes, device fingerprints, login events |
| **OPERATIONAL** | Cloud Run logs, error traces, health-check metrics (no user content) |
| **AI-PROMPT** | Text sent to LLM APIs; must NEVER contain PAYMENT, KYC, or PAN fields |

---

## 2. Fully India-Resident Stores (Compliant)

### 2.1 Google Cloud SQL — PostgreSQL 17

| Property | Value |
|---|---|
| **Instance name** | `snapaccount-postgres` |
| **Region** | `asia-south1` (Mumbai) |
| **Data classes** | PAYMENT, PII, KYC, FINANCIAL, AUTH |
| **Replicas** | Read replica in `asia-south1` only (do NOT add cross-region replicas without RBI approval) |
| **Backups** | Stored in `asia-south1` (Cloud SQL default; backup bucket inherits instance region) |
| **PITR logs** | Stored in `asia-south1` |
| **RBI stance** | **COMPLIANT** — all payment data at rest in India |
| **Action** | None. Verify with: `gcloud sql instances describe snapaccount-postgres --format="value(region)"` |

> **Important:** If AlloyDB is adopted for production scale, ensure the cluster is created in
> `asia-south1`. AlloyDB cross-region reads would need explicit legal review.

### 2.2 Google Cloud Storage — Document buckets

| Bucket | Region | Data classes | RBI stance |
|---|---|---|---|
| `snapaccount-documents-{env}` | `asia-south1` (single-region) | PII, KYC, FINANCIAL | **COMPLIANT** |
| `snapaccount-loan-packages-{env}` | `asia-south1` (single-region) | PAYMENT, PII, KYC, FINANCIAL | **COMPLIANT** |
| `snapaccount-reports-{env}` | `asia-south1` (single-region) | PAYMENT, FINANCIAL | **COMPLIANT** |
| `snapaccount-admin-{env}` | `asia-south1` (single-region) | OPERATIONAL (static assets only) | Not applicable |

**Provisioned by:** `infra/setup.sh` (Steps 6–8), `infra/gcs-bucket-lock.sh` (compliance lock).

> **Critical guard:** Buckets must NEVER be created as `multi-region` (which includes
> `us-multi-region`). The `infra/setup.sh` script explicitly sets `--location=asia-south1`.
> Enforce via org policy (see Section 5).

### 2.3 Google Cloud Pub/Sub

| Property | Value |
|---|---|
| **Topics** | All topics provisioned in GCP project region `asia-south1` |
| **Data classes in messages** | Event metadata (document IDs, job references). Message bodies must NOT contain raw PAYMENT fields — pass references only (document ID, loan application ID). See Section 4.2 for rules. |
| **Message retention** | Default: 7 days (sufficient for operational retry; not a compliance store) |
| **RBI stance** | **COMPLIANT** — Pub/Sub topics are project-scoped; GCP project is restricted to `asia-south1` via org policy |
| **Action** | Verify no Pub/Sub message body contains raw bank account / card data. Audit `GooglePubSubPublisher.cs` event payloads. |

### 2.4 Google Secret Manager

| Property | Value |
|---|---|
| **Region behavior** | Secret Manager is a global service by default. Secret *versions* can be stored regionally using `--replication-policy=user-managed --locations=asia-south1`. |
| **Data classes stored** | API keys, connection strings, JWT signing keys (not user PII or PAYMENT data) |
| **RBI stance** | **COMPLIANT** — Secret Manager stores credentials, not payment data. Global replication is acceptable for credentials. |
| **Recommended hardening** | For maximum compliance posture, use regional replication: `gcloud secrets create <name> --replication-policy=user-managed --locations=asia-south1` |
| **Current state** | `infra/secret-manager-external-deps.sh` creates secrets without explicit replication policy (defaults to automatic/global). Action item — see Section 4.1. |

### 2.5 Google Cloud Run

| Property | Value |
|---|---|
| **Region** | `asia-south1` for all 12 microservices (enforced in `infra/cloud-run-services.sh`: `REGION="asia-south1"`) |
| **Data classes processed in memory** | All classes including PAYMENT during request processing |
| **Persistent storage** | None — Cloud Run is stateless; all state in Cloud SQL / GCS |
| **RBI stance** | **COMPLIANT** — compute is in India; no data persists on Cloud Run instances |
| **Action** | None. |

### 2.6 Google Cloud Logging

| Property | Value |
|---|---|
| **Default storage** | `_Default` log bucket in the GCP project's default region. For projects created in `asia-south1`, the default bucket is regional. |
| **Data classes in logs** | OPERATIONAL (request IDs, error codes, structured log fields). Must NOT contain PII, PAYMENT, or KYC data in log payloads. |
| **Retention** | Default 30 days in `_Default` bucket. |
| **Statutory requirement** | DPDP Act + RBI require security event logs retained ≥ 180 days (see Section 3 — Log Retention Policy). |
| **RBI stance** | **COMPLIANT** if logs contain only OPERATIONAL data. See Section 4.3 for PII-in-logs guard. |
| **Action** | Create a `_Required` log bucket with 180-day retention in `asia-south1`. See Section 3. |

### 2.7 Google Cloud Monitoring

| Property | Value |
|---|---|
| **Metrics** | Cloud Run RED metrics, Cloud SQL metrics, Pub/Sub lag |
| **Data classes** | OPERATIONAL only (request rates, latencies, error codes — no user data) |
| **Region** | Metrics are global within GCP project; time-series data resides in Google infrastructure (not user-selectable) |
| **RBI stance** | **COMPLIANT** — no payment or user data in metrics |
| **Action** | None. |

---

## 3. Partially Non-India-Resident Services — Action Required

### 3.1 Firebase Auth

| Property | Value |
|---|---|
| **Provider** | Google Firebase (Firebase Auth service) |
| **Data stored** | Phone number, email (for social sign-in), UID, refresh tokens |
| **Data classes** | PII, AUTH |
| **Physical region** | Firebase Auth user data is stored in the **Firebase project's default region**. For `snap-account` project the account is `dev.gtmkumar@gmail.com` — verify Firebase Console → Project Settings → General → Default GCP resource location. If unset, data may be `us-central1`. |
| **RBI stance** | **PARTIAL — requires verification.** Firebase Auth user data is PII. RBI payment-data localization strictly requires payment data in India. Phone numbers used for OTP login are PII but not directly PAYMENT data. However, DPDP Act 2023 requires PII processed by an SDF to be localized. |
| **Action items** | 1. Verify Firebase project default region: Firebase Console → Project Settings → General → "Default GCP resource location". Set to `asia-south1` if not already done (can only be set once per project). 2. If region cannot be changed (it's immutable once set), document this as an accepted risk with legal review. 3. Do NOT store payment amounts, bank account numbers, or IFSC in Firebase user custom claims. |

### 3.2 Firebase Crashlytics (Mobile)

| Property | Value |
|---|---|
| **Provider** | Google Firebase Crashlytics |
| **Data stored** | Crash reports, device model, OS version, stack traces, custom keys/logs |
| **Data classes** | OPERATIONAL — **must never contain PAYMENT, PII, KYC, or FINANCIAL** |
| **Physical region** | Crashlytics data is stored in **US-based Firebase infrastructure** (not region-selectable) |
| **RBI stance** | **ACTION REQUIRED** — Crashlytics is US-resident. Any crash report that includes PII or payment data in stack traces, custom log statements, or `setCustomKey` values would violate RBI localization and DPDP. |
| **Action items** | 1. Audit all `Crashlytics.instance.setCustomKey(...)` and `log(...)` calls in `mobile/` — remove any that could contain PAN, phone, amount, or account data. 2. Add a lint rule or CI grep check: `grep -r "setCustomKey\|crashlytics.*log" mobile/src` — review findings. 3. Never propagate exceptions that carry user-supplied financial field values into Crashlytics without redaction. 4. Consider Firebase's Data Processing Agreement — Crashlytics is a Firebase product under Google's DPA, which may satisfy some DPDP processor requirements but not localization. |

### 3.3 Razorpay

| Property | Value |
|---|---|
| **Provider** | Razorpay Payments (Indian entity: Razorpay Software Pvt Ltd) |
| **Data stored at Razorpay** | Order data, payment amount, Razorpay customer ID, payment method details (masked card / UPI VPA) |
| **Data classes** | PAYMENT |
| **Physical region** | Razorpay is an Indian company; primary data stored in India. Payment processing complies with RBI PSO regulations. Razorpay is PCI-DSS certified. |
| **RBI stance** | **COMPLIANT** — Razorpay is a licensed Payment Aggregator under RBI; data stored in India. SnapAccount's role is a "merchant" — we receive order confirmation and webhook events, not raw card data. |
| **What SnapAccount must NOT do** | Never log raw Razorpay order amounts or customer payment details in Cloud Logging or Crashlytics. Store only: `razorpay_order_id`, `razorpay_payment_id` (opaque references), subscription status (ACTIVE/CANCELLED). |
| **Action** | Verify `SubscriptionService` webhook handler logs only the opaque payment ID, not amounts. See `SubscriptionService.Api/Endpoints/RazorpayWebhook.cs`. |

### 3.4 MSG91 (SMS / OTP)

| Property | Value |
|---|---|
| **Provider** | MSG91 (Indian entity: Walkover Web Solutions Pvt Ltd) |
| **Data stored at MSG91** | Mobile number, OTP (ephemeral), DLT template content |
| **Data classes** | PII (mobile number) |
| **Physical region** | MSG91 is an Indian company; SMS gateway data stored in India. Subject to TRAI DLT regulations. |
| **RBI stance** | **COMPLIANT** — Indian entity, India-resident data, TRAI-compliant SMS. |
| **Action** | Ensure OTP payloads in SMS bodies never contain PAN, account numbers, or loan amounts — only the OTP digit and masked context. |

### 3.5 SendGrid (Transactional Email)

| Property | Value |
|---|---|
| **Provider** | Twilio SendGrid (US entity) |
| **Data stored at SendGrid** | Recipient email address, email body content, delivery logs |
| **Data classes** | PII (email), potentially FINANCIAL (if email body contains amounts/returns) |
| **Physical region** | Twilio/SendGrid data centers are primarily **US-based**. SendGrid does not offer India-resident email storage. |
| **RBI stance** | **ACTION REQUIRED** — Email content may contain financial summaries (GST return confirmations, ITR acknowledgement numbers, loan disbursement notices). This constitutes FINANCIAL data in a non-India-resident store. |
| **Action items** | 1. Audit all email templates in `NotificationService` — remove or mask any field that constitutes PAYMENT data (loan amounts, bank account last-4, IFSC). 2. For regulatory notifications (GST/ITR confirmation), email should contain only an acknowledgement reference number and a link to the in-app view, not the full data. 3. Consider a future migration to an India-resident email provider (e.g., Amazon SES in `ap-south-1`, or a DPDP-compliant Indian email service) if DPDP SDF obligations are confirmed. 4. Document the SendGrid risk in the annual DPDP compliance review. |

### 3.6 Sarvam AI (Indian Language NLP)

| Property | Value |
|---|---|
| **Provider** | Sarvam AI (Indian entity: Sarvam AI Pvt Ltd, Bangalore) |
| **Data classes sent** | AI-PROMPT (text fragments for translation/transliteration). Must NOT contain PAN, account numbers, or PAYMENT data. |
| **Physical region** | Sarvam AI API is India-based. Verify API endpoint: `api.sarvam.ai` (India-hosted per their documentation). |
| **RBI stance** | **COMPLIANT** — Indian entity. Verify data processing terms. |
| **Action** | Confirm Sarvam's data retention policy for API requests. Ensure API payloads contain only text to be translated, not user-identifiable financial data. |

---

## 4. Non-India-Resident Services — Significant Action Required

### 4.1 Google Vertex AI / Gemini API

| Property | Value |
|---|---|
| **Provider** | Google Cloud Vertex AI |
| **Endpoint region** | Default Vertex AI endpoint: `us-central1`. **Must be changed to `asia-south1`** (Gemini is available in Mumbai as of 2025). |
| **Data classes sent** | AI-PROMPT |
| **RBI stance** | **ACTION REQUIRED** — If Vertex AI is called with `us-central1` endpoint, prompt data leaves India. |
| **Action items** | 1. Set Vertex AI client endpoint to `asia-south1-aiplatform.googleapis.com` for all AiService calls. 2. Enforce in code: the existing admin-configurable AI provider settings (`GET /auth/config/ai`) should include region selection; default must be `asia-south1`. 3. ABSOLUTE RULE: Never include PAYMENT, PII, KYC, or FINANCIAL data in any Vertex AI / Gemini prompt. Prompts must be constructed from anonymized document OCR text or pre-classified categories only. 4. When AiService (GAP-030) is implemented, require a code-review gate to enforce this rule on any new prompt construction path. |

### 4.2 Google Document AI

| Property | Value |
|---|---|
| **Provider** | Google Cloud Document AI |
| **Endpoint region** | Document AI processors are created per-region. Verify that OCR processor IDs stored in `GOOGLE_DOCUMENT_AI_CONFIG` secret use `asia-south1` processors, not `us` or `eu`. |
| **Data classes sent** | KYC (PAN card images, Aadhaar images), FINANCIAL (Form 16, GST invoices) |
| **RBI stance** | **ACTION REQUIRED** — Document AI is used for Form 16 OCR (`ItrService`) and general document OCR (`DocumentService`). If processors are in `us`, KYC document images leave India. |
| **Action items** | 1. In GCP Console → Document AI, verify all processor locations: `gcloud ai document-ai processors list --location=us` should return empty. `gcloud ai document-ai processors list --location=asia-south1` should return all processors. 2. If US processors exist, create equivalent `asia-south1` processors and update the `GOOGLE_DOCUMENT_AI_CONFIG` secret. 3. Document the processor IDs and their regions in this file once verified. |

---

## 5. Organization Policy — Data Localization Enforcement

The following GCP Organization Policies must be applied to enforce residency. These complement
the script-level `--region=asia-south1` flags — they act as a hard guardrail against accidental
misconfiguration.

```bash
# Set on the GCP project (or organization if multiple projects)
# Restricts all GCP resource creation to asia-south1

gcloud org-policies set-policy - --project="${GCP_PROJECT_ID}" << 'EOF'
name: projects/${GCP_PROJECT_ID}/policies/gcp.resourceLocations
spec:
  rules:
  - values:
      allowedValues:
      - "in:asia-south1-locations"
      - "in:asia-south1a-zones"
      - "in:asia-south1b-zones"
      - "in:asia-south1c-zones"
EOF

# Verify the policy is active
gcloud org-policies describe gcp.resourceLocations \
  --project="${GCP_PROJECT_ID}"
```

> **Exception needed for Secret Manager:** Secret Manager uses global replication by default.
> Either add `"in:global-locations"` to the allowed values (reduces localization guarantee),
> or switch all secrets to `--replication-policy=user-managed --locations=asia-south1`
> (recommended; see Section 2.4 action item).

### Script to apply the org policy

Add the following section to `infra/setup.sh` (after Step 1 — project creation):

```bash
echo "Step 1b: Apply data-localization org policy (GAP-107)"
gcloud org-policies set-policy - --project="${GCP_PROJECT_ID}" << POLICY
name: projects/${GCP_PROJECT_ID}/policies/gcp.resourceLocations
spec:
  rules:
  - values:
      allowedValues:
      - "in:asia-south1-locations"
POLICY
echo "  Org policy applied: gcp.resourceLocations → asia-south1 only"
```

---

## 6. Payment-Data Rules (Non-Negotiable)

These rules apply to all code paths, regardless of store. Violation constitutes a direct RBI
Digital Lending / PSO non-compliance:

| Rule | Applies To | Enforcement |
|---|---|---|
| **R1:** Never include raw card numbers, CVV, UPI PIN, or full bank account numbers in any log, metric, event payload, or AI prompt | All services, all stores | CI grep guard (see Section 7) |
| **R2:** Razorpay payment data (order/payment IDs) may be stored in Cloud SQL (india-resident), logged as opaque references only | SubscriptionService, LoanService | Code review |
| **R3:** Loan disbursement amounts and IFSC codes stored only in Cloud SQL (india-resident). Never in Cloud Logging payload or GCS object name. | LoanService | Code review |
| **R4:** Crashlytics must never receive payment amounts, PAN, or account numbers via `setCustomKey` or exception message | Mobile app | Lint rule + audit (Section 3.2 action) |
| **R5:** Vertex AI / Gemini prompts must be anonymized (document category + extracted text only; no identifiers) | AiService | Code review gate on prompt construction |
| **R6:** SendGrid email bodies must not contain full payment data — use opaque references + in-app links | NotificationService | Email template audit (Section 3.5 action) |
| **R7:** Pub/Sub message payloads must contain only event references (IDs), not raw field values | All services | `GooglePubSubPublisher.cs` interface contract |

---

## 7. CI Compliance Guard

Add the following check to `.github/workflows/ci.yml` to catch accidental payment-data
leakage patterns in new code:

```yaml
# In ci.yml, add as a step in the lint job:
- name: Payment-data residency guard (GAP-107)
  run: |
    set -euo pipefail
    echo "Scanning for payment-data leakage patterns..."
    # Patterns that should never appear in log/event construction code
    VIOLATIONS=$(grep -rn \
      --include="*.cs" --include="*.ts" --include="*.tsx" \
      -E "(setCustomKey|crashlytics.*log).*[Aa]mount|\.Log.*cardNumber|\.Log.*accountNumber|\.Log.*ifsc|\.Log.*cvv|sendAsync.*PAN|pubsub.*account_number" \
      backend/ mobile/ src/ 2>/dev/null | grep -v "//.*ignore-residency" || true)
    if [ -n "$VIOLATIONS" ]; then
      echo "ERROR: Potential payment-data leakage in log/event payload:"
      echo "$VIOLATIONS"
      exit 1
    fi
    echo "  No leakage patterns found."
```

> **Escape hatch:** Append `// ignore-residency` on a line to suppress a false positive.
> All suppressions must be code-reviewed.

---

## 8. Summary Table — Residency Verdict

| Store / Service | Region | PAYMENT | PII | KYC | RBI Stance | Priority Action |
|---|---|---|---|---|---|---|
| Cloud SQL (PG 17) | asia-south1 | YES | YES | YES | COMPLIANT | None |
| GCS (all buckets) | asia-south1 | YES | YES | YES | COMPLIANT | None |
| Cloud Run (12 services) | asia-south1 | In-memory only | In-memory only | In-memory only | COMPLIANT | None |
| Cloud Pub/Sub | asia-south1 (project-scoped) | Refs only | No | No | COMPLIANT | Audit event payloads |
| Secret Manager | Global (default) | No | No | No | ACCEPTABLE | Switch to regional replication |
| Cloud Logging | asia-south1 (if project default set) | MUST NOT | MUST NOT | MUST NOT | COMPLIANT if clean | Verify log content + retention |
| Cloud Monitoring | Global (metrics only) | No | No | No | COMPLIANT | None |
| Firebase Auth | Verify project region | No | YES (phone/email) | No | VERIFY FIRST | Confirm Firebase project region |
| Firebase Crashlytics | US (non-selectable) | MUST NOT | MUST NOT | MUST NOT | NON-COMPLIANT if dirty | Audit + prohibit |
| Razorpay | India (licensed PA) | YES (at Razorpay) | Partial | No | COMPLIANT | Do not log amounts |
| MSG91 | India | No | YES (mobile) | No | COMPLIANT | OTP bodies only |
| SendGrid | US | No | YES (email) | No | ACTION REQUIRED | Template audit |
| Sarvam AI | India | MUST NOT | MUST NOT | MUST NOT | COMPLIANT | Verify data retention terms |
| Vertex AI / Gemini | **Must set asia-south1** | MUST NOT | MUST NOT | MUST NOT | ACTION REQUIRED | Enforce region + no-PII rule |
| Document AI | **Must verify asia-south1** | No | No | YES (images) | ACTION REQUIRED | Verify processor regions |

---

## 9. Quarterly Review Checklist

This map must be reviewed quarterly (aligned with backup drill cadence in `backup-restore-runbook.md`):

- [ ] Verify Cloud SQL instance region has not changed
- [ ] Verify GCS bucket locations: `gsutil ls -L gs://snapaccount-documents-{env} | grep Location`
- [ ] Verify Vertex AI calls use `asia-south1` endpoint
- [ ] Verify Document AI processor regions
- [ ] Re-run CI payment-data guard manually on the main branch
- [ ] Review any new third-party integrations added in the quarter
- [ ] Update Section 8 summary table if any service is added or changed

---

## Related Files

- `infra/setup.sh` — GCP project bootstrap (region: `asia-south1` enforced)
- `infra/cloud-run-services.sh` — Cloud Run deployment (region: `asia-south1`)
- `infra/gcs-bucket-lock.sh` — GCS compliance lock
- `infra/secret-manager-external-deps.sh` — Secret Manager provisioning
- `docs/devops/external-deps-secret-mapping.md` — full secret → env-var mapping
- `docs/devops/backup-restore-runbook.md` — PITR + GCS backup procedures
- `docs/security/pci-scope.md` — PCI-DSS SAQ A boundary (GAP-106, security-reviewer)
- `docs/devops/incident-response.md` — breach notification runbook (GAP-025)
