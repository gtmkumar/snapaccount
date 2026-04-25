# SnapAccount — GCP Infrastructure Setup Guide

> For a developer starting from zero. Follow every step in order.
> Region: asia-south1 (Mumbai) — required for DPDP Act 2023 data localization.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| gcloud CLI | latest | https://cloud.google.com/sdk/docs/install |
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| git | any | system package manager |

```bash
# Verify gcloud
gcloud version

# Login
gcloud auth login
gcloud auth application-default login
```

---

## Step 1 — Prepare Environment Variables

Copy and fill in these values before running any scripts:

```bash
export GCP_PROJECT_ID=snapaccount-prod        # your GCP project ID (must be globally unique)
export GITHUB_ORG=your-github-org-or-username
export GITHUB_REPO=snapaccount
export BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX   # gcloud billing accounts list
```

For staging, use a separate project:

```bash
export GCP_PROJECT_ID=snapaccount-staging
```

---

## Step 2 — Run the Setup Script

```bash
bash infra/setup.sh
```

This script creates (idempotent — safe to re-run):
- GCP project + billing link
- All required APIs enabled
- VPC, subnet, Serverless VPC Access connector
- Artifact Registry (`services` repo, asia-south1)
- Cloud SQL PostgreSQL 17 instance (private IP, no public endpoint)
- Cloud Memorystore Redis (private, VPC-attached)
- Cloud Storage buckets with 7-year lifecycle policy
- All 10 Pub/Sub topics + subscriptions
- Secret Manager placeholders for all credentials
- 13 service accounts with minimal IAM roles
- Workload Identity Federation pool + OIDC provider for GitHub Actions

At the end the script prints the **GitHub Actions Variables** you need to set.

---

## Step 3 — Replace Secret Placeholders

After setup.sh, all secrets contain `REPLACE_ME`. Fill them with real values:

```bash
# Example: set the JWT secret key
openssl rand -base64 64 | gcloud secrets versions add jwt-secret-key --data-file=-

# Firebase service account JSON (download from Firebase Console → Project Settings → Service Accounts)
gcloud secrets versions add firebase-service-account-json --data-file=path/to/firebase-sa.json

# MSG91 API key
echo -n "YOUR_MSG91_KEY" | gcloud secrets versions add msg91-api-key --data-file=-

# SendGrid API key
echo -n "YOUR_SENDGRID_KEY" | gcloud secrets versions add sendgrid-api-key --data-file=-

# Razorpay (fill when you have an account — services will start without it using feature flags)
echo -n "rzp_live_XXXX" | gcloud secrets versions add razorpay-key-id --data-file=-
echo -n "YOUR_RAZORPAY_SECRET" | gcloud secrets versions add razorpay-key-secret --data-file=-

# Sarvam AI
echo -n "YOUR_SARVAM_KEY" | gcloud secrets versions add sarvam-ai-api-key --data-file=-
```

Secrets NOT needed at initial launch (feature-flagged off by default):
- `whatsapp-business-token` — enable when WhatsApp Business account is ready
- `gst-portal-client-id` / `gst-portal-client-secret` — needed for GST filing
- `nic-einvoice-credentials` — needed for e-invoicing
- `it-portal-credentials` — needed for ITR filing

---

## Step 4 — Set GitHub Actions Variables

In your GitHub repository: **Settings → Secrets and variables → Actions → Variables**

Add these **Variables** (not secrets — they are not sensitive):

| Variable | Value |
|----------|-------|
| `GCP_PROJECT_ID` | `snapaccount-prod` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed by setup.sh |
| `GCP_CI_SERVICE_ACCOUNT` | `github-ci-sa@snapaccount-prod.iam.gserviceaccount.com` |
| `GCP_CD_SERVICE_ACCOUNT` | `github-ci-sa@snapaccount-prod.iam.gserviceaccount.com` |
| `FIREBASE_PROJECT_ID` | your Firebase project ID |
| `FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |

---

## Step 5 — Initialize Database Schemas

Connect to the Cloud SQL instance and run the schema init script:

```bash
# Option 1: via Cloud SQL Auth Proxy (recommended)
cloud-sql-proxy --port=5432 "${GCP_PROJECT_ID}:${REGION}:snapaccount-postgres" &
PGPASSWORD=<password-from-secret-manager> psql -h 127.0.0.1 -U snapaccount-app -d snapaccount \
    -f database/init/00_extensions.sql

