---
name: dg-infra-gaps-2026-06-28
description: DG-INFRA-01/02/03 gap fixes implemented 2026-06-28 — gateway build path, DPDP erasure Pub/Sub, GST/ITR recurring-job subs
metadata:
  type: project
---

# DG-INFRA gap fixes (2026-06-28, branch feature/repository-refactor)

## DG-INFRA-01: API Gateway production build + deploy path

**What:** Gateway (YARP :5000) was never containerized or deployed — only lived in Aspire local dev.

**Files changed:**
- `backend/Dockerfile.gateway` — NEW; publishes `Services/Gateway/Gateway.csproj` with same non-root `appuser` (UID 10001) pattern as Dockerfile.
- `docker-compose.yml` — Added `api-gateway` service at port 5000, depends on all 3 composites healthy; updated `admin-panel` VITE_API_BASE_URL default from :5201 → :5000; updated admin-panel depends_on to api-gateway.
- `.github/workflows/cd-production.yml` — Added `build-push-gateway` job; `deploy-gateway-production` job (min-instances=1, memory=256Mi, ingress=all, no DB/Redis secrets); approval-gate and post-deploy-verify now include gateway.
- `.github/workflows/cd-staging.yml` — Added `build-push-gateway` and `deploy-gateway-staging` (min-instances=0 for cost); notify-staging depends on gateway deploy.
- `infra/cloud-run-services.sh` — Added API Gateway section before admin-panel; YARP cluster env vars set to internal Cloud Run service DNS; added `api-gateway` to SERVICES summary list.
- `infra/setup.sh` — Added `api-gateway-sa` service account with `roles/run.invoker`; added composite SAs (`platform-service-sa`, `finance-service-sa`, `assist-service-sa`) with IAM roles.

**Gateway Cloud Run config:** port=8080, min=1 (prod) / 0 (staging), max=5/2, memory=256Mi, ingress=all, no-allow-unauthenticated, stateless (no secrets needed). YARP upstreams via ReverseProxy__Clusters__*__Destinations__*__Address env vars.

**Why:** DG-INFRA-01 — clients (.env.example) pointed at :5000 but gateway image was never built, pushed, or deployed. Auth/rate-limit/CORS at the gateway was silently bypassed in prod topology.

## DG-INFRA-02: DPDP account-deletion Pub/Sub topic + subscriptions

**What:** `account-deletion-events` topic and 7 subscriber subscriptions were never provisioned.

**File changed:** `infra/setup.sh`
- Added `account-deletion-events` to PUBSUB_TOPICS array (with dead-letter auto-created by loop).
- Added 7 `create_subscription "account-deletion-events" "<name>" 300` calls after existing subs block.

**Exact subscription names (verified against backend source 2026-06-28):**
- `loan-service-account-deletion-sub` — Finance.Loan
- `gst-service-account-deletion-sub` — Finance.Gst
- `itr-service-account-deletion-sub` — Finance.Itr
- `notification-service-account-deletion-sub` — Platform.Notification (const Subscription, not DefaultSubscription)
- `subscription-service-account-deletion-sub` — Platform.Subscription
- `chat-service-account-deletion-sub` — Assist.Chat
- `callback-service-account-deletion-sub` — Assist.Callback

ack_deadline=300s (DPDP erasure may touch multiple DB rows). Dead-letter after 5 attempts.

**Why:** DPDP Act 2023 Right-to-Erasure — subscribers call SubscriberClient.CreateAsync, catch "not found", and self-disable. Erasure cascade silently never ran in prod.

## DG-INFRA-03: GST/ITR recurring-job subscriptions

**What:** `gst-service-recurring-jobs-sub` and `itr-service-recurring-jobs-sub` on `snapaccount.recurring-jobs.due` were never provisioned.

**File changed:** `infra/pubsub-scheduler-recurring-jobs.sh`
- Added idempotent blocks for both subscriptions (ack_deadline=600, max-delivery-attempts=5).
- Added IAM `roles/pubsub.subscriber` binding for Pub/Sub SA on both new subs.
- Updated summary block to document new subscriptions.

**Subscription → backend consumer:**
- `gst-service-recurring-jobs-sub` → `Finance.Infrastructure.Gst.Messaging.GstRecurringJobsSubscriber` (handles `GST_DEADLINE_CHECK`)
- `itr-service-recurring-jobs-sub` → `Finance.Infrastructure.Itr.Messaging.ItrRecurringJobsSubscriber` (handles `ITR_DEADLINE_REMINDERS`, `ITR_REFUND_POLLING`)

**Design note:** NotificationService.RecurringJobsSubscriber ALSO handles these job_types but dispatches UserId=Guid.Empty (fails `NotEmpty` validator → no notification delivered). Finance subscribers do the per-org detail work. Both can fire via Pub/Sub fan-out — not a problem (complementary). Decision on removing the dual-dispatch is owned by backend-agent.

**Why:** Without these subs, Finance subscribers self-disabled. Per-org GST deadline detection and ITR deadline reminders never ran in prod, only the broken Guid.Empty broadcast path.

## Verification

All shell scripts passed `bash -n`; all YAML files parsed by `python3 yaml.safe_load`; `docker compose config` exited cleanly (only pre-existing env-var warnings + obsolete `version` attr). Dockerfile.gateway passed `docker buildx build --check` with same `UndefinedVar $PORT` warning as the original Dockerfile (intentional runtime expansion pattern).
