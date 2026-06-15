#!/usr/bin/env bash
# SnapAccount — Phase 7 / GAP-073: External Dependency Secret Manager Slots
#
# Provisions Secret Manager placeholder secrets for all external-dependency
# credentials so that GSTN/IRP/EWB creds, MSG91 DLT, SendGrid DNS keys, and
# pilot-bank credentials drop in with ZERO code change — operators just add a
# new secret version; services pick it up on next deployment or secret reload.
#
# ─── Secret Name → Service Config Key Mapping ────────────────────────────────
#
# GSTN / IRP / EWB (GstService.Infrastructure/ExternalClients/Production*):
#   gstn-client-id            → env var GSTN_CLIENT_ID       → configuration["GSTN_CLIENT_ID"]
#   gstn-client-secret        → env var GSTN_CLIENT_SECRET    → configuration["GSTN_CLIENT_SECRET"]
#   irp-client-id             → env var IRP_CLIENT_ID         → configuration["IRP_CLIENT_ID"]
#   irp-client-secret         → env var IRP_CLIENT_SECRET     → configuration["IRP_CLIENT_SECRET"]
#   ewb-client-id             → env var EWB_CLIENT_ID         → configuration["EWB_CLIENT_ID"]
#   ewb-client-secret         → env var EWB_CLIENT_SECRET     → configuration["EWB_CLIENT_SECRET"]
#   feature-flag-gst-production-apis-enabled → env var GST_PRODUCTION_APIS_ENABLED (string "true"/"false")
#
# MSG91 (NotificationService.Infrastructure/Adapters/Msg91SmsAdapter):
#   msg91-api-key             → env var MSG91_API_KEY         → configuration["Msg91:ApiKey"]
#   msg91-sender-id           → env var MSG91_SENDER_ID       → context.SenderName (DLT-registered sender)
#
# SendGrid (NotificationService.Infrastructure/Adapters/SendGridEmailAdapter):
#   sendgrid-api-key          → env var SENDGRID_API_KEY      → configuration["SendGrid:ApiKey"]
#   sendgrid-from-email       → env var SENDGRID_FROM_EMAIL   → configuration["SendGrid:FromEmail"]
#   sendgrid-from-name        → env var SENDGRID_FROM_NAME    → configuration["SendGrid:FromName"]
#
# Firebase (FCM push, AuthService + NotificationService — Firebase:ServiceAccountJson):
#   firebase-admin-json       → env var FIREBASE_ADMIN_JSON   → configuration["Firebase:ServiceAccountJson"]
#   firebase-service-account-json (AuthService)               → configuration["Firebase:ServiceAccountJson"]
#
# Pilot-bank creds (LoanService — resolved via CredentialEncryptionService → Secret Manager):
#   partner-bank-creds-<bankId>          resolved by CredentialEncryptionService via GCP_PROJECT_ID +
#   partner-bank-webhook-secret-<bankId>   keyRef stored in loan.partner_banks.api_config_key_ref
#                                          and loan.partner_banks.webhook_secret_ref DB columns
#   loan-credential-encryption-master-key → used to AES-GCM encrypt per-bank configs in DB
#                                           config key: configuration["LoanService:DevKeys:<keyRef>"] (dev only)
#
# SESSION_JWT_SECRET (GAP-005 — all 12 services, FirebaseAuthMiddleware fallback):
#   session-jwt-secret        → env var SESSION_JWT_SECRET    → configuration["SESSION_JWT_SECRET"] or JWT_SECRET_KEY
#
# PAN encryption (AuthService / GstService — AesPanEncryptionService):
#   pan-encryption-key        → env var PAN_ENCRYPTION_KEY    → configuration["PanEncryption:Key"]
#
# KYC sandbox credentials (AuthService — Kyc: section in appsettings.json):
#   kyc-sandbox-api-key       → env var KYC_API_KEY           → configuration["Kyc:ApiKey"] (if configured)
#
# ─────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod   # or snapaccount-staging
#   export ENVIRONMENT=production            # or staging
#   bash infra/secret-manager-external-deps.sh
#
# Idempotent: safe to re-run. Existing secrets are skipped (current values preserved).
# Prerequisites: infra/setup.sh already completed (APIs enabled, SAs created).
#
# NOTE: This script creates placeholder slots only.
#       Replace REPLACE_ME values via:
#         printf '%s' '<actual-value>' | gcloud secrets versions add SECRET_NAME --data-file=-
#       See the "Operator Checklist" section at the bottom of this script.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
ENVIRONMENT="${ENVIRONMENT:-production}"
REGION="asia-south1"

