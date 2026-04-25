#!/usr/bin/env bash
# SnapAccount — Admin Panel Cloud Run Deployment
#
# Deploys the React admin panel to Cloud Run and applies Cloud Armor
# IP allowlisting (SEC-017).
#
# Usage:
#   export GCP_PROJECT_ID=snapaccount-prod
#   export ENVIRONMENT=production    # or: staging
#   export IMAGE_TAG=latest          # or specific git SHA tag
#   export OFFICE_IP=203.0.113.10    # your office egress IP (required for allowlist)
#   export VPN_IP=198.51.100.20      # your VPN egress IP (required for allowlist)
#   bash infra/scripts/deploy-admin.sh
#
# Prerequisites:
#   - infra/setup.sh must have been run (APIs enabled, Artifact Registry ready)
#   - Cloud Armor API enabled: cloudarmor.googleapis.com
#   - compute.googleapis.com enabled (Cloud Armor uses Compute Engine backend services)
#
# IMPORTANT: Cloud Armor attaches to a Google Cloud Load Balancer, NOT directly to
# Cloud Run. The recommended topology is:
#   Internet → Cloud Armor Security Policy → HTTPS LB → Cloud Run (admin-panel)
# If the admin panel Cloud Run service is accessed directly via its *.run.app URL
# (without a load balancer in front), Cloud Armor will NOT be enforced.
# See docs/devops/admin-panel-security.md for the full setup guide.

set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGION="asia-south1"
ARTIFACT_REGISTRY="asia-south1-docker.pkg.dev"
REGISTRY_REPO="snapaccount/services"

# SEC-017: Office/VPN IPs for Cloud Armor allowlist.
# These must be set before running in production. Use CIDR notation, e.g. 203.0.113.10/32
OFFICE_IP="${OFFICE_IP:-}"
VPN_IP="${VPN_IP:-}"

NAME_SUFFIX=""
if [ "${ENVIRONMENT}" = "staging" ]; then
    NAME_SUFFIX="-staging"
fi

SERVICE_NAME="admin-panel${NAME_SUFFIX}"
IMAGE_URI="${ARTIFACT_REGISTRY}/${GCP_PROJECT_ID}/${REGISTRY_REPO}/admin-panel:${IMAGE_TAG}"
ARMOR_POLICY="admin-panel-allowlist${NAME_SUFFIX}"

log() { echo "[$(date +%H:%M:%S)] $*"; }
section() { echo ""; echo "─── $* ───"; }

# ─────────────────────────────────────────────
# Step 1: Deploy admin panel to Cloud Run
# ─────────────────────────────────────────────
section "Deploying admin panel to Cloud Run"

log "Image: ${IMAGE_URI}"

gcloud run deploy "${SERVICE_NAME}" \
    --image="${IMAGE_URI}" \
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

log "Cloud Run service ${SERVICE_NAME} deployed."
log "NOTE: Authentication is enforced by Firebase Auth at the application layer."

# ─────────────────────────────────────────────
# Step 2: Cloud Armor IP allowlist (SEC-017)
# ─────────────────────────────────────────────
# Cloud Armor requires a Cloud Load Balancer in front of Cloud Run.
# If you are serving admin-panel directly via *.run.app, skip this step
# and instead configure Cloud IAP (see docs/devops/admin-panel-security.md).
#
# To enable Cloud Armor:
#   1. Create a Serverless NEG pointing to the admin-panel Cloud Run service
#   2. Create an HTTPS Load Balancer with that NEG as the backend
#   3. Attach the Cloud Armor security policy to the backend service
#   4. Point your admin DNS record (admin.snapaccount.in) to the LB IP
#
# The commands below create the security policy and its rules.
# Attaching to the LB backend is a manual step documented in admin-panel-security.md.

section "Cloud Armor Security Policy (SEC-017)"

if [ -z "${OFFICE_IP}" ] || [ -z "${VPN_IP}" ]; then
    log "WARNING: OFFICE_IP and/or VPN_IP not set."
    log "  Cloud Armor allowlist will be created with PLACEHOLDER IPs."
    log "  Update the policy rules before directing production traffic through the LB."
    OFFICE_IP="${OFFICE_IP:-0.0.0.0/32}"  # placeholder — deny all until real IP is set
    VPN_IP="${VPN_IP:-0.0.0.0/32}"
fi

# Create the security policy if it does not exist
if ! gcloud compute security-policies describe "${ARMOR_POLICY}" \
        --project="${GCP_PROJECT_ID}" &>/dev/null; then
    log "Creating Cloud Armor security policy: ${ARMOR_POLICY}..."
    gcloud compute security-policies create "${ARMOR_POLICY}" \
        --description="IP allowlist for SnapAccount admin panel (SEC-017)" \
        --project="${GCP_PROJECT_ID}"

    # Rule 1000: allow office IP
    log "Adding rule: allow office IP ${OFFICE_IP}"
    gcloud compute security-policies rules create 1000 \
        --security-policy="${ARMOR_POLICY}" \
        --src-ip-ranges="${OFFICE_IP}" \
        --action=allow \
        --description="Allow office egress IP" \
        --project="${GCP_PROJECT_ID}"

    # Rule 1001: allow VPN IP
    log "Adding rule: allow VPN IP ${VPN_IP}"
    gcloud compute security-policies rules create 1001 \
        --security-policy="${ARMOR_POLICY}" \
        --src-ip-ranges="${VPN_IP}" \
        --action=allow \
        --description="Allow VPN egress IP" \
        --project="${GCP_PROJECT_ID}"

    # Default rule (priority 2147483647): deny all other traffic
    # The default rule already exists in Cloud Armor with action=allow.
    # Override it to deny.
    log "Setting default rule to DENY (all non-allowlisted IPs blocked)"
    gcloud compute security-policies rules update 2147483647 \
        --security-policy="${ARMOR_POLICY}" \
        --action=deny-403 \
        --project="${GCP_PROJECT_ID}"

    log "Cloud Armor policy ${ARMOR_POLICY} created."
else
    log "Cloud Armor policy ${ARMOR_POLICY} already exists — updating IP rules..."
    gcloud compute security-policies rules update 1000 \
        --security-policy="${ARMOR_POLICY}" \
        --src-ip-ranges="${OFFICE_IP}" \
        --project="${GCP_PROJECT_ID}"
    gcloud compute security-policies rules update 1001 \
        --security-policy="${ARMOR_POLICY}" \
        --src-ip-ranges="${VPN_IP}" \
        --project="${GCP_PROJECT_ID}"
    log "IP rules updated."
fi

log ""
log "MANUAL STEP REQUIRED — Attach Cloud Armor policy to the LB backend:"
log "  gcloud compute backend-services update BACKEND_SERVICE_NAME \\"
log "    --security-policy=${ARMOR_POLICY} \\"
log "    --global \\"
log "    --project=${GCP_PROJECT_ID}"
log ""
log "See docs/devops/admin-panel-security.md for the full load balancer setup guide."
log ""
log "═══════════════════════════════════════════════"
log " Admin Panel Deployment COMPLETE"
log " Service: ${SERVICE_NAME}"
log " Region:  ${REGION}"
log "═══════════════════════════════════════════════"
