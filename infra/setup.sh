#!/usr/bin/env bash
# SnapAccount — GCP Infrastructure Setup Script
# Run this ONCE to bootstrap the entire GCP project from scratch.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - Billing account available
#   - Owner/Editor permissions on the GCP organization or folder
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod   # or snapaccount-staging
#   export GITHUB_ORG=your-github-org
#   export GITHUB_REPO=snapaccount
#   export BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX
#   bash infra/setup.sh
#
# DPDP Act 2023: All resources are created in asia-south1 (Mumbai) for data localization.

set -euo pipefail

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
GITHUB_ORG="${GITHUB_ORG:?Set GITHUB_ORG env var (GitHub org or user name)}"
GITHUB_REPO="${GITHUB_REPO:-snapaccount}"
BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_ID:?Set BILLING_ACCOUNT_ID env var}"

REGION="asia-south1"
ZONE="asia-south1-a"
VPC_NAME="snapaccount-vpc"
SUBNET_NAME="snapaccount-subnet"
SUBNET_RANGE="10.0.0.0/20"
CONNECTOR_NAME="snapaccount-vpc-connector"
CONNECTOR_RANGE="10.8.0.0/28"
ARTIFACT_REGISTRY_REPO="services"
CLOUD_SQL_INSTANCE="snapaccount-postgres"
CLOUD_SQL_TIER="db-f1-micro"   # free-tier equivalent for zero-budget phase; upgrade for prod
GCS_BUCKET="${GCP_PROJECT_ID}-documents"
GCS_AUDIT_BUCKET="${GCP_PROJECT_ID}-audit-logs"
REDIS_INSTANCE="snapaccount-redis"

log() { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "═══════════════════════════════════════"; echo "  $*"; echo "═══════════════════════════════════════"; }

# ─────────────────────────────────────────────
# Step 1: Create GCP project
# ─────────────────────────────────────────────
section "Step 1: Create / configure GCP project"

if gcloud projects describe "${GCP_PROJECT_ID}" &>/dev/null; then
    log "Project ${GCP_PROJECT_ID} already exists — skipping creation"
else
    log "Creating project ${GCP_PROJECT_ID}..."
    gcloud projects create "${GCP_PROJECT_ID}" \
        --name="SnapAccount" \
        --labels="environment=production,app=snapaccount,region=india,compliance=dpdp"
fi

gcloud config set project "${GCP_PROJECT_ID}"

log "Linking billing account..."
gcloud billing projects link "${GCP_PROJECT_ID}" \
    --billing-account="${BILLING_ACCOUNT_ID}"

# ─────────────────────────────────────────────
# Step 2: Enable required APIs
# ─────────────────────────────────────────────
section "Step 2: Enable GCP APIs"

APIS=(
    "run.googleapis.com"
    "artifactregistry.googleapis.com"
    "sqladmin.googleapis.com"
    "secretmanager.googleapis.com"
    "pubsub.googleapis.com"
    "storage.googleapis.com"
    "vpcaccess.googleapis.com"
    "compute.googleapis.com"
    "iam.googleapis.com"
    "iamcredentials.googleapis.com"
    "cloudresourcemanager.googleapis.com"
    "documentai.googleapis.com"
    "aiplatform.googleapis.com"
    "redis.googleapis.com"
    "monitoring.googleapis.com"
    "logging.googleapis.com"
    "cloudarmor.googleapis.com"
    "networkservices.googleapis.com"
    "dns.googleapis.com"
    "servicenetworking.googleapis.com"
)

for api in "${APIS[@]}"; do
    log "Enabling ${api}..."
    gcloud services enable "${api}" --project="${GCP_PROJECT_ID}" 2>/dev/null || true
done

log "Waiting for API propagation (30s)..."
sleep 30

# ─────────────────────────────────────────────
# Step 3: VPC and networking
# ─────────────────────────────────────────────
section "Step 3: VPC, Subnet, Serverless VPC Connector"

if ! gcloud compute networks describe "${VPC_NAME}" &>/dev/null; then
    log "Creating VPC ${VPC_NAME}..."
    gcloud compute networks create "${VPC_NAME}" \
        --subnet-mode=custom \
        --bgp-routing-mode=regional

    log "Creating subnet ${SUBNET_NAME}..."
    gcloud compute subnets create "${SUBNET_NAME}" \
        --network="${VPC_NAME}" \
        --region="${REGION}" \
        --range="${SUBNET_RANGE}" \
        --enable-private-ip-google-access
else
    log "VPC ${VPC_NAME} already exists — skipping"
fi

# Serverless VPC Access connector (Cloud Run → VPC)
if ! gcloud compute networks vpc-access connectors describe "${CONNECTOR_NAME}" --region="${REGION}" &>/dev/null; then
    log "Creating VPC Access connector ${CONNECTOR_NAME}..."
    gcloud compute networks vpc-access connectors create "${CONNECTOR_NAME}" \
        --region="${REGION}" \
        --subnet="${SUBNET_NAME}" \
        --subnet-project="${GCP_PROJECT_ID}" \
        --min-instances=2 \
        --max-instances=10 \
        --machine-type=e2-micro
else
    log "VPC connector ${CONNECTOR_NAME} already exists — skipping"
fi

# Firewall: allow internal traffic between Cloud Run services
log "Creating firewall rules..."
gcloud compute firewall-rules create "allow-internal-${VPC_NAME}" \
    --network="${VPC_NAME}" \
    --action=ALLOW \
    --direction=INGRESS \
    --rules=tcp:8080,tcp:5432,tcp:6379 \
    --source-ranges="${SUBNET_RANGE}" \
    --description="Allow internal traffic between microservices" 2>/dev/null || true

# ─────────────────────────────────────────────
# Step 4: Artifact Registry
# ─────────────────────────────────────────────
section "Step 4: Artifact Registry"