log()     { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "═══════════════════════════════════════════════════"; echo "  $*"; echo "═══════════════════════════════════════════════════"; }

# Helper: create a secret placeholder if the secret does not yet exist.
# Args: $1=secret-name  $2=description  [$3=initial-value (default: REPLACE_ME)]
create_secret() {
    local name="$1"
    local description="$2"
    local initial="${3:-REPLACE_ME}"

    if gcloud secrets describe "${name}" --project="${GCP_PROJECT_ID}" &>/dev/null; then
        log "  ✓ ${name} already exists — skipping (current value preserved)"
    else
        log "  + Creating: ${name}"
        printf '%s' "${initial}" | gcloud secrets create "${name}" \
            --data-file=- \
            --replication-policy=user-managed \
            --locations="${REGION}" \
            --labels="app=snapaccount,phase=7,managed=manual" \
            --project="${GCP_PROJECT_ID}"
        log "    → ${description}"
    fi
}

# Helper: set or update the env-var name that Cloud Run should mount this secret as.
# Documents the mapping — actual Cloud Run secret env-var wiring is in cloud-run-services.sh.
annotate() {
    local name="$1"
    local env_var="$2"
    local config_key="$3"
    local consuming_service="$4"
    log "    Secret: ${name}"
    log "      Cloud Run env var: ${env_var}"
    log "      .NET config key:   ${config_key}"
    log "      Consuming service: ${consuming_service}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Section 1: GSTN / IRP / EWB API Credentials (GstService)
# ─────────────────────────────────────────────────────────────────────────────
section "1. GST API Credentials (GstService)"

log "GSTN Sandbox onboarding: apply at https://developer.gst.gov.in/"
log "  Lead time: 5–10 business days (P6-FLAG-04). Production requires signed agreement."

create_secret "gstn-client-id" \
    "GSTN API client ID — apply at developer.gst.gov.in (sandbox: 5-10 business days; production: signed agreement required)"
annotate "gstn-client-id" "GSTN_CLIENT_ID" "configuration[\"GSTN_CLIENT_ID\"]" "GstService (ProductionGstnApiClient)"

create_secret "gstn-client-secret" \
    "GSTN API client secret — obtained alongside gstn-client-id"
annotate "gstn-client-secret" "GSTN_CLIENT_SECRET" "configuration[\"GSTN_CLIENT_SECRET\"]" "GstService (ProductionGstnApiClient)"

create_secret "irp-client-id" \
    "Invoice Registration Portal (IRP) client ID for e-invoicing (B2B turnover > 5 Cr). Apply at https://einvoice1.gst.gov.in → API Access"
annotate "irp-client-id" "IRP_CLIENT_ID" "configuration[\"IRP_CLIENT_ID\"]" "GstService (ProductionIrpClient)"

create_secret "irp-client-secret" \
    "IRP client secret — obtained alongside irp-client-id"
annotate "irp-client-secret" "IRP_CLIENT_SECRET" "configuration[\"IRP_CLIENT_SECRET\"]" "GstService (ProductionIrpClient)"

create_secret "ewb-client-id" \
    "e-Way Bill (EWB) API client ID — apply at https://ewaybillgst.gov.in → API Registration"
annotate "ewb-client-id" "EWB_CLIENT_ID" "configuration[\"EWB_CLIENT_ID\"]" "GstService (ProductionEwbClient)"

create_secret "ewb-client-secret" \
    "EWB API client secret — obtained alongside ewb-client-id"
annotate "ewb-client-secret" "EWB_CLIENT_SECRET" "configuration[\"EWB_CLIENT_SECRET\"]" "GstService (ProductionEwbClient)"

# GST production API feature flag — controls mock vs live adapter. Default: false.
# To enable: printf 'true' | gcloud secrets versions add feature-flag-gst-production-apis-enabled --data-file=-
if ! gcloud secrets describe "feature-flag-gst-production-apis-enabled" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "  + Creating feature flag: feature-flag-gst-production-apis-enabled = false"
    printf '%s' "false" | gcloud secrets create "feature-flag-gst-production-apis-enabled" \
        --data-file=- \
        --replication-policy=user-managed \
        --locations="${REGION}" \
        --labels="app=snapaccount,type=feature-flag,phase=7" \
        --project="${GCP_PROJECT_ID}"
    log "    → Default: false (mock adapters active). Set to 'true' after GSTN sandbox verified."
else
    log "  ✓ feature-flag-gst-production-apis-enabled already exists"
fi
annotate "feature-flag-gst-production-apis-enabled" "GST_PRODUCTION_APIS_ENABLED" "configuration[\"GST_PRODUCTION_APIS_ENABLED\"]" "GstService (DependencyInjection — adapter selection)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 2: MSG91 SMS + DLT Credentials (NotificationService)
# ─────────────────────────────────────────────────────────────────────────────
section "2. MSG91 SMS + TRAI DLT (NotificationService)"

log "MSG91 DLT registration: Register at https://msg91.com/dlt before go-live."
log "  TRAI DLT sender registration takes 2–3 business days."
log "  Every SMS template must be registered with a DLT template ID."
log "  The Msg91SmsAdapter BLOCKS dispatch if DLT_TE_ID is null (regulatory compliance)."

create_secret "msg91-api-key" \
    "MSG91 API key — obtain at https://msg91.com → Dashboard → API Keys"
annotate "msg91-api-key" "MSG91_API_KEY" "configuration[\"Msg91:ApiKey\"]" "NotificationService (Msg91SmsAdapter)"

# MSG91 sender ID: the 6-char DLT-registered sender string (e.g. SNPACC).
# Stored separately from msg91-api-key because DLT registration uses a different identifier.
# Also used as context.SenderName in NotificationDispatchContext.
create_secret "msg91-sender-id" \
    "MSG91 DLT-registered sender ID (6 chars, e.g. SNPACC) — register at https://msg91.com/dlt"
annotate "msg91-sender-id" "MSG91_SENDER_ID" "context.SenderName (NotificationDispatchContext)" "NotificationService (Msg91SmsAdapter)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 3: SendGrid Email + DNS Keys (NotificationService)
# ─────────────────────────────────────────────────────────────────────────────
section "3. SendGrid Email (NotificationService)"

log "SendGrid SPF/DKIM DNS: requires DNS changes on snapaccount.in domain."
log "  Coordinate with team lead (P6-FLAG-06) for DNS TXT/CNAME records."
log "  Steps: SendGrid Console → Settings → Sender Authentication → Domain Authentication"

create_secret "sendgrid-api-key" \
    "SendGrid API key — obtain at https://app.sendgrid.com → Settings → API Keys (Mail Send permission only)"
annotate "sendgrid-api-key" "SENDGRID_API_KEY" "configuration[\"SendGrid:ApiKey\"]" "NotificationService (SendGridEmailAdapter)"

create_secret "sendgrid-from-email" \
    "SendGrid verified sender email address (e.g. noreply@snapaccount.in) — must match authenticated domain"
annotate "sendgrid-from-email" "SENDGRID_FROM_EMAIL" "configuration[\"SendGrid:FromEmail\"]" "NotificationService (SendGridEmailAdapter)"

create_secret "sendgrid-from-name" \
    "SendGrid display name for outbound email (e.g. SnapAccount)"
annotate "sendgrid-from-name" "SENDGRID_FROM_NAME" "configuration[\"SendGrid:FromName\"]" "NotificationService (SendGridEmailAdapter)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Firebase Admin SDK (FCM push — NotificationService)
# ─────────────────────────────────────────────────────────────────────────────
section "4. Firebase Admin SDK / FCM Push (NotificationService)"

log "Firebase Admin JSON: download from Firebase Console → Project Settings → Service Accounts."
log "  firebase-admin-json is used by NotificationService (FCM) separately from"
log "  firebase-service-account-json (AuthService) so each service SA can be rotated independently."

create_secret "firebase-admin-json" \
    "Firebase Admin SDK service account JSON for FCM push (NotificationService). Download from Firebase Console → Service Accounts."
annotate "firebase-admin-json" "FIREBASE_ADMIN_JSON" "configuration[\"Firebase:ServiceAccountJson\"]" "NotificationService (FcmPushAdapter via FirebaseAdmin SDK)"

# AuthService firebase-service-account-json already provisioned in setup.sh — skip here.
log "  (firebase-service-account-json for AuthService: provisioned in infra/setup.sh Step 9)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Pilot-Bank Credentials (LoanService)
# ─────────────────────────────────────────────────────────────────────────────
section "5. Pilot-Bank Credentials (LoanService)"

log "Pilot banks: ICICI Bank Business Banking API, HDFC Bank SmartHub API."
log "  Each bank's creds are AES-GCM encrypted and stored in loan.partner_banks.api_config_encrypted."
log "  The encryption key reference (keyRef) is stored in api_config_key_ref column."
log "  CredentialEncryptionService resolves the keyRef via GCP Secret Manager at runtime."
log "  LoanService reads GCP_PROJECT_ID from env to construct the Secret Manager resource name."
log ""
log "  Per-bank credential shape (JSON, stored encrypted in DB):"
log '    { "bank_id": "icici", "api_base_url": "...", "client_id": "...", "client_secret": "..." }'
log ""
log "  Naming convention:"
log "    Encryption key:       partner-bank-creds-<bankId>   (resolved by CredentialEncryptionService)"
log "    Disbursement webhook: partner-bank-webhook-secret-<bankId>"
log "    bankId values:        icici, hdfc (add more as banks onboard)"

# Template documentation secret (already provisioned in setup.sh; add here in case setup.sh not run yet)
create_secret "partner-bank-creds-template" \
    'Template shape for per-bank encryption keys. Operators create: partner-bank-creds-<bankId>. Value must be a 32-byte AES-GCM key (base64-encoded, 44 chars): openssl rand -base64 32'

create_secret "partner-bank-webhook-secret-template" \
    'Template for per-bank HMAC-SHA256 webhook secrets. Operators create: partner-bank-webhook-secret-<bankId>. Value: openssl rand -base64 48'

# Pilot bank encryption key slots
log ""
log "Creating ICICI pilot bank encryption key slot..."
create_secret "partner-bank-creds-icici" \
    "AES-GCM encryption key for ICICI Bank API credentials (base64, 32 bytes). Generate: openssl rand -base64 32. Then INSERT into loan.partner_banks with api_config_key_ref='partner-bank-creds-icici'"
annotate "partner-bank-creds-icici" "(resolved via Secret Manager, not env var)" \
    "CredentialEncryptionService.ResolveKeyAsync(\"partner-bank-creds-icici\")" "LoanService"

log ""
log "Creating HDFC pilot bank encryption key slot..."
create_secret "partner-bank-creds-hdfc" \
    "AES-GCM encryption key for HDFC Bank API credentials (base64, 32 bytes). Generate: openssl rand -base64 32."
annotate "partner-bank-creds-hdfc" "(resolved via Secret Manager, not env var)" \
    "CredentialEncryptionService.ResolveKeyAsync(\"partner-bank-creds-hdfc\")" "LoanService"

log ""
log "Creating ICICI webhook secret slot..."
create_secret "partner-bank-webhook-secret-icici" \
    "HMAC-SHA256 shared webhook secret for ICICI disbursement callbacks. Generate: openssl rand -base64 48."
annotate "partner-bank-webhook-secret-icici" "(resolved via Secret Manager, not env var)" \
    "CredentialEncryptionService.GetWebhookSecretAsync(\"partner-bank-webhook-secret-icici\")" "LoanService (RestPartnerBankAdapter)"

log ""
log "Creating HDFC webhook secret slot..."
create_secret "partner-bank-webhook-secret-hdfc" \
    "HMAC-SHA256 shared webhook secret for HDFC disbursement callbacks. Generate: openssl rand -base64 48."
annotate "partner-bank-webhook-secret-hdfc" "(resolved via Secret Manager, not env var)" \
    "CredentialEncryptionService.GetWebhookSecretAsync(\"partner-bank-webhook-secret-hdfc\")" "LoanService (RestPartnerBankAdapter)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 6: SESSION_JWT_SECRET — GAP-005 (all 12 services)
# ─────────────────────────────────────────────────────────────────────────────
section "6. SESSION_JWT_SECRET (GAP-005 — all 12 services)"

log "WARNING: GAP-005 — FirebaseAuthMiddleware has a hardcoded fallback HS256 secret."
log "  This secret must be provisioned in Secret Manager and injected as SESSION_JWT_SECRET."
log "  Services must FAIL FAST at startup in non-Development when this secret is missing."
log "  (Fail-fast implementation is backend-agent responsibility — tracked in GAP-005.)"

create_secret "session-jwt-secret" \
    "SESSION JWT signing secret (min 64 chars). Generate: openssl rand -base64 64. Mount as SESSION_JWT_SECRET env var on ALL 12 Cloud Run services."
annotate "session-jwt-secret" "SESSION_JWT_SECRET" \
    "configuration[\"SESSION_JWT_SECRET\"] (FirebaseAuthMiddleware fallback)" "ALL 12 services"

# Convenience alias matching existing setup.sh naming
create_secret "jwt-secret-key" \
    "JWT secret key alias (same value as session-jwt-secret). Used by jwt-secret-key references in AuthService."

# ─────────────────────────────────────────────────────────────────────────────
# Section 7: PAN Encryption Key (AuthService / GstService)
# ─────────────────────────────────────────────────────────────────────────────
section "7. PAN Encryption Key (AuthService / GstService)"

create_secret "pan-encryption-key" \
    "AES-256-GCM PAN encryption key (base64, 32 bytes). Generate: openssl rand -base64 32. Mount as PAN_ENCRYPTION_KEY → PanEncryption:Key config section."
annotate "pan-encryption-key" "PAN_ENCRYPTION_KEY" \
    "configuration[\"PanEncryption:Key\"]" "AuthService + GstService (AesPanEncryptionService)"

# ─────────────────────────────────────────────────────────────────────────────
# Section 8: Loan Credential Encryption Master Key
# ─────────────────────────────────────────────────────────────────────────────
section "8. Loan Credential Master Encryption Key (LoanService)"

create_secret "loan-credential-master-key" \
    "Master AES-GCM key used to wrap per-bank credential keys (envelope encryption). base64, 32 bytes. Generate: openssl rand -base64 32."
annotate "loan-credential-master-key" "(resolved via Secret Manager, not env var)" \
    "CredentialEncryptionService (envelope encryption for per-bank configs)" "LoanService"

# ─────────────────────────────────────────────────────────────────────────────
# Section 9: Razorpay Webhook Secret (SubscriptionService — NEW-D07)
#
# The Razorpay webhook secret is the HMAC-SHA256 signing key that Razorpay uses
# to sign every webhook payload it sends to POST /subscriptions/webhooks/razorpay.
#
# Code reference:
#   SubscriptionService.Api/Endpoints/RazorpayWebhook.cs
#     var secret = configuration["RAZORPAY_WEBHOOK_SECRET"];
#   The endpoint reads this key at request time and uses CryptographicOperations.
#   FixedTimeEquals (SEC-051) to compare against X-Razorpay-Signature header.
#
# Why this is separate from razorpay-key-id / razorpay-key-secret:
#   - key-id + key-secret authenticate outbound API calls (order creation, plan sync).
#   - webhook-secret authenticates INBOUND events from Razorpay.
#   - They are rotated independently: the webhook secret is rotated in the
#     Razorpay Dashboard → Webhooks → Edit; the key-id/secret in Account → API Keys.
#
# ⚠ BLOCKER (NEW-D07): Disbursement webhooks silently reject with 503 if this
#   secret is absent (fail-closed) or 401 if set to the wrong value.
#   Provision this secret BEFORE enabling the subscription webhook URL in the
#   Razorpay Dashboard.
# ─────────────────────────────────────────────────────────────────────────────
section "9. Razorpay Webhook Secret (SubscriptionService — NEW-D07)"

log "WARNING: RAZORPAY_WEBHOOK_SECRET must be provisioned BEFORE registering the webhook"
log "  URL in the Razorpay Dashboard. Without it, all webhook calls return 503."
log "  Obtain from: Razorpay Dashboard → Account & Settings → Webhooks → Edit → Secret"
log "  See also: docs/devops/subscription-razorpay-setup.md"

create_secret "razorpay-webhook-secret" \
    "HMAC-SHA256 webhook signing secret from Razorpay Dashboard → Webhooks → Edit → Secret. Mount as RAZORPAY_WEBHOOK_SECRET on subscription-service. SEC-051."
annotate "razorpay-webhook-secret" "RAZORPAY_WEBHOOK_SECRET" \
    "configuration[\"RAZORPAY_WEBHOOK_SECRET\"] (RazorpayWebhook.cs endpoint)" "SubscriptionService"

# ─────────────────────────────────────────────────────────────────────────────
# Section 10: Consent HMAC Key (LoanService — P6-HANDOFF-26)
# ─────────────────────────────────────────────────────────────────────────────
section "10. Consent HMAC Key (LoanService — P6-HANDOFF-26)"

create_secret "loan-consent-hmac-key" \
    "HMAC-SHA256 key for loan consent integrity (P6-HANDOFF-26 ConsentHmacKeyProvider). base64, 32 bytes."
annotate "loan-consent-hmac-key" "LOAN_CONSENT_HMAC_KEY" \
    "ConsentHmacKeyProvider (IConsentHmacKeyProvider)" "LoanService"

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
section "SUMMARY"

echo ""
echo "Secret Manager slots created for environment: ${ENVIRONMENT}"
echo ""
echo "All secrets are currently set to 'REPLACE_ME'."
echo ""
echo "════════════════════════════════════════════════════════════"
echo " OPERATOR CHECKLIST — replace before go-live"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  GSTN credentials (P6-FLAG-04 — 5–10 business day lead time):"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add gstn-client-id      --data-file=-"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add gstn-client-secret   --data-file=-"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add irp-client-id        --data-file=-"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add irp-client-secret    --data-file=-"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add ewb-client-id        --data-file=-"
echo "    printf '%s' '<actual-value>' | gcloud secrets versions add ewb-client-secret    --data-file=-"
echo "    After all three verified on sandbox:"
echo "    printf 'true' | gcloud secrets versions add feature-flag-gst-production-apis-enabled --data-file=-"
echo ""
echo "  MSG91 DLT (P6-FLAG-05 — 2–3 business day lead time):"
echo "    printf '%s' '<api-key>' | gcloud secrets versions add msg91-api-key   --data-file=-"
echo "    printf '%s' 'SNPACC'    | gcloud secrets versions add msg91-sender-id  --data-file=-"
echo ""
echo "  SendGrid DNS (P6-FLAG-06 — DNS changes required):"
echo "    printf '%s' 'SG.<key>'              | gcloud secrets versions add sendgrid-api-key    --data-file=-"
echo "    printf '%s' 'noreply@snapaccount.in' | gcloud secrets versions add sendgrid-from-email --data-file=-"
echo "    printf '%s' 'SnapAccount'            | gcloud secrets versions add sendgrid-from-name  --data-file=-"
echo ""
echo "  Firebase FCM:"
echo "    cat service-account.json | gcloud secrets versions add firebase-admin-json --data-file=-"
echo ""
echo "  Pilot banks (requires bank API agreements):"
echo "    openssl rand -base64 32 | gcloud secrets versions add partner-bank-creds-icici        --data-file=-"
echo "    openssl rand -base64 48 | gcloud secrets versions add partner-bank-webhook-secret-icici --data-file=-"
echo "    openssl rand -base64 32 | gcloud secrets versions add partner-bank-creds-hdfc          --data-file=-"
echo "    openssl rand -base64 48 | gcloud secrets versions add partner-bank-webhook-secret-hdfc  --data-file=-"
echo "    Then INSERT partner_banks rows with api_config_key_ref / webhook_secret_ref set to"
echo "    these secret names, and api_config_encrypted = CredentialEncryptionService.Encrypt(configJson, keyRef)"
echo ""
echo "  SESSION_JWT_SECRET (GAP-005 — HIGH PRIORITY):"
echo "    openssl rand -base64 64 | gcloud secrets versions add session-jwt-secret --data-file=-"
echo "    openssl rand -base64 64 | gcloud secrets versions add jwt-secret-key     --data-file=-"
echo ""
echo "  PAN encryption:"
echo "    openssl rand -base64 32 | gcloud secrets versions add pan-encryption-key --data-file=-"
echo ""
echo "  Razorpay webhook secret (NEW-D07 — HIGH PRIORITY: without this, all Razorpay webhooks return 503):"
echo "    Obtain from: Razorpay Dashboard → Account & Settings → Webhooks → Edit → Secret"
echo "    printf '%s' '<webhook-secret-from-dashboard>' | gcloud secrets versions add razorpay-webhook-secret --data-file=-"
echo "    See: docs/devops/subscription-razorpay-setup.md for full activation runbook."
echo ""
echo "  CLOUD RUN WIRING: After adding secret values, run:"
echo "    bash infra/cloud-run-services.sh  (update secret mounts for all 12 services)"
echo ""
echo "  Full mapping table: docs/devops/external-deps-secret-mapping.md"
echo ""
