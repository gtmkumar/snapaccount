#!/usr/bin/env bash
# SnapAccount — Deploy all 11 Cloud Run services
# Run after infra/setup.sh has been executed.
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod
#   export ENVIRONMENT=production    # or: staging
#   export IMAGE_TAG=latest          # or specific git SHA tag
#   bash infra/cloud-run-services.sh
#
# All secrets are read from GCP Secret Manager — zero hardcoded credentials.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGION="asia-south1"
ARTIFACT_REGISTRY="asia-south1-docker.pkg.dev"
REGISTRY_REPO="snapaccount/services"
VPC_CONNECTOR="snapaccount-vpc-connector"

# Naming suffix for staging
if [ "${ENVIRONMENT}" = "staging" ]; then
    NAME_SUFFIX="-staging"
    DB_SECRET="db-connection-string-staging"
    REDIS_SECRET="redis-connection-string-staging"
    MIN_DEFAULT=0
    MAX_DEFAULT=3
    CPU_DEFAULT="1"
    MEMORY_DEFAULT="512Mi"
else
    NAME_SUFFIX=""
    DB_SECRET="db-connection-string-prod"
    REDIS_SECRET="redis-connection-string-prod"
    MIN_DEFAULT=1
    MAX_DEFAULT=10
    CPU_DEFAULT="1"
    MEMORY_DEFAULT="512Mi"
fi

log() { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "─── $* ───"; }

image_uri() {
    local service="$1"
    echo "${ARTIFACT_REGISTRY}/${GCP_PROJECT_ID}/${REGISTRY_REPO}/${service}:${IMAGE_TAG}"
}

deploy_service() {
    local cloud_run_name="$1"
    local sa_name="$2"
    local min_instances="${3:-$MIN_DEFAULT}"
    local max_instances="${4:-$MAX_DEFAULT}"
    local extra_secrets="${5:-}"
    local extra_env="${6:-}"
    local ingress="${7:-internal-and-cloud-load-balancing}"
    local allow_unauthenticated="${8:-false}"
    local cpu="${9:-$CPU_DEFAULT}"
    local memory="${10:-$MEMORY_DEFAULT}"

    local service_name="${cloud_run_name}${NAME_SUFFIX}"
    local sa_email="${sa_name}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
    local image
    image=$(image_uri "${cloud_run_name}")

    log "Deploying ${service_name}..."

    # Base secrets for all services
    local secrets="ASPNETCORE_DB_CONNECTION=${DB_SECRET}:latest,ASPNETCORE_REDIS_CONNECTION=${REDIS_SECRET}:latest"
    if [ -n "${extra_secrets}" ]; then
        secrets="${secrets},${extra_secrets}"
    fi

    # Base env vars
    local env_vars="ASPNETCORE_ENVIRONMENT=$([ "${ENVIRONMENT}" = "production" ] && echo Production || echo Staging)"
    env_vars="${env_vars},ASPNETCORE_URLS=http://+:8080"
    env_vars="${env_vars},GCP_PROJECT_ID=${GCP_PROJECT_ID}"
    env_vars="${env_vars},GCP_REGION=${REGION}"
    if [ -n "${extra_env}" ]; then
        env_vars="${env_vars},${extra_env}"
    fi

    local unauthenticated_flag
    if [ "${allow_unauthenticated}" = "true" ]; then
        unauthenticated_flag="--allow-unauthenticated"
    else
        unauthenticated_flag="--no-allow-unauthenticated"
    fi

    gcloud run deploy "${service_name}" \
        --image="${image}" \
        --region="${REGION}" \
        --service-account="${sa_email}" \
        --platform=managed \
        --port=8080 \
        --min-instances="${min_instances}" \
        --max-instances="${max_instances}" \
        --concurrency=80 \
        --cpu="${cpu}" \
        --memory="${memory}" \
        --cpu-throttling \
        --vpc-connector="${VPC_CONNECTOR}" \
        --vpc-egress=private-ranges-only \
        --ingress="${ingress}" \
        ${unauthenticated_flag} \
        --set-secrets="${secrets}" \
        --set-env-vars="${env_vars}" \
        --update-labels="environment=${ENVIRONMENT},app=snapaccount" \
        --timeout=300 \
        --quiet

    log "  Deployed: ${service_name}"
}

# ─────────────────────────────────────────────
# Auth Service
# ─────────────────────────────────────────────
section "Auth Service"
deploy_service \
    "auth-service" \
    "auth-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \
    "FIREBASE_CREDENTIALS_JSON=firebase-service-account-json:latest,MSG91_API_KEY=msg91-api-key:latest,JWT_SECRET_KEY=jwt-secret-key:latest" \
    "SERVICE_NAME=AuthService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Document Service