if ! gcloud artifacts repositories describe "${ARTIFACT_REGISTRY_REPO}" \
        --location="${REGION}" &>/dev/null; then
    log "Creating Artifact Registry repository..."
    gcloud artifacts repositories create "${ARTIFACT_REGISTRY_REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="SnapAccount microservices Docker images" \
        --labels="app=snapaccount"
else
    log "Artifact Registry repo already exists — skipping"
fi

# Cleanup policy: keep last 10 versions, delete untagged after 7 days
gcloud artifacts repositories set-cleanup-policies "${ARTIFACT_REGISTRY_REPO}" \
    --location="${REGION}" \
    --policy="[{\"name\":\"keep-last-10\",\"action\":{\"type\":\"Keep\"},\"mostRecentVersions\":{\"keepCount\":10}},{\"name\":\"delete-old-untagged\",\"action\":{\"type\":\"Delete\"},\"condition\":{\"tagState\":\"untagged\",\"olderThan\":\"604800s\"}}]" \
    2>/dev/null || log "Cleanup policy: gcloud version may not support this flag — set manually in console"

# ─────────────────────────────────────────────
# Step 5: Cloud SQL (PostgreSQL 17)
# ─────────────────────────────────────────────
section "Step 5: Cloud SQL PostgreSQL 17"

if ! gcloud sql instances describe "${CLOUD_SQL_INSTANCE}" &>/dev/null; then
    log "Creating Cloud SQL instance ${CLOUD_SQL_INSTANCE} (this takes ~5 min)..."
    gcloud sql instances create "${CLOUD_SQL_INSTANCE}" \
        --database-version=POSTGRES_17 \
        --tier="${CLOUD_SQL_TIER}" \
        --region="${REGION}" \
        --no-assign-ip \
        --network="${VPC_NAME}" \
        --enable-google-private-path \
        --backup-start-time="02:00" \
        --enable-bin-log \
        --retained-backups-count=7 \
        --retained-transaction-log-days=7 \
        --storage-type=SSD \
        --storage-size=20GB \
        --storage-auto-increase \
        --deletion-protection \
        --database-flags="cloudsql.iam_authentication=on" \
        --labels="app=snapaccount,region=india,compliance=dpdp"

    log "Creating database snapaccount..."
    gcloud sql databases create snapaccount \
        --instance="${CLOUD_SQL_INSTANCE}"

    log "Creating database user (managed via Secret Manager — no hardcoded password)..."
    DB_PASSWORD=$(openssl rand -base64 32)
    gcloud sql users create snapaccount-app \
        --instance="${CLOUD_SQL_INSTANCE}" \
        --password="${DB_PASSWORD}"

    # Store DB connection string in Secret Manager immediately
    DB_PRIVATE_IP=$(gcloud sql instances describe "${CLOUD_SQL_INSTANCE}" \
        --format="value(ipAddresses[0].ipAddress)")
    DB_CONN_STRING="Host=${DB_PRIVATE_IP};Port=5432;Database=snapaccount;Username=snapaccount-app;Password=${DB_PASSWORD}"
    echo -n "${DB_CONN_STRING}" | gcloud secrets create db-connection-string-prod \
        --data-file=- \
        --replication-policy=user-managed \
        --locations="${REGION}"
    echo -n "${DB_CONN_STRING}" | gcloud secrets create db-connection-string-staging \
        --data-file=- \
        --replication-policy=user-managed \
        --locations="${REGION}"

    log "DB connection strings stored in Secret Manager (db-connection-string-prod, db-connection-string-staging)"
else
    log "Cloud SQL instance ${CLOUD_SQL_INSTANCE} already exists — skipping"
fi

# Enable pgvector via Cloud SQL init (run after first connection)
log "NOTE: After Cloud SQL is ready, run the following SQL to enable pgvector:"
log "  CREATE EXTENSION IF NOT EXISTS vector;"
log "  Then run: bash infra/init-db-schemas.sh"

# ─────────────────────────────────────────────
# Step 6: Cloud Memorystore (Redis)
#
# Phase 6F: Redis serves two purposes:
#   1. SignalR backplane for ChatService (Microsoft.AspNetCore.SignalR.StackExchangeRedis).
#      Cross-instance fan-out for chat groups, typing indicators, and presence.
#   2. Ephemeral state cache (typing indicators stored with 30s TTL).
#
# Tier selection (cost flag for team lead):
#   BASIC         → staging.  Single node, no replica. ~$50/month (1GB, asia-south1).
#                   Adequate for staging load. Downtime during maintenance windows.
#   STANDARD_HA   → production. Primary + replica, automatic failover ~60 seconds.
#                   ~$280/month (1GB, asia-south1). Required for production availability.
#
# Network: private IP only, same VPC as Cloud Run services. No public IP assigned.
# Region: asia-south1 (Mumbai) — DPDP Act 2023 data localization.
#
# OPERATOR NOTE: Set REDIS_TIER=BASIC for staging or STANDARD_HA for production.
# Default below is BASIC. Override before running: export REDIS_TIER=STANDARD_HA
# ─────────────────────────────────────────────
section "Step 6: Cloud Memorystore (Redis)"

REDIS_TIER="${REDIS_TIER:-BASIC}"
log "Redis tier: ${REDIS_TIER} (set REDIS_TIER=STANDARD_HA for production HA)"

