#!/usr/bin/env bash
# SnapAccount — Deploy all 3 Cloud Run composite services
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
# Platform Service (Auth + Subscription + Notification)
# ─────────────────────────────────────────────
section "Platform Service"
deploy_service \
    "platform-service" \
    "platform-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "FIREBASE_CREDENTIALS_JSON=firebase-service-account-json:latest,FIREBASE_ADMIN_JSON=firebase-admin-json:latest,MSG91_API_KEY=msg91-api-key:latest,MSG91_SENDER_ID=msg91-sender-id:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest,JWT_SECRET_KEY=jwt-secret-key:latest" \
    "COMPOSITE_NAME=Platform,PUBSUB_TOPIC_PREFIX=snapaccount,FEATURES_WHATSAPP_ENABLED=false" \
    "internal-and-cloud-load-balancing" "false" "1" "512Mi"

# ─────────────────────────────────────────────
# Finance Service (Document + Accounting + GST + Loan + ITR + Report)
# ─────────────────────────────────────────────
section "Finance Service"
deploy_service \
    "finance-service" \
    "finance-service-sa" \
    "${MIN_DEFAULT}" "$([ "${ENVIRONMENT}" = "production" ] && echo 5 || echo 3)" \
    "FIREBASE_CREDENTIALS_JSON=firebase-service-account-json:latest,GCS_BUCKET_NAME=gcs-documents-bucket:latest,GCS_LOAN_PACKAGES_BUCKET=gcs-loan-packages-bucket:latest,GST_PORTAL_CLIENT_ID=gst-portal-client-id:latest,GST_PORTAL_CLIENT_SECRET=gst-portal-client-secret:latest,NIC_EINVOICE_CREDENTIALS=nic-einvoice-credentials:latest,GSTN_CLIENT_ID=gstn-client-id:latest,GSTN_CLIENT_SECRET=gstn-client-secret:latest,IRP_CLIENT_ID=irp-client-id:latest,IRP_CLIENT_SECRET=irp-client-secret:latest,EWB_CLIENT_ID=ewb-client-id:latest,EWB_CLIENT_SECRET=ewb-client-secret:latest,GST_PRODUCTION_APIS_ENABLED=feature-flag-gst-production-apis-enabled:latest,IT_PORTAL_CREDENTIALS=it-portal-credentials:latest,GOOGLE_DOCUMENT_AI_CONFIG=google-document-ai-config:latest" \
    "COMPOSITE_NAME=Finance,PUBSUB_TOPIC_PREFIX=snapaccount,GST_PORTAL_URL=https://api.gst.gov.in,NIC_EINVOICE_URL=https://einvoice1.gst.gov.in,EWB_URL=https://ewaybillgst.gov.in,IT_PORTAL_URL=https://efileapi.incometax.gov.in,LOAN_EVENTS_TOPIC=snapaccount.loan.events,ServiceUrls__GstService=https://finance-service,ServiceUrls__AccountingService=https://finance-service" \
    "internal-and-cloud-load-balancing" "false" "1" "1Gi"

# ─────────────────────────────────────────────
# Assist Service (Chat + AI + Callback — SignalR session affinity)
# ─────────────────────────────────────────────
section "Assist Service"

ASSIST_SERVICE_NAME="assist-service${NAME_SUFFIX}"
ASSIST_SA="assist-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
ASSIST_IMAGE=$(image_uri "assist-service")
ASSIST_MIN=1
ASSIST_MAX="$([ "${ENVIRONMENT}" = "production" ] && echo 10 || echo 3)"
ASSIST_SECRETS="ASPNETCORE_DB_CONNECTION=${DB_SECRET}:latest,ASPNETCORE_REDIS_CONNECTION=${REDIS_SECRET}:latest,REDIS_CONNECTION_STRING=${REDIS_SECRET}:latest,SARVAM_AI_API_KEY=sarvam-ai-api-key:latest"
ASSIST_ENV="ASPNETCORE_ENVIRONMENT=$([ "${ENVIRONMENT}" = "production" ] && echo Production || echo Staging)"
ASSIST_ENV="${ASSIST_ENV},ASPNETCORE_URLS=http://+:8080"
ASSIST_ENV="${ASSIST_ENV},GCP_PROJECT_ID=${GCP_PROJECT_ID}"
ASSIST_ENV="${ASSIST_ENV},GCP_REGION=${REGION}"
ASSIST_ENV="${ASSIST_ENV},COMPOSITE_NAME=Assist"
ASSIST_ENV="${ASSIST_ENV},PUBSUB_TOPIC_PREFIX=snapaccount"
ASSIST_ENV="${ASSIST_ENV},VERTEX_AI_LOCATION=asia-south1,VERTEX_AI_MODEL_ID=gemini-1.5-pro"

log "Deploying ${ASSIST_SERVICE_NAME} (SignalR with session affinity)..."
gcloud run deploy "${ASSIST_SERVICE_NAME}" \
    --image="${ASSIST_IMAGE}" \
    --region="${REGION}" \
    --service-account="${ASSIST_SA}" \
    --platform=managed \
    --port=8080 \
    --min-instances="${ASSIST_MIN}" \
    --max-instances="${ASSIST_MAX}" \
    --concurrency=80 \
    --cpu=1 \
    --memory=1Gi \
    --cpu-throttling \
    --session-affinity \
    --vpc-connector="${VPC_CONNECTOR}" \
    --vpc-egress=private-ranges-only \
    --ingress=internal-and-cloud-load-balancing \
    --no-allow-unauthenticated \
    --set-secrets="${ASSIST_SECRETS}" \
    --set-env-vars="${ASSIST_ENV}" \
    --update-labels="environment=${ENVIRONMENT},app=snapaccount,signalr=enabled" \
    --timeout=300 \
    --quiet
log "  Deployed: ${ASSIST_SERVICE_NAME} (session-affinity=ON, min-instances=1, memory=1Gi)"

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
SERVICES=(platform-service finance-service assist-service admin-panel)
for svc in "${SERVICES[@]}"; do
    URL=$(gcloud run services describe "${svc}${NAME_SUFFIX}" \
        --region="${REGION}" \
        --format="value(status.url)" 2>/dev/null || echo "N/A")
    echo "  ${svc}${NAME_SUFFIX}: ${URL}"
done
echo ""
