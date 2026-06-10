# External Dependency Secret-Name → Config-Key Mapping

**Phase:** 7 (Wave 2) — GAP-073
**Author:** devops-engineer
**Date:** 2026-06-10
**Script:** `infra/secret-manager-external-deps.sh`

This document provides the authoritative mapping between GCP Secret Manager secret names,
the Cloud Run environment variable each secret is mounted as, the .NET `IConfiguration` key
the consuming service reads, and the service + code location that reads the key.

---

## How secrets flow into services

1. `infra/secret-manager-external-deps.sh` — creates Secret Manager slots (placeholders).
2. Operator adds actual values via `gcloud secrets versions add`.
3. `infra/cloud-run-services.sh` mounts secrets as env vars on Cloud Run revisions
   (via `--set-secrets=ENV_VAR=secret-name:latest`).
4. .NET 10 `IConfiguration` reads the env var; each service's infrastructure layer accesses
   the value via `configuration["ConfigKey"]` or `configuration.GetConnectionString(...)`.

---

## Full Mapping Table

| Secret Manager Name | Cloud Run Env Var | .NET Config Key | Consuming Service | Notes |
|---|---|---|---|---|
| `gstn-client-id` | `GSTN_CLIENT_ID` | `configuration["GSTN_CLIENT_ID"]` | GstService | ProductionGstnApiClient header `clientid`. Active only when `GST_PRODUCTION_APIS_ENABLED=true` |
| `gstn-client-secret` | `GSTN_CLIENT_SECRET` | `configuration["GSTN_CLIENT_SECRET"]` | GstService | ProductionGstnApiClient header `client-secret`. **Never logged — redacted before any log statement** |
| `irp-client-id` | `IRP_CLIENT_ID` | `configuration["IRP_CLIENT_ID"]` | GstService | ProductionIrpClient header `clientid` |
| `irp-client-secret` | `IRP_CLIENT_SECRET` | `configuration["IRP_CLIENT_SECRET"]` | GstService | ProductionIrpClient header `client-secret`. **Never logged** |
| `ewb-client-id` | `EWB_CLIENT_ID` | `configuration["EWB_CLIENT_ID"]` | GstService | ProductionEwbClient header `Gstin` |
| `ewb-client-secret` | `EWB_CLIENT_SECRET` | `configuration["EWB_CLIENT_SECRET"]` | GstService | ProductionEwbClient `Authorization: Bearer` header. **Never logged** |
| `feature-flag-gst-production-apis-enabled` | `GST_PRODUCTION_APIS_ENABLED` | `configuration["GST_PRODUCTION_APIS_ENABLED"]` | GstService | String `"true"` or `"false"`. Controls mock vs. live GSTN/IRP/EWB adapters in `DependencyInjection.cs` |
| `msg91-api-key` | `MSG91_API_KEY` | `configuration["Msg91:ApiKey"]` | NotificationService | Msg91SmsAdapter `authkey` header. Required for any SMS dispatch |
| `msg91-sender-id` | `MSG91_SENDER_ID` | `context.SenderName` (NotificationDispatchContext) | NotificationService | DLT-registered 6-char sender ID (e.g., `SNPACC`). TRAI DLT compliance gate in Msg91SmsAdapter |
| `sendgrid-api-key` | `SENDGRID_API_KEY` | `configuration["SendGrid:ApiKey"]` | NotificationService | SendGridEmailAdapter `Authorization: Bearer` header. SPF/DKIM DNS auth required separately |
| `sendgrid-from-email` | `SENDGRID_FROM_EMAIL` | `configuration["SendGrid:FromEmail"]` | NotificationService | From address in SendGrid payload. Must match authenticated domain |
| `sendgrid-from-name` | `SENDGRID_FROM_NAME` | `configuration["SendGrid:FromName"]` | NotificationService | Display name in `from.name` field |
| `firebase-admin-json` | `FIREBASE_ADMIN_JSON` | `configuration["Firebase:ServiceAccountJson"]` | NotificationService | FirebaseAdmin SDK init for FCM push. JSON string (single-line) |
| `firebase-service-account-json` | `FIREBASE_SERVICE_ACCOUNT_JSON` | `configuration["Firebase:ServiceAccountJson"]` | AuthService | Same Firebase SA JSON format; can be same file or a dedicated SA |
| `partner-bank-creds-icici` | _(not env var — Secret Manager API)_ | `CredentialEncryptionService.ResolveKeyAsync("partner-bank-creds-icici")` | LoanService | AES-GCM 32-byte key; decrypts `loan.partner_banks.api_config_encrypted` for ICICI |
| `partner-bank-creds-hdfc` | _(not env var — Secret Manager API)_ | `CredentialEncryptionService.ResolveKeyAsync("partner-bank-creds-hdfc")` | LoanService | AES-GCM 32-byte key for HDFC |
| `partner-bank-webhook-secret-icici` | _(not env var — Secret Manager API)_ | `CredentialEncryptionService.GetWebhookSecretAsync("partner-bank-webhook-secret-icici")` | LoanService | HMAC-SHA256 key; verifies `X-Bank-Signature` header on ICICI disbursement webhooks |
| `partner-bank-webhook-secret-hdfc` | _(not env var — Secret Manager API)_ | `CredentialEncryptionService.GetWebhookSecretAsync("partner-bank-webhook-secret-hdfc")` | LoanService | HMAC-SHA256 key for HDFC webhook signatures |
| `session-jwt-secret` | `SESSION_JWT_SECRET` | `configuration["SESSION_JWT_SECRET"]` | ALL 12 services | HS256 signing key for session JWTs. GAP-005 HIGH PRIORITY — services must fail-fast at startup in non-Development when absent |
| `jwt-secret-key` | `JWT_SECRET_KEY` | `configuration["Jwt:SecretKey"]` (AuthService) | AuthService | Alias for session-jwt-secret; same value. Used by the AuthService JWT issuance path |
| `pan-encryption-key` | `PAN_ENCRYPTION_KEY` | `configuration["PanEncryption:Key"]` | AuthService, GstService | AES-256-GCM PAN field encryption (AesPanEncryptionService). SEC-013 |
| `loan-consent-hmac-key` | `LOAN_CONSENT_HMAC_KEY` | `IConsentHmacKeyProvider` (resolved in-service) | LoanService | HMAC key for loan consent integrity signing (P6-HANDOFF-26) |
| `loan-credential-master-key` | _(Secret Manager API)_ | `CredentialEncryptionService` (envelope encryption) | LoanService | Master key for envelope-encrypting per-bank credential keys |
| `redis-connection-string-prod` | `REDIS_CONNECTION_STRING` | `configuration["REDIS_CONNECTION_STRING"]` | NotificationService, ChatService | StackExchange.Redis format: `<host>:<port>,abortConnect=false,...` |
| `db-connection-string-prod` | `ConnectionStrings__DefaultConnection` | `configuration.GetConnectionString("DefaultConnection")` | ALL 12 services | Full Npgsql connection string. Provisioned by `infra/setup.sh` Step 5 |
| `gcs-documents-bucket` | `GCS_BUCKET_NAME` | `configuration["GCS:DocumentsBucket"]` | DocumentService | GCS bucket for user-uploaded documents |
| `gcs-loan-packages-bucket` | `GCS_LOAN_PACKAGES_BUCKET` | `configuration["GCS_LOAN_PACKAGES_BUCKET"]` | LoanService, ReportService | GCS bucket for loan packages |
| `google-document-ai-config` | `GOOGLE_DOCUMENT_AI_CONFIG` | `configuration["GOOGLE_DOCUMENT_AI_CONFIG"]` | DocumentService, ItrService | JSON blob: processor IDs per document type |
| `razorpay-key-id` | `RAZORPAY_KEY_ID` | `configuration["Razorpay:KeyId"]` | SubscriptionService | Razorpay API key ID |
| `razorpay-key-secret` | `RAZORPAY_KEY_SECRET` | `configuration["Razorpay:KeySecret"]` | SubscriptionService | Razorpay API key secret |
| `sarvam-ai-api-key` | `SARVAM_AI_API_KEY` | `configuration["SarvamAi:ApiKey"]` | AiService | Sarvam AI API key for Indian language NLP |