if ! gcloud redis instances describe "${REDIS_INSTANCE}" --region="${REGION}" &>/dev/null; then
    log "Creating Redis instance ${REDIS_INSTANCE} (tier=${REDIS_TIER}, ~5 min)..."
    gcloud redis instances create "${REDIS_INSTANCE}" \
        --size=1 \
        --region="${REGION}" \
        --redis-version=redis_7_2 \
        --network="projects/${GCP_PROJECT_ID}/global/networks/${VPC_NAME}" \
        --tier="${REDIS_TIER}" \
        --labels="app=snapaccount,purpose=signalr-backplane,phase=6f"

    REDIS_HOST=$(gcloud redis instances describe "${REDIS_INSTANCE}" \
        --region="${REGION}" \
        --format="value(host)")
    REDIS_PORT=$(gcloud redis instances describe "${REDIS_INSTANCE}" \
        --region="${REGION}" \
        --format="value(port)")

    # StackExchange.Redis connection string format (used by ChatService SignalR backplane
    # and any other service that needs Redis ephemeral state).
    # Format: <host>:<port>,abortConnect=false,connectTimeout=5000,syncTimeout=5000
    REDIS_CONN_STRING="${REDIS_HOST}:${REDIS_PORT},abortConnect=false,connectTimeout=5000,syncTimeout=5000"

    echo -n "${REDIS_CONN_STRING}" | gcloud secrets create redis-connection-string-prod \
        --data-file=- \
        --replication-policy=user-managed \
        --locations="${REGION}" \
        --labels="app=snapaccount,managed=auto"
    echo -n "${REDIS_CONN_STRING}" | gcloud secrets create redis-connection-string-staging \
        --data-file=- \
        --replication-policy=user-managed \
        --locations="${REGION}" \
        --labels="app=snapaccount,managed=auto"
    log "Redis connection strings stored in Secret Manager:"
    log "  redis-connection-string-prod"
    log "  redis-connection-string-staging"
    log "  Host: ${REDIS_HOST}:${REDIS_PORT} (private IP — VPC only)"
else
    log "Redis instance ${REDIS_INSTANCE} already exists — skipping"
    log "  To upgrade tier to STANDARD_HA: gcloud redis instances upgrade ${REDIS_INSTANCE} --region=${REGION} (staging→prod promotion)"
fi

# ─────────────────────────────────────────────
# Step 7: Cloud Storage buckets
# ─────────────────────────────────────────────
section "Step 7: Cloud Storage Buckets"

create_bucket() {
    local bucket_name="$1"
    local description="$2"
    if ! gcloud storage buckets describe "gs://${bucket_name}" &>/dev/null; then
        log "Creating bucket gs://${bucket_name}..."
        gcloud storage buckets create "gs://${bucket_name}" \
            --location="${REGION}" \
            --uniform-bucket-level-access \
            --public-access-prevention \
            --default-encryption-key=projects/${GCP_PROJECT_ID}/locations/${REGION}/keyRings/snapaccount-keyring/cryptoKeys/storage-key 2>/dev/null \
            || gcloud storage buckets create "gs://${bucket_name}" \
                --location="${REGION}" \
                --uniform-bucket-level-access \
                --public-access-prevention
        log "Bucket created: ${description}"
    else
        log "Bucket ${bucket_name} already exists — skipping"
    fi
}

create_bucket "${GCS_BUCKET}" "User document storage"
create_bucket "${GCS_AUDIT_BUCKET}" "Audit log archive"
create_bucket "${GCP_PROJECT_ID}-reports" "Generated PDF reports"
# Phase 6C: Separate bucket for loan application packages (sanction letters, agreements,
# disbursement advices). Kept separate from the general documents bucket so that:
#   (a) RBI lending record retention policy (7 years) can be applied independently.
#   (b) Access can be scoped to LoanService SA only without widening DocumentService access.
create_bucket "${GCP_PROJECT_ID}-loan-packages" "Loan application packages (sanction letters, agreements, disbursement advices)"

# Lifecycle rules — 7-year retention (DPDP Act + tax law requirement)
log "Setting 7-year retention lifecycle on document bucket..."
cat > /tmp/lifecycle-7yr.json << 'LIFECYCLE'
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 365, "matchesStorageClass": ["STANDARD"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 730, "matchesStorageClass": ["NEARLINE"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "ARCHIVE"},
      "condition": {"age": 1825, "matchesStorageClass": ["COLDLINE"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 2557}
    }
  ]
}
LIFECYCLE

gcloud storage buckets update "gs://${GCS_BUCKET}" \
    --lifecycle-file=/tmp/lifecycle-7yr.json

# Audit log bucket: no auto-delete (immutable audit trail)
cat > /tmp/lifecycle-audit.json << 'LIFECYCLE_AUDIT'
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 365, "matchesStorageClass": ["STANDARD"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "ARCHIVE"},
      "condition": {"age": 730, "matchesStorageClass": ["COLDLINE"]}
    }
  ]
}
LIFECYCLE_AUDIT

gcloud storage buckets update "gs://${GCS_AUDIT_BUCKET}" \
    --lifecycle-file=/tmp/lifecycle-audit.json

# ── Phase 6C: Loan packages bucket lifecycle ─────────────────────────────────
# Compliance basis: RBI Master Direction on Digital Lending (2022) + DPDP Act 2023.
# Loan records (sanction letters, executed agreements, disbursement advices) must be
# retained for a minimum of 7 years from loan closure.
#
# Tiering rationale:
#   0–90 days   → STANDARD   (active loan origination; frequently accessed)
#   90 days–7yr → COLDLINE   (closed / dormant; regulatory hold; audit retrieval only)
#   7yr+        → DELETE     (retention period elapsed; deletion is compliant)
#
# OPERATOR NOTE: GCS does not enforce a locked retention policy by default.
# If your compliance program requires object lock (immutable retention), enable
# Bucket Lock via: gcloud storage buckets update --retention-period=<seconds>
# HOWEVER, Bucket Lock is PERMANENT and irreversible — obtain team lead approval
# before enabling. See docs/devops/loan-package-bucket-lifecycle.md §bucket-lock.
#
log "Setting loan-packages lifecycle (Coldline after 90d, Delete after 7yr)..."
cat > /tmp/lifecycle-loan-packages.json << 'LIFECYCLE_LOAN'
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 90, "matchesStorageClass": ["STANDARD"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 2557}
    }
  ]
}
LIFECYCLE_LOAN

gcloud storage buckets update "gs://${GCP_PROJECT_ID}-loan-packages" \
    --lifecycle-file=/tmp/lifecycle-loan-packages.json