# ─────────────────────────────────────────────
section "Document Service"
deploy_service \
    "document-service" \
    "document-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \
    "FIREBASE_CREDENTIALS_JSON=firebase-service-account-json:latest,GCS_BUCKET_NAME=gcs-documents-bucket:latest" \
    "SERVICE_NAME=DocumentService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "1Gi"

# ─────────────────────────────────────────────
# Accounting Service
# ─────────────────────────────────────────────
section "Accounting Service"
deploy_service \
    "accounting-service" \
    "accounting-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \
    "" \
    "SERVICE_NAME=AccountingService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# GST Service
# Phase 6B: added GSTN sandbox credentials (gstn-client-id, gstn-client-secret),
#   per-GSTIN credentials template, IRP credentials (e-invoicing), EWB credentials,
#   and production-api feature flag. Mock adapter remains active until
#   feature-flag-gst-production-apis-enabled = "true" (P6-FLAG-04).
# ─────────────────────────────────────────────
section "GST Service"
deploy_service \
    "gst-service" \
    "gst-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \
    "GST_PORTAL_CLIENT_ID=gst-portal-client-id:latest,GST_PORTAL_CLIENT_SECRET=gst-portal-client-secret:latest,NIC_EINVOICE_CREDENTIALS=nic-einvoice-credentials:latest,GSTN_CLIENT_ID=gstn-client-id:latest,GSTN_CLIENT_SECRET=gstn-client-secret:latest,IRP_CLIENT_ID=irp-client-id:latest,IRP_CLIENT_SECRET=irp-client-secret:latest,EWB_CLIENT_ID=ewb-client-id:latest,EWB_CLIENT_SECRET=ewb-client-secret:latest,GST_PRODUCTION_APIS_ENABLED=feature-flag-gst-production-apis-enabled:latest" \
    "SERVICE_NAME=GstService,PUBSUB_TOPIC_PREFIX=snapaccount,GST_PORTAL_URL=https://api.gst.gov.in,NIC_EINVOICE_URL=https://einvoice1.gst.gov.in,EWB_URL=https://ewaybillgst.gov.in" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Loan Service
# Phase 6C: Partner bank credential secrets (partner-bank-creds-template acts as the
#   reference; actual per-bank secrets partner-bank-creds-{bankId} are created by ops
#   and read at runtime via Secret Manager API — not mounted as individual env vars).
#   Webhook shared secrets (partner-bank-webhook-secret-{bankId}) similarly read at runtime.
#   GCS loan-packages bucket: LoanService writes sanction letters + executed agreements.
#   Pub/Sub: publishes to snapaccount.loan.events (Loan Approved, Loan Disbursed events).
#   Memory: bumped to 1Gi — QuestPDF document generation is memory-intensive.
# ─────────────────────────────────────────────
section "Loan Service"
deploy_service \
    "loan-service" \
    "loan-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "GCS_LOAN_PACKAGES_BUCKET=gcs-loan-packages-bucket:latest,PARTNER_BANK_CREDS_TEMPLATE=partner-bank-creds-template:latest" \
    "SERVICE_NAME=LoanService,PUBSUB_TOPIC_PREFIX=snapaccount,LOAN_EVENTS_TOPIC=snapaccount.loan.events" \
    "internal-and-cloud-load-balancing" "false" "1" "1Gi"

# ─────────────────────────────────────────────
# ITR Service
# Phase 6D: added google-document-ai-config for Form 16 OCR extraction.
#   Document AI quota note: see docs/devops/document-ai-quota-itr.md.
#   Tax slab versioning: managed by ops via itr-tax-slab-rollover-runbook.md (April 1 each AY).
# ─────────────────────────────────────────────
section "ITR Service"
deploy_service \
    "itr-service" \
    "itr-service-sa" \
    "${MIN_DEFAULT}" "${MAX_DEFAULT}" \
    "IT_PORTAL_CREDENTIALS=it-portal-credentials:latest,GOOGLE_DOCUMENT_AI_CONFIG=google-document-ai-config:latest" \
    "SERVICE_NAME=ItrService,PUBSUB_TOPIC_PREFIX=snapaccount,IT_PORTAL_URL=https://efileapi.incometax.gov.in" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Chat Service (SignalR — sticky sessions + Redis backplane)
