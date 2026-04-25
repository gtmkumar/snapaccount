# Loan Disbursement Webhook Contract

**Phase:** 6C (Loan Hub)
**Owner:** devops-engineer (infra contract) + backend-agent (implementation)
**Last updated:** 2026-04-25

---

## Overview

Partner banks call this endpoint to notify SnapAccount when a disbursement event occurs
(e.g., funds transferred to borrower, disbursement rejected, partial disbursement, reversal).
LoanService receives the webhook, verifies the HMAC signature, and publishes a
`snapaccount.loan.events` Pub/Sub message for downstream consumers.

---

## Endpoint

```
POST /loans/webhooks/{bankId}/disbursement
```

| Parameter | Description |
|-----------|-------------|
| `bankId`  | Short identifier for the partner bank (e.g., `icici`, `hdfc`). Must match the suffix of the corresponding Secret Manager secret `partner-bank-webhook-secret-{bankId}`. |

The endpoint is exposed on the LoanService Cloud Run service at:
```
https://loan-service-<hash>-el.a.run.app/loans/webhooks/{bankId}/disbursement
```

Production URLs are routed through the Cloud Load Balancer — partner banks should be
given the load-balanced URL, not the Cloud Run URL directly.

---

## Authentication — HMAC-SHA256 Signature

Each partner bank shares a per-bank secret with SnapAccount during onboarding. This secret
is stored in GCP Secret Manager as `partner-bank-webhook-secret-{bankId}`.

### Request headers (required)

| Header | Format | Description |
|--------|--------|-------------|
| `X-Bank-Signature` | `sha256=<hex-digest>` | HMAC-SHA256 of the raw request body, keyed with the bank's shared webhook secret. |
| `X-Idempotency-Key` | UUID v4 | Unique key per disbursement event. LoanService rejects duplicate keys with `409 Conflict`. |
| `Content-Type` | `application/json` | Always JSON. |

### Signature computation (bank side)

The bank must compute:

```
signature = HMAC-SHA256(key=webhook_secret, message=raw_request_body_bytes)
X-Bank-Signature: sha256=<hex(signature)>
```

- The key is the raw shared secret string (UTF-8 encoded).
- The message is the **exact raw bytes** of the HTTP request body — do not parse or reformat.
- The hex digest must be lowercase.

### Verification (LoanService side)

1. Read `partner-bank-webhook-secret-{bankId}` from Secret Manager (cached per service instance, refreshed every 5 minutes).
2. Compute `HMAC-SHA256(key=secret, message=raw_body_bytes)`.
3. Compare to `X-Bank-Signature` header value using constant-time comparison (`CryptographicOperations.FixedTimeEquals`).
4. Reject with `401 Unauthorized` on mismatch.
5. Reject with `400 Bad Request` if `X-Bank-Signature` header is absent.

---

## Idempotency

| Header | Requirement |
|--------|-------------|
| `X-Idempotency-Key` | **Required.** Bank must generate a stable UUID for each disbursement event. Re-sending the same event must use the same key. |

LoanService behaviour:
- First receipt: process and store the idempotency key with event result (TTL: 30 days).
- Duplicate receipt (same key): return `409 Conflict` with body `{"code":"DUPLICATE_EVENT","key":"<key>"}`.
- Key absent: return `400 Bad Request`.

---

## Request Body

```jsonc
{
  "disbursement_id": "string",          // Bank's unique disbursement reference
  "loan_id": "string",                  // SnapAccount loan application ID (echoed from loan creation call)
  "event_type": "DISBURSED | REJECTED | REVERSED | PARTIAL",
  "amount": 500000,                     // Amount in paise (integer, no decimals)
  "currency": "INR",
  "disbursed_at": "2026-04-25T10:00:00Z", // ISO 8601 UTC
  "utr_number": "string | null",        // Unique Transaction Reference (present for DISBURSED)
  "bank_account_number": "string",      // Masked borrower account number (last 4 digits, e.g. XXXX1234)
  "failure_reason": "string | null"     // Present for REJECTED / REVERSED
}
```