# Store loan-packages bucket name in Secret Manager so LoanService / ReportService
# can reference it without hardcoding the project ID.
echo -n "${GCP_PROJECT_ID}-loan-packages" | gcloud secrets create gcs-loan-packages-bucket \
    --data-file=- \
    --replication-policy=user-managed \
    --locations="${REGION}" 2>/dev/null || \
    echo -n "${GCP_PROJECT_ID}-loan-packages" | gcloud secrets versions add gcs-loan-packages-bucket --data-file=-

# Store bucket names in Secret Manager for services to reference
echo -n "${GCS_BUCKET}" | gcloud secrets create gcs-documents-bucket \
    --data-file=- \
    --replication-policy=user-managed \
    --locations="${REGION}" 2>/dev/null || \
    echo -n "${GCS_BUCKET}" | gcloud secrets versions add gcs-documents-bucket --data-file=-

# ─────────────────────────────────────────────
# Step 8: Cloud Pub/Sub topics
# ─────────────────────────────────────────────
section "Step 8: Cloud Pub/Sub Topics & Subscriptions"

PUBSUB_TOPICS=(
    "snapaccount.document.ocr.completed"
    "snapaccount.document.uploaded"
    "snapaccount.gst.return.filed"
    "snapaccount.itr.filed"
    "snapaccount.user.registered"
    "snapaccount.loan.status.changed"
    "snapaccount.chat.message.received"
    "snapaccount.subscription.expired"
    "snapaccount.subscription.changed"
    "snapaccount.notification.send"
    # Phase 6E: callback domain events (callback.*.event pattern — single topic, payload-discriminated)
    "snapaccount.callback.events"
    # Phase 6E: recurring jobs trigger topic (Cloud Scheduler → NotificationService)
    "snapaccount.recurring-jobs.due"
    # Phase 6C: loan domain events — disbursement lifecycle events for downstream consumption
    # Consumers: NotificationService (Loan Approved, Loan Disbursed, EMI Due push + SMS).
    "snapaccount.loan.events"
    # DG-INFRA-02: DPDP Act 2023 Right-to-Erasure cascade topic.
    # Publisher: Platform AccountDeletionRequestedEventHandler (account-deletion-events).
    # Subscribers: 7 background workers across all 3 composites — see create_subscription
    # calls below. Each module anonymises its own data independently (least-privilege fan-out).
    # Without this topic + subscriptions the erasure cascade silently never runs in prod.
    "account-deletion-events"
)

for topic in "${PUBSUB_TOPICS[@]}"; do
    log "Creating topic: ${topic}"
    gcloud pubsub topics create "${topic}" \
        --message-retention-duration=7d \
        --labels="app=snapaccount" 2>/dev/null || log "Topic ${topic} already exists"

    # Create dead-letter topic
    DL_TOPIC="${topic}.dead-letter"
    gcloud pubsub topics create "${DL_TOPIC}" \
        --message-retention-duration=14d \
        --labels="app=snapaccount,type=dead-letter" 2>/dev/null || true
done

# Create push subscriptions for services that consume events
create_subscription() {
    local topic="$1"
    local sub_name="$2"
    local ack_deadline="${3:-60}"
    gcloud pubsub subscriptions create "${sub_name}" \
        --topic="${topic}" \
        --ack-deadline="${ack_deadline}" \
        --max-delivery-attempts=5 \
        --dead-letter-topic="${topic}.dead-letter" \
        --message-retention-duration=7d \
        --labels="app=snapaccount" 2>/dev/null || log "Subscription ${sub_name} already exists"
}

create_subscription "snapaccount.document.ocr.completed" "accounting-service-ocr-sub"
create_subscription "snapaccount.document.ocr.completed" "gst-service-ocr-sub"
# Phase 7 (board #31): AiService RagIngestionSubscriber pulls from this topic to index
# OCR-completed documents into the RAG vector store (pgvector). Uses the same
# dead-letter policy (5 attempts, 14d retention on DL topic) as sibling subscriptions.
# Consumer: AiService → RagIngestionSubscriber background worker.
create_subscription "snapaccount.document.ocr.completed" "ai-service-rag-sub"
create_subscription "snapaccount.gst.return.filed" "notification-service-gst-sub"
create_subscription "snapaccount.itr.filed" "notification-service-itr-sub"
create_subscription "snapaccount.user.registered" "notification-service-user-sub"
create_subscription "snapaccount.loan.status.changed" "notification-service-loan-sub"
# Phase 6C: loan domain events subscription (Loan Approved / Loan Disbursed / EMI Due)
create_subscription "snapaccount.loan.events" "notification-service-loan-events-sub"
create_subscription "snapaccount.chat.message.received" "notification-service-chat-sub"
create_subscription "snapaccount.subscription.expired" "notification-service-sub-expired-sub"
create_subscription "snapaccount.subscription.changed" "auth-service-subscription-sub"
create_subscription "snapaccount.notification.send" "notification-service-send-sub"
# Phase 6E: CallbackService events → NotificationService (callback scheduled/completed → push user)
create_subscription "snapaccount.callback.events" "notification-service-callback-sub"
# Phase 6E: recurring jobs topic → NotificationService (Cloud Scheduler fires, service wakes)
create_subscription "snapaccount.recurring-jobs.due" "notification-service-recurring-jobs-sub"

