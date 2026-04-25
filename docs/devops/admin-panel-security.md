# Admin Panel Security Guide

**Component:** SnapAccount Admin Panel (React, Cloud Run)
**Finding:** SEC-017 — Admin panel is `--allow-unauthenticated --ingress=all`
**Severity:** Medium
**Status:** Partially mitigated (Firebase Auth at app layer); infrastructure-level controls pending

---

## Current State

The admin panel Cloud Run service is deployed with:

```
--ingress=all
--allow-unauthenticated
```

This means the Cloud Run service URL (e.g. `https://admin-panel-<hash>-el.a.run.app`) is reachable by anyone on the internet. Authentication is enforced **at the application layer** by Firebase Auth — any unauthenticated request is redirected to the login page by the React app. No data is served without a valid Firebase ID token.

This is acceptable before launch, but for a financial platform serving internal staff and CA professionals, infrastructure-level access controls should be added before public launch.

---

## Threat Model

| Threat | Current mitigation | Gap |
|--------|--------------------|-----|
| Unauthenticated access to admin data | Firebase Auth (app layer) | No network-layer block |
| Brute-force login attempts | Firebase Auth rate limiting | No IP-level block |
| Scanning / reconnaissance of admin endpoints | None | Admin URL is publicly resolvable |
| Insider lateral movement | Firebase Auth role check (planned) | RBAC not yet enforced in handlers (SEC-012) |

---

## Recommended Controls

### Option A — Cloud Identity-Aware Proxy (IAP) — Preferred

Cloud IAP adds Google-managed authentication in front of the Cloud Run service. Staff must sign in with their Google Workspace account before the React app even loads. This provides a second authentication layer independent of Firebase.

**Architecture:**

```
Internet → HTTPS Load Balancer (Cloud Armor optional) → Cloud IAP → Cloud Run (admin-panel)
```

**Prerequisites:**
1. A Google Cloud Load Balancer in front of the admin-panel Cloud Run service
2. OAuth consent screen configured in GCP (Internal, Google Workspace only)
3. IAP enabled on the LB backend service

**Step-by-step:**

```bash
# 1. Create a Serverless Network Endpoint Group (NEG) for the Cloud Run service
gcloud compute network-endpoint-groups create admin-panel-neg \
    --region=asia-south1 \
    --network-endpoint-type=serverless \
    --cloud-run-service=admin-panel

# 2. Create a backend service
gcloud compute backend-services create admin-panel-backend \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED

# 3. Add the NEG to the backend service
gcloud compute backend-services add-backend admin-panel-backend \
    --global \
    --network-endpoint-group=admin-panel-neg \
    --network-endpoint-group-region=asia-south1

# 4. Create a URL map
gcloud compute url-maps create admin-panel-url-map \
    --default-service=admin-panel-backend

# 5. Reserve a global static IP
gcloud compute addresses create admin-panel-ip \
    --global \
    --ip-version=IPV4

# 6. Create an HTTPS proxy (requires an SSL certificate)
#    Option: Use Google-managed certificate (recommended)
gcloud compute ssl-certificates create admin-panel-cert \
    --domains=admin.snapaccount.in \
    --global

gcloud compute target-https-proxies create admin-panel-https-proxy \
    --url-map=admin-panel-url-map \
    --ssl-certificates=admin-panel-cert

# 7. Create the forwarding rule
gcloud compute forwarding-rules create admin-panel-forwarding-rule \
    --global \
    --target-https-proxy=admin-panel-https-proxy \
    --address=admin-panel-ip \
    --ports=443

# 8. Enable IAP on the backend service
#    First, configure the OAuth consent screen in the GCP Console:
#    APIs & Services → OAuth consent screen → Internal → SnapAccount Admin
#
#    Then enable IAP:
gcloud iap web enable \
    --resource-type=backend-services \
    --service=admin-panel-backend

# 9. Grant IAP access to your team
#    Replace with actual Google Workspace user emails or group
gcloud iap web add-iam-policy-binding \
    --resource-type=backend-services \
    --service=admin-panel-backend \
    --member="group:admin-team@snapaccount.in" \
    --role="roles/iap.httpsResourceAccessor"

# 10. Restrict the Cloud Run service to only accept traffic from the LB
#     Use the special Cloud Run ingress flag:
gcloud run services update admin-panel \
    --region=asia-south1 \
    --ingress=internal-and-cloud-load-balancing
```