### Event types

| `event_type` | Meaning |
|--------------|---------|
| `DISBURSED` | Funds fully transferred. `utr_number` must be present. |
| `PARTIAL` | Partial disbursement (tranche). `amount` reflects this tranche only. |
| `REJECTED` | Disbursement failed. `failure_reason` must be present. |
| `REVERSED` | Previously disbursed amount reversed/recalled. `failure_reason` must be present. |

---

## Response Codes

| Code | Meaning |
|------|---------|
| `200 OK` | Event accepted and queued. |
| `400 Bad Request` | Missing required headers or malformed body. |
| `401 Unauthorized` | HMAC signature verification failed. |
| `404 Not Found` | `bankId` not recognised (no secret `partner-bank-webhook-secret-{bankId}` found). |
| `409 Conflict` | Duplicate `X-Idempotency-Key`. |
| `500 Internal Server Error` | LoanService processing error — bank should retry with exponential backoff. |

---

## Retry Expectations (bank side)

Banks should retry `5xx` responses with exponential backoff (initial: 30s, max: 10 min,
max attempts: 5). `4xx` responses (except `409`) indicate a configuration problem and
should not be retried automatically.

---

## Secret Manager Integration

Per-bank webhook secrets follow the naming convention:

```
partner-bank-webhook-secret-{bankId}
```

Examples:
- `partner-bank-webhook-secret-icici`
- `partner-bank-webhook-secret-hdfc`

LoanService SA (`loan-service-sa`) has `roles/secretmanager.secretAccessor` at the
project level, which covers all secrets matching this pattern. If more granular access
is required, apply an IAM condition:

```bash
gcloud secrets add-iam-policy-binding partner-bank-webhook-secret-icici \
    --member="serviceAccount:loan-service-sa@PROJECT.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### Creating a new bank webhook secret

```bash
WEBHOOK_SECRET=$(openssl rand -base64 48)
echo -n "${WEBHOOK_SECRET}" \
    | gcloud secrets create partner-bank-webhook-secret-<bankId> \
        --data-file=- \
        --replication-policy=user-managed \
        --locations=asia-south1 \
        --labels="app=snapaccount,type=webhook-secret,phase=6c"
```

Share the generated `WEBHOOK_SECRET` value with the partner bank via a secure channel
(e.g., encrypted email, bank's secure API portal). Never send over Slack or email plain text.

---

## Downstream: Pub/Sub Event

On successful ingestion, LoanService publishes to `snapaccount.loan.events`:

```jsonc
{
  "event_type": "LoanDisbursed | LoanDisbursementFailed | LoanDisbursementReversed",
  "loan_id": "string",
  "org_id": "string",
  "amount": 500000,
  "utr_number": "string | null",
  "bank_id": "string",
  "occurred_at": "ISO8601"
}
```

Subscriber: `notification-service-loan-events-sub` (NotificationService).
NotificationService sends:
- `LoanDisbursed` → push notification + SMS to borrower
- `LoanDisbursementFailed` → push notification + SMS + internal CA alert
- `LoanDisbursementReversed` → push notification + email to borrower

---

## Onboarding a New Partner Bank

1. Generate a webhook secret: `openssl rand -base64 48`
2. Create Secret Manager secret: `partner-bank-webhook-secret-<bankId>`
3. Create partner credentials secret: `partner-bank-creds-<bankId>` (see `partner-bank-creds-template` in Secret Manager for the expected JSON shape)
4. Share webhook secret with bank over secure channel
5. Configure bank to send `POST /loans/webhooks/<bankId>/disbursement` with required headers
6. Test with a sandbox disbursement event
7. Update pilot bank list in `infra/setup.sh` comments

---

## Pilot Partner Banks (Phase 6C)

| Bank ID | Bank | API |
|---------|------|-----|
| `icici` | ICICI Bank | Business Banking API |
| `hdfc` | HDFC Bank | SmartHub API |