# ── DG-INFRA-02: DPDP Act 2023 Right-to-Erasure subscriptions ────────────────
# Topic: account-deletion-events (published by Platform AccountDeletionRequestedEventHandler)
# Each module owns its own subscription so it can erase independently and at its own pace.
# Subscription names MUST match the DefaultSubscription/Subscription constants in each
# AccountDeletionSubscriber.cs. Verified against source on 2026-06-28:
#
#   Finance.Loan.Messaging.AccountDeletionSubscriber   : loan-service-account-deletion-sub
#   Finance.Gst.Messaging.AccountDeletionSubscriber    : gst-service-account-deletion-sub
#   Finance.Itr.Messaging.AccountDeletionSubscriber    : itr-service-account-deletion-sub
#   Platform.Notification.AccountDeletionSubscriber    : notification-service-account-deletion-sub
#   Platform.Subscription.AccountDeletionSubscriber    : subscription-service-account-deletion-sub
#   Assist.Chat.Messaging.AccountDeletionSubscriber    : chat-service-account-deletion-sub
#   Assist.Callback.Messaging.AccountDeletionSubscriber: callback-service-account-deletion-sub
#
# ack_deadline=300s: DPDP erasure may involve multiple DB operations per module — allow
# enough time before Pub/Sub redelivers (GCP max per-subscription deadline = 600s).
# dead-letter after 5 attempts so failed erasures surface in Cloud Monitoring.
create_subscription "account-deletion-events" "loan-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "gst-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "itr-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "notification-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "subscription-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "chat-service-account-deletion-sub" 300
create_subscription "account-deletion-events" "callback-service-account-deletion-sub" 300

# ─────────────────────────────────────────────
# Step 9: Secret Manager — create placeholder secrets
# ─────────────────────────────────────────────
section "Step 9: Secret Manager Placeholders"

create_secret_placeholder() {
    local secret_name="$1"
    local description="$2"
    if ! gcloud secrets describe "${secret_name}" &>/dev/null; then
        log "Creating secret placeholder: ${secret_name}"
        echo -n "REPLACE_ME" | gcloud secrets create "${secret_name}" \
            --data-file=- \
            --replication-policy=user-managed \
            --locations="${REGION}" \
            --labels="app=snapaccount,managed=manual"
        log "  → ${description}"
    else
        log "Secret ${secret_name} already exists"
    fi
}

# Firebase
create_secret_placeholder "firebase-service-account-json" "Firebase Admin SDK service account JSON (download from Firebase Console)"
create_secret_placeholder "firebase-web-api-key-prod" "Firebase web API key (production)"
create_secret_placeholder "firebase-web-api-key-staging" "Firebase web API key (staging)"
create_secret_placeholder "firebase-web-app-id-prod" "Firebase web app ID (production)"
create_secret_placeholder "firebase-web-app-id-staging" "Firebase web app ID (staging)"
create_secret_placeholder "firebase-auth-domain" "Firebase auth domain (e.g., snapaccount.firebaseapp.com)"

# Auth / JWT
create_secret_placeholder "jwt-secret-key" "JWT signing secret key (min 32 chars, use openssl rand -base64 64)"

# External APIs
create_secret_placeholder "msg91-api-key" "MSG91 API key for SMS (OTP + transactional)"
create_secret_placeholder "sendgrid-api-key" "SendGrid API key for transactional email"
create_secret_placeholder "razorpay-key-id" "Razorpay key ID for subscription payments"
create_secret_placeholder "razorpay-key-secret" "Razorpay key secret for subscription payments"
create_secret_placeholder "sarvam-ai-api-key" "Sarvam AI API key for Indian language NLP"
create_secret_placeholder "gst-portal-client-id" "GST Portal API client ID"
create_secret_placeholder "gst-portal-client-secret" "GST Portal API client secret"
create_secret_placeholder "nic-einvoice-credentials" "NIC e-invoice portal credentials JSON"
create_secret_placeholder "it-portal-credentials" "Income Tax Portal API credentials JSON"
create_secret_placeholder "whatsapp-business-token" "WhatsApp Business API token (feature-flagged OFF by default)"

# ── Phase 6A: Document AI ────────────────────────────────────────────────────
# google-document-ai-config: JSON blob containing processor IDs per document type.
# Format: {"form16":{"processor_id":"...","location":"asia-south1"},...}
# Obtain processor IDs from: GCP Console → Document AI → Processors.
# NOTE: Document AI processors must be created manually in the console — no CLI provisioning.
create_secret_placeholder "google-document-ai-config" "Document AI processor config JSON (processor IDs per document type — create processors in GCP Console first)"

# ── Phase 6B: GSTN / IRP / EWB API credentials ──────────────────────────────
# GSTN Sandbox credentials: apply at https://developer.gst.gov.in/
# Sandbox onboarding requires a GSTIN and can take 5-10 business days (see P6-FLAG-04).
# Production credentials require a signed agreement with GSTN.
create_secret_placeholder "gstn-client-id" "GSTN API client ID — apply at developer.gst.gov.in (sandbox onboarding: 5-10 business days)"
create_secret_placeholder "gstn-client-secret" "GSTN API client secret — obtained alongside gstn-client-id"

# gstn-credentials-template: placeholder for per-GSTIN credentials.
# Actual per-GSTIN credentials are managed by ops directly in Secret Manager,
# keyed as gstn-credentials-<GSTIN> (e.g. gstn-credentials-27AAAAA0000A1Z5).
# This template secret documents the expected JSON shape:
# {"gstin":"...","username":"...","password":"...","public_cert_pem":"..."}
create_secret_placeholder "gstn-credentials-template" "Template for per-GSTIN credentials (ops creates gstn-credentials-<GSTIN> secrets matching this shape)"

# IRP (Invoice Registration Portal) credentials — e-invoicing (B2B turnover > 5 Cr)
# Obtain from: https://einvoice1.gst.gov.in → API Access
create_secret_placeholder "irp-client-id" "Invoice Registration Portal (IRP) client ID for e-invoicing API"
create_secret_placeholder "irp-client-secret" "Invoice Registration Portal (IRP) client secret for e-invoicing API"

# EWB (e-Way Bill) credentials
# Obtain from: https://ewaybillgst.gov.in → API Registration
create_secret_placeholder "ewb-client-id" "e-Way Bill (EWB) API client ID"
create_secret_placeholder "ewb-client-secret" "e-Way Bill (EWB) API client secret"

