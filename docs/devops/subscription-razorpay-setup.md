# Razorpay Production Activation Runbook — SubscriptionService

**Phase:** 7 (Wave 2 — NEW-D05/D06/W2-004)
**Owner:** devops-engineer (infra) + team lead (Razorpay dashboard access)
**Last updated:** 2026-06-11
**References:**
- `backend/Services/PlatformService/Platform.Infrastructure/Subscription/DependencyInjection.cs`
- `backend/Services/PlatformService/Platform.Infrastructure/Subscription/Razorpay/RazorpayHttpClient.cs`
- `backend/Services/PlatformService/Platform.Infrastructure/Subscription/Razorpay/MockRazorpayClient.cs`
- `backend/Services/PlatformService/Platform.WebApi/Endpoints/Subscription/RazorpayWebhook.cs`
- `infra/secret-manager-external-deps.sh` (Section 9 — razorpay-webhook-secret slot)
- `docs/devops/external-deps-secret-mapping.md` (mapping table row for razorpay-webhook-secret)

---

## How DI Selects MockRazorpayClient vs RazorpayHttpClient

**Default (no live credentials configured): MockRazorpayClient is active.**

```csharp
// SubscriptionService.Infrastructure/DependencyInjection.cs
services.AddScoped<IRazorpayClient, MockRazorpayClient>();
```

`MockRazorpayClient` is registered unconditionally at startup. It makes no HTTP calls and
returns deterministic fake results (IDs prefixed `mock_order_`, `mock_sub_`, `mock_plan_`).
Every call logs a `LogWarning` with the text `"MockRazorpayClient: ..."` — this is the
startup-log confirmation that mock mode is active (see "Verification" section below).

**To switch to the live RazorpayHttpClient:**

The swap is done at runtime via the `UpdateRazorpayConfig` admin command
(`SubscriptionService.Application/Config/Commands/UpdateRazorpayConfig/`), NOT by a code or
Dockerfile change. An admin (with `subscription.config.write` permission) calls:

```
PATCH /subscriptions/config/razorpay
{
  "keyId": "rzp_live_<key>",
  "keySecret": "<secret>",
  "webhookSecret": "<webhook-secret>",
  "testMode": false,
  "isEnabled": true
}
```

The handler encrypts the key secret and webhook secret using `AesCredentialEncryptionService`
(AES-256-GCM) and persists them to `subscription.razorpay_configs`. On subsequent requests,
the DI-resolved `IRazorpayClient` picks up the persisted config — the switch from mock to live
is handled by the application layer reading the config row.

**In test mode** (`testMode: true`): use a `rzp_test_*` key. The validation in
`UpdateRazorpayConfigCommandValidator` accepts both `rzp_live_` and `rzp_test_` prefixes.

---

## Required Secrets

Three secrets must be provisioned before enabling the live Razorpay client.

### 1. razorpay-key-id

| Field | Value |
|---|---|
| Secret Manager name | `razorpay-key-id` |
| Cloud Run env var | `RAZORPAY_KEY_ID` |
| .NET config key | `configuration["Razorpay:KeyId"]` |
| Where to obtain | Razorpay Dashboard → Account & Settings → API Keys |

```bash
printf '%s' 'rzp_live_<your-key-id>' \
  | gcloud secrets versions add razorpay-key-id \
      --data-file=- \
      --project="${GCP_PROJECT_ID}"
```

### 2. razorpay-key-secret

| Field | Value |
|---|---|
| Secret Manager name | `razorpay-key-secret` |
| Cloud Run env var | `RAZORPAY_KEY_SECRET` |
| .NET config key | `configuration["Razorpay:KeySecret"]` |
| Where to obtain | Same page as key-id (shown once on generation; regenerate if lost) |

```bash
printf '%s' '<your-key-secret>' \
  | gcloud secrets versions add razorpay-key-secret \
      --data-file=- \
      --project="${GCP_PROJECT_ID}"
```

**Never log this value.** `RazorpayHttpClient` uses it only to construct the HTTP Basic
Auth header (`Authorization: Basic base64(keyId:keySecret)`).

### 3. razorpay-webhook-secret (BLOCKER — NEW-D07)

| Field | Value |
|---|---|
| Secret Manager name | `razorpay-webhook-secret` |
| Cloud Run env var | `RAZORPAY_WEBHOOK_SECRET` |
| .NET config key | `configuration["RAZORPAY_WEBHOOK_SECRET"]` |
| Where to obtain | Razorpay Dashboard → Account & Settings → Webhooks → Edit → Secret |
| SEC reference | SEC-051 (HMAC-SHA256 constant-time verification) |

```bash
printf '%s' '<webhook-secret-from-dashboard>' \
  | gcloud secrets versions add razorpay-webhook-secret \
      --data-file=- \
      --project="${GCP_PROJECT_ID}"
```

**Why this is a separate secret from key-id/key-secret:** The webhook secret authenticates
inbound webhook events from Razorpay to SnapAccount. The key-id/key-secret authenticate
outbound API calls from SnapAccount to Razorpay. They are rotated independently.

**Without this secret:** The webhook endpoint (`POST /subscriptions/webhooks/razorpay`) returns
`503 Service Unavailable` (fail-closed by design — see `RazorpayWebhook.cs` line reading
`configuration["RAZORPAY_WEBHOOK_SECRET"]`). Razorpay retries webhooks up to 8 times over
~24h before giving up; missed webhooks mean subscription `charged` / `cancelled` events are
never processed, leaving subscriptions in inconsistent state.