#
# Phase 6F changes:
#   --session-affinity  : Cloud Run cookie-based session affinity (AWSALB-equivalent
#                         _gcss cookie). Required so that WebSocket upgrade requests
#                         (GET / HTTP/1.1 Upgrade: websocket) always land on the same
#                         instance that owns the SignalR connection. Without this, the
#                         negotiate handshake and subsequent WS frames may hit different
#                         instances, breaking the connection.
#
#   min-instances=1     : SignalR hub connections are long-lived. Scale-to-zero would
#                         terminate all active connections. 1 warm instance keeps
#                         connections alive during low-traffic periods.
#
#   memory=1Gi          : Each connected SignalR client holds an in-memory connection
#                         object plus any buffered messages. 1Gi supports ~2,000
#                         concurrent connections before Redis backplane fan-out kicks in.
#
#   REDIS_CONNECTION_STRING: StackExchange.Redis connection string for the SignalR
#                         backplane (Microsoft.AspNetCore.SignalR.StackExchangeRedis).
#                         Cross-instance fan-out for chat groups and typing indicators.
#                         Typing indicator presence stored in Redis with 30s TTL.
#
#   WebSocket support   : Cloud Run supports WebSocket upgrades natively on port 8080.
#                         No additional configuration needed — Cloud Run's HTTP/1.1
#                         upgrade headers (Connection: Upgrade, Upgrade: websocket) are
#                         passed through to the container. SignalR negotiates WS first,
#                         falls back to Server-Sent Events, then long-polling.
#
# Backend-agent handoff:
#   NuGet: Microsoft.AspNetCore.SignalR.StackExchangeRedis
#   Wire up: services.AddSignalR().AddStackExchangeRedis(
#                Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING"));
#   Sticky sessions: already enforced at Cloud Run level — app need not handle this.
#   Typing indicators / presence: store in Redis key `presence:{userId}` with 30s TTL
#                                 (EXPIRE command on each heartbeat from the client).
# ─────────────────────────────────────────────
section "Chat Service"

CHAT_SERVICE_NAME="chat-service${NAME_SUFFIX}"
CHAT_SA="chat-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
CHAT_IMAGE=$(image_uri "chat-service")
CHAT_MIN=1    # Must be ≥1 — SignalR connections die on scale-to-zero
CHAT_MAX="$([ "${ENVIRONMENT}" = "production" ] && echo 10 || echo 3)"
CHAT_SECRETS="ASPNETCORE_DB_CONNECTION=${DB_SECRET}:latest,ASPNETCORE_REDIS_CONNECTION=${REDIS_SECRET}:latest,REDIS_CONNECTION_STRING=${REDIS_SECRET}:latest"
CHAT_ENV="ASPNETCORE_ENVIRONMENT=$([ "${ENVIRONMENT}" = "production" ] && echo Production || echo Staging)"
CHAT_ENV="${CHAT_ENV},ASPNETCORE_URLS=http://+:8080"
CHAT_ENV="${CHAT_ENV},GCP_PROJECT_ID=${GCP_PROJECT_ID}"
CHAT_ENV="${CHAT_ENV},GCP_REGION=${REGION}"
CHAT_ENV="${CHAT_ENV},SERVICE_NAME=ChatService"
CHAT_ENV="${CHAT_ENV},PUBSUB_TOPIC_PREFIX=snapaccount"

log "Deploying ${CHAT_SERVICE_NAME} (SignalR with session affinity)..."
gcloud run deploy "${CHAT_SERVICE_NAME}" \
    --image="${CHAT_IMAGE}" \
    --region="${REGION}" \
    --service-account="${CHAT_SA}" \
    --platform=managed \
    --port=8080 \
    --min-instances="${CHAT_MIN}" \
    --max-instances="${CHAT_MAX}" \
    --concurrency=80 \
    --cpu=1 \
    --memory=1Gi \
    --cpu-throttling \
    --session-affinity \
    --vpc-connector="${VPC_CONNECTOR}" \
    --vpc-egress=private-ranges-only \
    --ingress=internal-and-cloud-load-balancing \
    --no-allow-unauthenticated \
    --set-secrets="${CHAT_SECRETS}" \
    --set-env-vars="${CHAT_ENV}" \
    --update-labels="environment=${ENVIRONMENT},app=snapaccount,signalr=enabled" \
    --timeout=300 \
    --quiet
log "  Deployed: ${CHAT_SERVICE_NAME} (session-affinity=ON, min-instances=1, memory=1Gi)"