# Phase 6E additions — Notification + Callback secrets
# msg91-sender-id: the approved DLT sender ID string (e.g., SNPACC) registered on MSG91.
# Required separately from api-key because DLT registration uses a different identifier.
create_secret_placeholder "msg91-sender-id" "MSG91 DLT-registered sender ID (e.g., SNPACC) — register at msg91.com/dlt before go-live"

# firebase-admin-json: Firebase Admin SDK service account JSON for FCM push dispatch.
# This is the same underlying service account as firebase-service-account-json but
# named separately so NotificationService can reference it independently from AuthService.
# Use the same downloaded JSON file, or create a dedicated service account for notifications.
create_secret_placeholder "firebase-admin-json" "Firebase Admin SDK service account JSON for FCM push dispatch in NotificationService (same format as firebase-service-account-json)"

# ── Phase 6C: Partner Bank credentials (Loan Hub) ───────────────────────────
#
# partner-bank-creds-template: documents the JSON shape that all per-bank credential
# secrets must follow. Operators create one secret per partner bank using the naming
# convention: partner-bank-creds-<bankId>
#
# Template JSON shape (store as compact single-line JSON in Secret Manager):
#   {
#     "bank_id":        "<string>  — short identifier, e.g. icici, hdfc",
#     "api_base_url":   "<string>  — partner bank API base URL",
#     "client_id":      "<string>  — OAuth2 / API client ID",
#     "client_secret":  "<string>  — OAuth2 / API client secret",
#     "webhook_secret": "<string>  — HMAC-SHA256 shared secret for disbursement webhooks"
#   }
#
# Pilot partner banks — operators must create the following secrets before go-live:
#   partner-bank-creds-icici   → ICICI Bank Business Banking API
#   partner-bank-creds-hdfc    → HDFC Bank SmartHub API
#
# To create a new bank secret (example for ICICI):
#   echo -n '{"bank_id":"icici","api_base_url":"...","client_id":"...","client_secret":"...","webhook_secret":"..."}' \
#       | gcloud secrets create partner-bank-creds-icici \
#           --data-file=- \
#           --replication-policy=user-managed \
#           --locations=asia-south1 \
#           --labels="app=snapaccount,type=partner-bank,phase=6c"
#
# LoanService reads ALL partner-bank-creds-* secrets at startup via the Secret Manager API
# (wildcard access granted — see IAM block in Step 10 below).
create_secret_placeholder "partner-bank-creds-template" "Template for per-bank credential secrets (operators create partner-bank-creds-<bankId> following this shape — see comment above)"

# Disbursement webhook shared secrets — one per partner bank.
# Per-bank webhook secrets are created by operators using the naming convention:
#   partner-bank-webhook-secret-<bankId>
# The <bankId> must match the {bankId} path segment in the webhook endpoint:
#   POST /loans/webhooks/{bankId}/disbursement
# HMAC-SHA256 signature is sent by the bank in the X-Bank-Signature header.
#
# Pilot bank webhook secrets — operators must create before go-live:
#   partner-bank-webhook-secret-icici
#   partner-bank-webhook-secret-hdfc
#
# Example (generate a strong random secret for each bank):
#   WEBHOOK_SECRET=$(openssl rand -base64 48)
#   echo -n "${WEBHOOK_SECRET}" \
#       | gcloud secrets create partner-bank-webhook-secret-icici \
#           --data-file=- \
#           --replication-policy=user-managed \
#           --locations=asia-south1 \
#           --labels="app=snapaccount,type=webhook-secret,phase=6c"
#
# See docs/devops/loan-disbursement-webhook.md for the full webhook contract.
create_secret_placeholder "partner-bank-webhook-secret-template" "Template for per-bank disbursement webhook shared secrets (operators create partner-bank-webhook-secret-<bankId> — see docs/devops/loan-disbursement-webhook.md)"

# ── Phase 6F: Redis connection string placeholder ────────────────────────────
# redis-connection-string (generic, environment-agnostic name for local dev / ad-hoc use).
# In cloud-run-services.sh, the environment-specific variants (-prod / -staging) are used.
# Format: <host>:<port>,abortConnect=false,connectTimeout=5000,syncTimeout=5000
# For local dev: use the Docker Compose Redis container → redis:6379,abortConnect=false
create_secret_placeholder "redis-connection-string" "Memorystore Redis connection string — StackExchange.Redis format: <host>:<port>,abortConnect=false (auto-populated by setup.sh Step 6 for prod/staging; override for other envs)"

log ""
log "IMPORTANT: Replace all 'REPLACE_ME' secrets with actual values via:"
log "  gcloud secrets versions add SECRET_NAME --data-file=-"
log "  (pipe the actual value as stdin)"

# ─────────────────────────────────────────────
# Step 9b: Feature Flags (via Secret Manager)
# ─────────────────────────────────────────────
# Feature flags are stored as Secret Manager secrets rather than env vars so they
# can be updated without redeploying Cloud Run services (new secret version = new flag value).
# GstService reads these at startup and caches with a 5-minute TTL.
#
# Naming convention: feature-flag-<service>-<feature-dot-path>
# Value convention:  "true" | "false" (plain string, no JSON)
section "Step 9b: Feature Flags"

create_feature_flag() {
    local flag_name="$1"
    local default_value="$2"
    local description="$3"
    if ! gcloud secrets describe "${flag_name}" &>/dev/null; then
        log "Creating feature flag: ${flag_name} = ${default_value}"
        echo -n "${default_value}" | gcloud secrets create "${flag_name}" \
            --data-file=- \
            --replication-policy=user-managed \
            --locations="${REGION}" \
            --labels="app=snapaccount,type=feature-flag,managed=ops"
        log "  → ${description}"
    else
        log "Feature flag ${flag_name} already exists — skipping (current value preserved)"
    fi
}

