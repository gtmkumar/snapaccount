---
name: Phase 5 Security Fixes Applied
description: Infrastructure security fixes applied in Phase 5 — SEC-006, SEC-017, SEC-024, SEC-025 status and what was done
type: project
---

Phase 5 security fixes were applied to infra and nginx. Four findings addressed (2026-04-05).

**SEC-006 (High) — Root .gitignore:** FIXED. Added `google-services.json`, `GoogleService-Info.plist`, `service-account*.json`, `*-service-account.json`, `application_default_credentials.json`, `gcloud_credentials.json`, `*.pfx`, `*.pem`, `*.key`, `*.crt`, `*.cer`, `secrets.json`, `appsettings.Development.json`, `appsettings.Local.json`, `appsettings.Staging.json`, `appsettings.Production.json`, `build/`, `.next/`, `out/`, `.nyc_output/`, `yarn-error.log*`, `Thumbs.db`, `.env.development.local`, `.env.test.local`, `.env.production.local` to the existing root `.gitignore`.

**SEC-017 (Medium) — Admin Panel IAP/IP Allowlisting:** PARTIAL. Created `infra/scripts/deploy-admin.sh` with Cloud Armor security policy creation (rules 1000/1001 for OFFICE_IP/VPN_IP, default deny-403). Created `docs/devops/admin-panel-security.md` with full IAP setup guide. Cloud Armor is NOT enforced until an HTTPS Load Balancer is provisioned and the policy attached — that is a manual step requiring DNS and SSL cert setup.

**SEC-024 (Low) — document-service-sa permissions:** FIXED. Changed `roles/storage.objectAdmin` to `roles/storage.objectCreator` + `roles/storage.objectViewer` in `infra/setup.sh`. Comment added: if DPDP erasure needs GCS object deletion, restore objectAdmin with written justification.

**SEC-025 (Low) — HTTP-to-HTTPS nginx:** FIXED. Added `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"` header to `src/admin/nginx.conf`. Added commented-out HTTP redirect block for non-Cloud Run deployments. Cloud Run handles TLS termination at LB; HSTS covers the browser-side enforcement.

**Why:** SEC-006 addresses the audit finding that .env files at repo root and src/admin/ were unprotected. SEC-024 follows least-privilege principle. SEC-025 is belt-and-suspenders HTTPS enforcement. SEC-017 is pre-launch requirement.

**How to apply:** When reviewing infra PRs, verify document-service-sa never gets objectAdmin back without documented DPDP erasure justification. SEC-017 is not fully enforced until LB + Cloud Armor attach step is done — track this as a pre-launch manual step.