---

## Startup Log Confirmation

### Mock mode active (default, before live credentials configured)

Look for `LogWarning` lines from `MockRazorpayClient` on any payment operation:

```
[WRN] MockRazorpayClient: CreateOrder called (amount=<N> paise, receipt=<id>). No real payment will be processed.
[WRN] MockRazorpayClient: CreateSubscription called (planId=<id>, totalCount=<N>). No real subscription will be created.
[WRN] MockRazorpayClient: VerifyWebhookSignature always returns true in mock mode.
```

If you see these lines, the service is in mock mode — no real payments occur.

### Live mode active (after UpdateRazorpayConfig called with IsEnabled=true)

Mock warnings are absent. The service makes real HTTP calls to `https://api.razorpay.com/v1/`.
Successful order creation logs:

```
[INF] Razorpay order created: <order-id>
```

To confirm at startup without triggering a payment, check that the webhook endpoint responds:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://subscription-service-<hash>-el.a.run.app/subscriptions/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: invalid" \
  -d '{}'
# Expected: 401 (signature check active — means RAZORPAY_WEBHOOK_SECRET is set)
# If 503: secret is missing — provision razorpay-webhook-secret first
```

---

## Production Activation Checklist

Complete in this order. Do NOT register the webhook URL in Razorpay Dashboard until Step 3.

- [ ] **Step 1: Provision Secret Manager slots** (if not already done)
  ```bash
  export GCP_PROJECT_ID=snapaccount-prod
  export ENVIRONMENT=production
  bash infra/secret-manager-external-deps.sh
  ```
  This creates placeholder slots. Skip if already provisioned.

- [ ] **Step 2: Add real values to all three Razorpay secrets**
  ```bash
  printf '%s' 'rzp_live_<key-id>'      | gcloud secrets versions add razorpay-key-id        --data-file=- --project="${GCP_PROJECT_ID}"
  printf '%s' '<key-secret>'            | gcloud secrets versions add razorpay-key-secret     --data-file=- --project="${GCP_PROJECT_ID}"
  printf '%s' '<webhook-secret>'        | gcloud secrets versions add razorpay-webhook-secret  --data-file=- --project="${GCP_PROJECT_ID}"
  ```

- [ ] **Step 3: Redeploy SubscriptionService to pick up the new secret versions**
  ```bash
  gcloud run services update subscription-service \
    --set-secrets="RAZORPAY_WEBHOOK_SECRET=razorpay-webhook-secret:latest,RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest" \
    --region=asia-south1 \
    --project="${GCP_PROJECT_ID}"
  ```

- [ ] **Step 4: Verify webhook endpoint returns 401 (not 503)**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST "https://<subscription-service-url>/subscriptions/webhooks/razorpay" \
    -H "X-Razorpay-Signature: invalid" \
    -H "Content-Type: application/json" \
    -d '{}'
  # Must be 401; 503 means RAZORPAY_WEBHOOK_SECRET is still missing
  ```

- [ ] **Step 5: Register webhook URL in Razorpay Dashboard**
  - Razorpay Dashboard → Account & Settings → Webhooks → Add New Webhook
  - URL: `https://<subscription-service-url>/subscriptions/webhooks/razorpay`
  - Events to enable: `subscription.charged`, `subscription.cancelled`, `subscription.halted`
  - Secret: same value as provisioned in Step 2 for `razorpay-webhook-secret`

- [ ] **Step 6: Activate live credentials via admin API**
  Use a super-admin token to call:
  ```bash
  curl -X PATCH "https://<subscription-service-url>/subscriptions/config/razorpay" \
    -H "Authorization: Bearer <super-admin-session-jwt>" \
    -H "Content-Type: application/json" \
    -d '{
      "keyId": "rzp_live_<key-id>",
      "keySecret": "<key-secret>",
      "webhookSecret": "<webhook-secret>",
      "testMode": false,
      "isEnabled": true
    }'
  # Expected: 200 OK
  ```

- [ ] **Step 7: Send a Razorpay test webhook** from the Razorpay Dashboard
  (Webhooks → your webhook → Send Test)
  Expected response: `{"status":"processed"}` or `{"status":"duplicate"}` (if sent twice)

- [ ] **Step 8: Confirm no MockRazorpayClient warnings appear** in Cloud Logging
  ```bash
  gcloud logging read \
    'resource.type="cloud_run_revision" AND resource.labels.service_name="subscription-service" AND textPayload:"MockRazorpayClient"' \
    --project="${GCP_PROJECT_ID}" \
    --limit=5
  # Expected: 0 results (mock mode is off)
  ```

---

## Rollback

To revert to mock mode without removing secrets:

```bash
curl -X PATCH "https://<subscription-service-url>/subscriptions/config/razorpay" \
  -H "Authorization: Bearer <super-admin-session-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"keyId":"rzp_test_placeholder","keySecret":"placeholder","testMode":true,"isEnabled":false}'
```

Setting `isEnabled: false` causes the application layer to fall through to `MockRazorpayClient`.

---

## Related Files

- `infra/secret-manager-external-deps.sh` — Section 9: razorpay-webhook-secret slot
- `docs/devops/external-deps-secret-mapping.md` — full secret-name → env-var → config-key mapping
- `backend/Services/PlatformService/Platform.Infrastructure/Subscription/DependencyInjection.cs` — DI wiring (read-only)
- `backend/Services/PlatformService/Platform.WebApi/Endpoints/Subscription/RazorpayWebhook.cs` — SEC-051 HMAC verification