# Phase 6B: GST production API switch.
# Default: false (mock adapter active). Set to "true" only after GSTN sandbox
# credentials are verified and production agreement is signed.
# To enable: gcloud secrets versions add feature-flag-gst-production-apis-enabled --data-file=- <<< "true"
create_feature_flag \
    "feature-flag-gst-production-apis-enabled" \
    "false" \
    "gst.production-apis.enabled — set to true after GSTN sandbox onboarding complete (P6-FLAG-04)"

# ─────────────────────────────────────────────
# Step 10: Service Accounts (per microservice)
# ─────────────────────────────────────────────
section "Step 10: Service Accounts & IAM"

create_service_account() {
    local sa_name="$1"
    local description="$2"
    local sa_email="${sa_name}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
    if ! gcloud iam service-accounts describe "${sa_email}" &>/dev/null; then
        log "Creating SA: ${sa_email}"
        gcloud iam service-accounts create "${sa_name}" \
            --display-name="${description}" \
            --description="${description} — principle of least privilege"
    else
        log "SA ${sa_email} already exists"
    fi
}

create_service_account "auth-service-sa" "Auth Service"
create_service_account "document-service-sa" "Document Service"
create_service_account "accounting-service-sa" "Accounting Service"
create_service_account "gst-service-sa" "GST Service"
create_service_account "loan-service-sa" "Loan Service"
create_service_account "itr-service-sa" "ITR Service"
create_service_account "chat-service-sa" "Chat Service"
create_service_account "notification-service-sa" "Notification Service"
create_service_account "report-service-sa" "Report Service"
create_service_account "subscription-service-sa" "Subscription Service"
create_service_account "ai-service-sa" "AI Service"
create_service_account "migration-runner-sa" "Database Migration Runner"
create_service_account "github-ci-sa" "GitHub Actions CI/CD"
# Phase 6E: 12th microservice — CallbackService (per phase-6E-scope.md)
create_service_account "callback-service-sa" "Callback Service"
# Cloud Scheduler service account (provisions in pubsub-scheduler-recurring-jobs.sh,
# referenced here so it is created in the same SA provisioning pass)
create_service_account "cloud-scheduler-sa" "Cloud Scheduler — recurring jobs publisher"

# ── Composite service accounts (3-composite refactor) ───────────────────────
# After the 12→3 consolidation, Cloud Run services run as platform/finance/assist SAs.
# These are referenced by cloud-run-services.sh and the CD workflows.
# The old per-module SAs (auth-service-sa, gst-service-sa, etc.) are kept for backward
# compat / any remaining per-module Cloud SQL IAM bindings, but Cloud Run itself uses
# the composite SAs below.
create_service_account "platform-service-sa" "Platform composite (Auth + Subscription + Notification)"
create_service_account "finance-service-sa" "Finance composite (Document + Accounting + GST + Loan + ITR + Report)"
create_service_account "assist-service-sa" "Assist composite (Chat + AI + Callback)"
# DG-INFRA-01: API Gateway service account (YARP proxy — stateless, no DB/Pub/Sub needed)
create_service_account "api-gateway-sa" "API Gateway (YARP reverse proxy)"

# Grant minimal IAM roles per service account
grant_role() {
    local sa_email="$1"
    local role="$2"
    gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
        --member="serviceAccount:${sa_email}" \
        --role="${role}" \
        --condition=None 2>/dev/null || true
}

# Auth Service — needs Firebase + Secret Manager + Pub/Sub
SA="auth-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/secretmanager.secretAccessor"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/run.invoker"

# Document Service — needs Cloud Storage + Document AI + Pub/Sub + Secret Manager
# SEC-024: Reduced from objectAdmin to objectCreator + objectViewer (least privilege).
# objectAdmin was excessive — documents are written once and read; the service does not
# need to delete objects. If DPDP Act erasure requires hard-deletion of GCS objects,
# add roles/storage.objectAdmin back with a written justification in your change record.
SA="document-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/storage.objectCreator"
grant_role "${SA}" "roles/storage.objectViewer"
grant_role "${SA}" "roles/documentai.apiUser"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Accounting Service — needs Pub/Sub + Secret Manager
SA="accounting-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# GST Service — needs Pub/Sub + Secret Manager
SA="gst-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Loan Service — needs Pub/Sub + Secret Manager + GCS loan-packages write
# Phase 6C: LoanService generates signed loan documents (sanction letters, executed
# agreements, disbursement advices) and writes them to the loan-packages bucket.
# objectCreator is sufficient — the service never deletes objects directly.
# Phase 6C: LoanService reads ALL partner-bank-creds-* and partner-bank-webhook-secret-*
# secrets. The secretAccessor role is project-wide, which covers wildcard secret names.
# If you want finer-grained access, create an IAM condition:
#   --condition='resource.name.startsWith("projects/.../secrets/partner-bank-")'
SA="loan-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"
grant_role "${SA}" "roles/storage.objectCreator"
grant_role "${SA}" "roles/storage.objectViewer"

# ITR Service — needs Pub/Sub + Secret Manager
SA="itr-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Chat Service — needs Pub/Sub + Secret Manager + Redis (via VPC)
SA="chat-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Notification Service — needs Pub/Sub + Secret Manager (for FCM, MSG91, SendGrid keys)
# Phase 6C: also subscribes to snapaccount.loan.events (notification-service-loan-events-sub)
# for Loan Approved / Loan Disbursed / EMI Due push + SMS notifications.
SA="notification-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Report Service — needs Cloud Storage (write PDFs) + Pub/Sub + Secret Manager
# Phase 6C: ReportService generates QuestPDF loan summary reports and writes them to
# the loan-packages bucket (same objectCreator role already granted project-wide covers it).
SA="report-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/storage.objectCreator"
grant_role "${SA}" "roles/storage.objectViewer"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Subscription Service — needs Pub/Sub + Secret Manager (Razorpay keys)
SA="subscription-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# AI Service — needs Vertex AI + Pub/Sub + Secret Manager
SA="ai-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/aiplatform.user"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Callback Service — needs Pub/Sub + Secret Manager (Phase 6E)
# Emits callback.*.event domain events; no external service credentials required.
SA="callback-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# Cloud Scheduler SA — needs pubsub.topics.publish on recurring-jobs topic.
# Full binding applied in infra/pubsub-scheduler-recurring-jobs.sh (topic-level binding).
# Project-level role not required — keeping least privilege (topic-level IAM is sufficient).