# ─────────────────────────────────────────────
# Notification Service
# ─────────────────────────────────────────────
section "Notification Service"
deploy_service \
    "notification-service" \
    "notification-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "FIREBASE_CREDENTIALS_JSON=firebase-service-account-json:latest,FIREBASE_ADMIN_JSON=firebase-admin-json:latest,MSG91_API_KEY=msg91-api-key:latest,MSG91_SENDER_ID=msg91-sender-id:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,WHATSAPP_TOKEN=whatsapp-business-token:latest" \
    "SERVICE_NAME=NotificationService,PUBSUB_TOPIC_PREFIX=snapaccount,FEATURES_WHATSAPP_ENABLED=false" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Report Service
# Phase 6C: Added GCS_LOAN_PACKAGES_BUCKET secret — ReportService writes QuestPDF loan
#   summary reports (amortisation schedules, loan account statements) to the loan-packages
#   bucket in addition to the general documents bucket.
#   Memory: already 1Gi — appropriate for QuestPDF in-process rendering.
#   Fonts bundled in image: Inter (UI), Noto Sans Devanagari (Hindi), Noto Sans Bengali
#   (Bengali). See docs/devops/questpdf-font-bundling.md for embedding instructions.
# ─────────────────────────────────────────────
section "Report Service"
deploy_service \
    "report-service" \
    "report-service-sa" \
    "0" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 2)" \
    "GCS_BUCKET_NAME=gcs-documents-bucket:latest,GCS_LOAN_PACKAGES_BUCKET=gcs-loan-packages-bucket:latest" \
    "SERVICE_NAME=ReportService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "1Gi"

# ─────────────────────────────────────────────
# Subscription Service
# ─────────────────────────────────────────────
section "Subscription Service"
deploy_service \
    "subscription-service" \
    "subscription-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest" \
    "SERVICE_NAME=SubscriptionService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Callback Service (Phase 6E — 12th microservice)
# Handles callback request lifecycle: PENDING → SCHEDULED → IN_PROGRESS → COMPLETED.
# Emits domain events consumed by NotificationService (callback.*.event topic).
# Same scale settings as NotificationService — operational hours, not bursty.
# ─────────────────────────────────────────────
section "Callback Service"
deploy_service \
    "callback-service" \
    "callback-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "" \
    "SERVICE_NAME=CallbackService,PUBSUB_TOPIC_PREFIX=snapaccount" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# AI Service
# ─────────────────────────────────────────────
section "AI Service"
deploy_service \
    "ai-service" \
    "ai-service-sa" \
    "0" "${MAX_DEFAULT}" \
    "SARVAM_AI_API_KEY=sarvam-ai-api-key:latest" \
    "SERVICE_NAME=AiService,PUBSUB_TOPIC_PREFIX=snapaccount,VERTEX_AI_LOCATION=asia-south1,VERTEX_AI_MODEL_ID=gemini-1.5-pro" \
    "internal-and-cloud-load-balancing" "false" "1" "1Gi"

# ─────────────────────────────────────────────
# Admin Panel (public-facing — allow unauthenticated)
# ─────────────────────────────────────────────
section "Admin Panel (React)"

log "Deploying admin-panel${NAME_SUFFIX}..."
gcloud run deploy "admin-panel${NAME_SUFFIX}" \
    --image="$(image_uri "admin-panel")" \
    --region="${REGION}" \
    --platform=managed \
    --port=8080 \
    --min-instances="$([ "${ENVIRONMENT}" = "production" ] && echo 1 || echo 0)" \
    --max-instances="$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 2)" \
    --concurrency=100 \
    --cpu=1 \
    --memory=256Mi \
    --ingress=all \
    --allow-unauthenticated \
    --update-labels="environment=${ENVIRONMENT},app=snapaccount" \
    --timeout=30 \
    --quiet

log "admin-panel${NAME_SUFFIX} deployed"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Cloud Run Deployment COMPLETE"
echo " Environment: ${ENVIRONMENT}"
echo " Region: ${REGION}"
echo "═══════════════════════════════════════════════"
echo ""
echo "Deployed services:"
SERVICES=(auth-service document-service accounting-service gst-service loan-service itr-service chat-service notification-service report-service subscription-service ai-service callback-service admin-panel)
for svc in "${SERVICES[@]}"; do
    URL=$(gcloud run services describe "${svc}${NAME_SUFFIX}" \
        --region="${REGION}" \
        --format="value(status.url)" 2>/dev/null || echo "N/A")
    echo "  ${svc}${NAME_SUFFIX}: ${URL}"
done
echo ""