# Option 2: via Cloud Run Jobs (after backend is built)
gcloud run jobs execute snapaccount-db-migrate-staging \
    --region=asia-south1 --wait
```

---

## Step 6 — Build and Push Images

First push to trigger the full CI/CD pipeline:

```bash
git checkout develop
git push origin develop    # triggers cd-staging.yml
```

Or deploy manually:

```bash
export ENVIRONMENT=staging
export IMAGE_TAG=latest
bash infra/cloud-run-services.sh
```

---

## Step 7 — Verify Deployment

```bash
# Check all Cloud Run services are healthy
gcloud run services list --region=asia-south1

# Tail logs for a specific service
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=auth-service-staging" \
    --format="value(textPayload)"
```

---

## GitHub Actions Workflow Summary

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR to main/develop | Build + test all .NET services, lint React, migrations dry-run |
| `cd-staging.yml` | Push to develop | Build images → push to Artifact Registry → deploy staging |
| `cd-production.yml` | Push to main | Build images → **manual approval gate** → deploy production |
| `db-migrate.yml` | Manual / called by CD | Run EF Core migrations as Cloud Run Job |

---

## Local Development

```bash
# Copy env template
cp .env.example .env
# Edit .env with your local values

# Start all services
docker compose up -d

# View logs
docker compose logs -f auth-service

# Hot reload is enabled via docker-compose.override.yml
# Just edit backend source files — dotnet watch will recompile automatically
```

Local service ports:

| Service | Port |
|---------|------|
| Auth | http://localhost:5001 |
| Document | http://localhost:5002 |
| Accounting | http://localhost:5003 |
| GST | http://localhost:5004 |
| Loan | http://localhost:5005 |
| ITR | http://localhost:5006 |
| Chat | http://localhost:5007 |
| Notification | http://localhost:5008 |
| Report | http://localhost:5009 |
| Subscription | http://localhost:5010 |
| AI | http://localhost:5011 |
| Admin Panel | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## Cost Estimates (Zero-Budget Phase)

| Resource | SKU | Monthly Cost (INR approx.) |
|----------|-----|---------------------------|
| Cloud Run (11 services, min=0, free tier) | 2M req/mo free | ~0 for low traffic |
| Cloud SQL db-f1-micro | $7.67/mo | ~630 |
| Cloud Memorystore Redis 1GB Basic | $0.049/GB/hr | ~3,200 |
| Artifact Registry 10GB | $0.10/GB/mo | ~83 |
| Cloud Storage 50GB | $0.020/GB/mo | ~83 |
| Pub/Sub 10GB/mo | First 10GB free | ~0 |
| Secret Manager 6 versions | $0.06/version | ~30 |
| **Total estimate** | | **~4,000 INR/mo** |

Notes:
- Cloud Run has a generous free tier (2M requests/month). Scale to paid only when traffic grows.
- Upgrade Cloud SQL to `db-g1-small` (~$25/mo) before going to production with real users.
- Redis can be removed in early phase by using in-memory backplane for SignalR.

---

## Security Notes

- Zero hardcoded credentials — all secrets injected via Secret Manager at runtime.
- All Cloud Run services run in a private VPC (no direct public internet access except admin panel).
- Service-to-service calls use internal VPC — not routed through internet.
- Each service has its own GCP Service Account with only the permissions it needs.
- Firebase Auth tokens validated at the API gateway level.
- DPDP Act compliance: all data stored in asia-south1 (Mumbai), right to erasure implemented.
- Cloud SQL has no public IP — only accessible via VPC or Cloud SQL Auth Proxy.