# ── Composite SAs: IAM role grants (3-composite refactor + DG-INFRA-01) ─────
# Platform composite — same needs as Auth + Notification + Subscription combined
SA="platform-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/secretmanager.secretAccessor"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/run.invoker"

# Finance composite — same needs as Document + Accounting + GST + Loan + ITR + Report combined
SA="finance-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/secretmanager.secretAccessor"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/storage.objectCreator"
grant_role "${SA}" "roles/storage.objectViewer"
grant_role "${SA}" "roles/documentai.apiUser"
grant_role "${SA}" "roles/aiplatform.user"

# Assist composite — same needs as Chat + AI + Callback combined
SA="assist-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/secretmanager.secretAccessor"
grant_role "${SA}" "roles/pubsub.publisher"
grant_role "${SA}" "roles/pubsub.subscriber"
grant_role "${SA}" "roles/aiplatform.user"

# DG-INFRA-01: API Gateway SA — stateless YARP proxy; needs only Cloud Run invoker
# to call downstream composites (which are internal-and-cloud-load-balancing ingress).
SA="api-gateway-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/run.invoker"

# Migration Runner — needs Cloud SQL Client
SA="migration-runner-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/cloudsql.client"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# GitHub CI SA — needs Artifact Registry writer + Cloud Run developer
SA="github-ci-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
grant_role "${SA}" "roles/artifactregistry.writer"
grant_role "${SA}" "roles/run.developer"
grant_role "${SA}" "roles/run.jobs.executor"
grant_role "${SA}" "roles/iam.serviceAccountUser"
grant_role "${SA}" "roles/secretmanager.secretAccessor"

# ─────────────────────────────────────────────
# Step 11: Workload Identity Federation (GitHub Actions OIDC)
# ─────────────────────────────────────────────
section "Step 11: Workload Identity Federation for GitHub Actions"

POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-actions-provider"
POOL_ID="projects/${GCP_PROJECT_ID}/locations/global/workloadIdentityPools/${POOL_NAME}"

# Create the pool
if ! gcloud iam workload-identity-pools describe "${POOL_NAME}" \
        --location=global &>/dev/null; then
    log "Creating Workload Identity Pool..."
    gcloud iam workload-identity-pools create "${POOL_NAME}" \
        --location=global \
        --description="GitHub Actions OIDC pool for SnapAccount" \
        --display-name="GitHub Actions Pool"
else
    log "Pool ${POOL_NAME} already exists"
fi

# Get the pool's full resource name
WI_POOL_RESOURCE=$(gcloud iam workload-identity-pools describe "${POOL_NAME}" \
    --location=global \
    --format="value(name)")

# Create the OIDC provider
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" \
        --workload-identity-pool="${POOL_NAME}" \
        --location=global &>/dev/null; then
    log "Creating OIDC provider for GitHub Actions..."
    gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
        --workload-identity-pool="${POOL_NAME}" \
        --location=global \
        --issuer-uri="https://token.actions.githubusercontent.com" \
        --allowed-audiences="https://iam.googleapis.com/${WI_POOL_RESOURCE}/providers/${PROVIDER_NAME}" \
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
        --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}' && assertion.repository == '${GITHUB_ORG}/${GITHUB_REPO}'"
else
    log "Provider ${PROVIDER_NAME} already exists"
fi

# Bind GitHub CI SA to the Workload Identity Pool
CI_SA="github-ci-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
log "Binding ${CI_SA} to Workload Identity Pool..."
gcloud iam service-accounts add-iam-policy-binding "${CI_SA}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${WI_POOL_RESOURCE}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"

# Print the provider resource name (needed in GitHub Actions vars)
WI_PROVIDER_RESOURCE=$(gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" \
    --workload-identity-pool="${POOL_NAME}" \
    --location=global \
    --format="value(name)")

echo ""
log "═══════ GitHub Actions Configuration ═══════"
log "Set these as GitHub Actions Variables (not secrets):"
log "  GCP_PROJECT_ID          = ${GCP_PROJECT_ID}"
log "  GCP_WORKLOAD_IDENTITY_PROVIDER = ${WI_PROVIDER_RESOURCE}"
log "  GCP_CI_SERVICE_ACCOUNT  = ${CI_SA}"
log "  GCP_CD_SERVICE_ACCOUNT  = ${CI_SA}"
log "  FIREBASE_PROJECT_ID     = <your-firebase-project-id>"
log "  FIREBASE_AUTH_DOMAIN    = <your-firebase-project>.firebaseapp.com"
log "════════════════════════════════════════════"

# ─────────────────────────────────────────────
# Step 12: Cloud Monitoring alert policies
# ─────────────────────────────────────────────
section "Step 12: Cloud Monitoring — Notification Channel & Alerts"

log "Creating notification channel (email) — update email address as needed..."
gcloud alpha monitoring channels create \
    --display-name="SnapAccount Alerts" \
    --type=email \
    --channel-labels="email_address=devops@snapaccount.in" 2>/dev/null || \
    log "Notification channel setup requires gcloud alpha — configure manually in console"

log ""
log "══════════════════════════════════════════════"
log " GCP Infrastructure Setup COMPLETE"
log "══════════════════════════════════════════════"
log ""
log "Next steps:"
log "  1. Replace all 'REPLACE_ME' secrets in Secret Manager"
log "  2. Set GitHub Actions Variables (see above)"
log "  3. Run: bash infra/cloud-run-services.sh"
log "  4. See infra/README.md for full step-by-step guide"
log ""