---

## External Lead Times & Blockers

| Dependency | Lead Time | Current Status | Flag | Action Required |
|---|---|---|---|---|
| GSTN Sandbox creds | 5–10 business days | Pending | P6-FLAG-04 | Team lead to apply at developer.gst.gov.in with valid GSTIN |
| GSTN Production creds | +30 days (signed agreement) | Pending | P6-FLAG-04 | After sandbox verified, execute GSTN agreement |
| IRP creds | 5–10 business days (same portal) | Pending | P6-FLAG-04 | Apply at einvoice1.gst.gov.in → API Access |
| EWB creds | 5–10 business days | Pending | P6-FLAG-04 | Apply at ewaybillgst.gov.in → API Registration |
| MSG91 DLT registration | 2–3 business days | Pending | P6-FLAG-05 | Register sender ID at msg91.com/dlt; register every SMS template |
| SendGrid SPF/DKIM DNS | 24–48h DNS propagation | Pending | P6-FLAG-06 | DNS changes on snapaccount.in; verify in SendGrid Console |
| Firebase service-account rotation | Immediate after team lead authorization | Pending | GAP-001 | Rotate exposed key; update firebase-admin-json + firebase-service-account-json |
| ICICI Bank API agreement | 2–4 weeks | Pending | P6-FLAG-08 | Legal agreement with ICICI Business Banking API team |
| HDFC Bank API agreement | 2–4 weeks | Pending | P6-FLAG-08 | Legal agreement with HDFC SmartHub API team |

---

## Cloud Run Secret Mount Pattern

Each secret is mounted in `infra/cloud-run-services.sh` using:

```bash
gcloud run services update <service-name> \
  --set-secrets="ENV_VAR_NAME=secret-name:latest" \
  --region=asia-south1 \
  --project="${GCP_PROJECT_ID}"
```

For secrets accessed via Secret Manager API at runtime (LoanService partner-bank keys),
the service account (`loan-service-sa`) has `roles/secretmanager.secretAccessor` on the project
(granted in `infra/setup.sh` Step 10), so no explicit mount is required — the .NET client
uses Workload Identity / ADC.

---

## Zero-Code-Change Credential Swap

Once Secret Manager slots are created by `infra/secret-manager-external-deps.sh`, activating
a credential is a 2-step operator operation:

```bash
# Step 1: Add the actual value
printf '%s' '<actual-credential>' | gcloud secrets versions add <secret-name> --data-file=-

# Step 2: Trigger a new Cloud Run revision to pick up the latest secret version
gcloud run services update <service-name> \
  --region=asia-south1 \
  --project="${GCP_PROJECT_ID}"
  # (no --set-secrets needed if already mounted — redeploy picks up :latest)
```

No code change, no Docker rebuild required. The `.NET` configuration layer reads the
env var injected by Cloud Run's secret mount at container startup.

---

*Provisioned by: `infra/secret-manager-external-deps.sh` (Phase 7 Wave 2)*