After step 10, the direct `*.run.app` URL no longer serves traffic from the internet — all access goes through the LB → IAP.

**OAuth Consent Screen (manual step in GCP Console):**
1. Go to: APIs & Services > OAuth consent screen
2. User Type: **Internal** (Google Workspace accounts only)
3. App name: `SnapAccount Admin Panel`
4. Support email: `admin@snapaccount.in`
5. Save and continue (no scopes needed for IAP)

---

### Option B — Cloud Armor IP Allowlist (Simpler, implemented now)

If Cloud IAP is not ready for launch, Cloud Armor provides IP-level blocking at the load balancer. This requires the same HTTPS load balancer setup as IAP (steps 1–7 above).

The Cloud Armor security policy is created by `infra/scripts/deploy-admin.sh`. After creating the LB backend service, attach the policy:

```bash
gcloud compute backend-services update admin-panel-backend \
    --security-policy=admin-panel-allowlist \
    --global \
    --project=YOUR_GCP_PROJECT_ID
```

To update the allowlisted IPs:

```bash
# Update office IP (rule priority 1000)
gcloud compute security-policies rules update 1000 \
    --security-policy=admin-panel-allowlist \
    --src-ip-ranges="NEW_OFFICE_IP/32"

# Update VPN IP (rule priority 1001)
gcloud compute security-policies rules update 1001 \
    --security-policy=admin-panel-allowlist \
    --src-ip-ranges="NEW_VPN_IP/32"
```

**Limitation:** IP allowlisting blocks by source IP only. If staff work from dynamic IPs or multiple locations, IAP (Option A) is more maintainable.

---

## IAP Terraform Resource (Future)

When the team adopts Terraform for infrastructure, add these resources to `infra/terraform/`:

```hcl
# SEC-017: Cloud IAP brand (created once per GCP project)
resource "google_iap_brand" "admin_panel" {
  support_email     = "admin@snapaccount.in"
  application_title = "SnapAccount Admin Panel"
  project           = var.project_id
}

# IAP OAuth client for the admin panel backend
resource "google_iap_client" "admin_panel" {
  display_name = "SnapAccount Admin Panel IAP Client"
  brand        = google_iap_brand.admin_panel.name
}

# Grant IAP access to admin team
resource "google_iap_web_backend_service_iam_member" "admin_team" {
  project             = var.project_id
  web_backend_service = google_compute_backend_service.admin_panel.name
  role                = "roles/iap.httpsResourceAccessor"
  member              = "group:admin-team@snapaccount.in"
}
```

Note: `google_iap_brand` can only be created once per GCP project and requires the `iap.googleapis.com` API to be enabled.

---

## Pre-Launch Checklist (SEC-017)

- [ ] HTTPS Load Balancer created in front of admin-panel Cloud Run service
- [ ] DNS record `admin.snapaccount.in` pointing to LB IP
- [ ] Google-managed SSL certificate provisioned and active
- [ ] Either IAP (Option A) or Cloud Armor allowlist (Option B) enabled on the LB backend
- [ ] Cloud Run ingress changed to `internal-and-cloud-load-balancing` (after LB is active)
- [ ] Direct `*.run.app` URL access verified to be blocked
- [ ] HSTS header confirmed present in nginx responses (SEC-025, already implemented)

---

## Related Findings

- **SEC-025** — HTTP-to-HTTPS redirect: Implemented via HSTS header in `src/admin/nginx.conf`. Cloud Run enforces HTTPS at the load balancer; HSTS prevents browsers from making plain HTTP requests after the first visit.
- **SEC-012** — RBAC: Admin panel access also depends on backend RBAC being enforced in command handlers. Without RBAC, a valid Firebase Auth user with a non-admin role could access admin UI data.

---

*Last updated: 2026-04-05*
*Author: devops-engineer*
*Review: security-reviewer*
