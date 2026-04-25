# SnapAccount — Developer Security Checklist

> **Author:** Security Reviewer Agent
> **Date:** 2026-04-04
> **Purpose:** Ongoing security practices for pre-commit, pre-deploy, and quarterly reviews

---

## Pre-Commit Checklist

Run these checks before every `git commit`:

### Secrets and Credentials
- [ ] No hardcoded passwords, API keys, secrets, or tokens in code or config files
- [ ] No `.env` file included in the commit (check with `git status`)
- [ ] No `appsettings.Development.json` with real credentials included
- [ ] No `google-services.json` or `GoogleService-Info.plist` included
- [ ] No Firebase service account JSON included
- [ ] No `*.pem`, `*.p12`, `*.pfx`, `*.key` certificate files included
- [ ] Connection strings reference environment variables or Secret Manager refs only
- [ ] `JWT_SECRET_KEY` is not set to a default value in committed config

### Code Security
- [ ] Any new API endpoint uses `.RequireAuthorization()` (except explicitly public endpoints)
- [ ] Any new API endpoint that is public has a comment explaining why it is unauthenticated
- [ ] No raw SQL strings (use EF Core LINQ or parameterized queries only)
- [ ] No `Console.WriteLine` or `Log.Information` calls that output PII (PAN, Aadhaar, phone, address)
- [ ] No `logger.LogWarning("OTP ... {Otp} ...")` style logs in production paths
- [ ] No `TODO: security` items left unresolved in new code
- [ ] Aadhaar number: only last-4 digits stored or displayed — full number never touches persistence layer
- [ ] PAN number is handled through the encrypted storage path (not plaintext)
- [ ] Any new random value for security purposes uses `RandomNumberGenerator` (not `Random`)

### Input Validation
- [ ] Every new Command/Query has a corresponding FluentValidation validator
- [ ] Phone number validation enforces Indian format (starts 6/7/8/9, exactly 10 digits)
- [ ] GSTIN validation enforces 15-character format
- [ ] PAN validation enforces format XXXXX9999X
- [ ] Amount fields use `decimal` not `float` or `double`
- [ ] File uploads validate MIME type and size before processing

### DPDP Compliance
- [ ] Any new data collection has a corresponding consent mechanism
- [ ] Any new PII field has an entry in the data processing register
- [ ] New user-owned tables have RLS enabled and an isolation policy
- [ ] Financial data modifications write an entry to `shared.audit_log`

---

## Pre-Deploy Checklist

Complete these before every deployment to staging or production:

### Environment Configuration
- [ ] All Secret Manager placeholder values (`REPLACE_ME`) have been updated
- [ ] `ASPNETCORE_ENVIRONMENT` is set to `Production` (not `Development` or `Staging`)
- [ ] Firebase project ID is the production project, not a dev or test project
- [ ] Razorpay is in LIVE mode credentials (not test keys) for production
- [ ] CORS origins are restricted to production domain names only
- [ ] `AllowedHosts` in appsettings does not include `*` in production
- [ ] Redis is not using the default password (`redispassword`)
- [ ] PostgreSQL is not using the default password (`postgresql`)

### Authentication and Authorization
- [ ] `FirebaseAuthMiddleware` is registered in all service pipelines
- [ ] Every non-public endpoint uses `RequireAuthorization()`
- [ ] Hangfire dashboard is protected by admin role check
- [ ] RBAC permission checks are wired into command handlers

### Infrastructure
- [ ] Cloud Run services use `--no-allow-unauthenticated` (except admin panel)
- [ ] Cloud Run services use `--ingress=internal-and-cloud-load-balancing` (except admin panel)
- [ ] VPC connector is attached to all backend services
- [ ] All secrets are fetched from Secret Manager (not hardcoded in Cloud Run env vars)
- [ ] Docker images are built from the non-root user Dockerfile pattern

### Security Verification
- [ ] Run OWASP ZAP or equivalent against staging before each production deploy
- [ ] Check for newly disclosed CVEs affecting .NET 10, React 19, or key dependencies
- [ ] Verify signed URL expiry is still 1 hour (not extended for debugging)
- [ ] Verify Razorpay webhook signature verification is active in SubscriptionService
- [ ] Confirm audit log is receiving entries from a test transaction

### Rate Limiting
- [ ] Rate limiting is configured and Redis-backed counters are live
- [ ] OTP send endpoint rate limit: max 3 requests per phone per 5 minutes
- [ ] Auth endpoints rate limit: max 20 requests per IP per minute
- [ ] Financial write endpoints rate limit: max 10 requests per user per minute

---

## Quarterly Security Review

### Dependency Audit
- [ ] Run `dotnet list package --vulnerable` for all backend projects
- [ ] Run `npm audit` for `src/admin` and `mobile`
- [ ] Review and update the top 5 highest-severity CVEs within 30 days
- [ ] Rotate service account credentials that are older than 90 days
- [ ] Review and rotate Firebase service account JSON if in use

### Access Review
- [ ] Review all SYSTEM_ADMIN users — remove stale access
- [ ] Review all Partner Bank Representative accounts — remove inactive ones
- [ ] Review GitHub repository access — remove contributors who are no longer active
- [ ] Review GCP IAM bindings — remove any roles granted outside Terraform/setup.sh
- [ ] Rotate Razorpay webhook signing secret
- [ ] Rotate MSG91 API key
- [ ] Rotate SendGrid API key

### Security Testing
- [ ] Run application-layer penetration test on staging environment
- [ ] Test all OTP edge cases: expired, max attempts, cooldown, concurrent requests
- [ ] Test CORS: attempt cross-origin request from unauthorized domain
- [ ] Test Razorpay webhook: attempt forged signature — must return 401
- [ ] Test RBAC: attempt to access CA/Admin-only endpoints as a regular user
- [ ] Test account deletion: verify data is erased across all 11 services
- [ ] Test rate limiting: verify OTP endpoint lockout after 3 failed attempts
- [ ] Review Firebase Security Rules in the Firebase Console

### Indian Compliance Review
- [ ] Check for new DPDP Act 2023 notifications or guidelines published by MeitY
- [ ] Check for new RBI digital lending circulars
- [ ] Check GST Council notifications for rate changes — update `gst.gst_tax_rate` table
- [ ] Check Income Tax Act for any regime or slab changes for the current financial year
- [ ] Verify UIDAI eKYC integration is still compliant with current UIDAI guidelines
- [ ] Review document retention: confirm no user data is being deleted before 7 years

### Monitoring and Alerts
- [ ] Verify Cloud Monitoring alerts are firing correctly (test with a synthetic trigger)
- [ ] Review Firebase Crashlytics for any security-related crashes (token refresh failures, etc.)
- [ ] Review Cloud Logging for unusual patterns: repeated 401s, unusual geographic access, high error rates
- [ ] Verify audit log partitions exist for the next 3 months
- [ ] Check for any `REPLACE_ME` placeholder secrets still in Secret Manager

### Data Protection
- [ ] Verify data localization: confirm no resources have been accidentally created outside `asia-south1`
- [ ] Run a test DPDP erasure request and verify all PII is removed within 30 days
- [ ] Verify Cloud Storage lifecycle policies are running (check NEARLINE/COLDLINE transitions)
- [ ] Review consent records: verify consent version is up to date if privacy policy changed
- [ ] Test data export functionality (user's right to data portability)

---

## Security Incident Response Quick Reference

### If a Secret is Leaked (committed to git, exposed in logs, etc.)
1. Immediately revoke the leaked credential (Firebase console, GCP Console, third-party dashboard)
2. Rotate with a new credential and update Secret Manager
3. Update the GitHub Actions variable/secret if applicable
4. Audit logs for any unauthorized use of the leaked credential
5. File an incident report in `docs/security/incidents/`
6. If user data was exposed, initiate DPDP Act breach notification (72-hour deadline)

### If a Data Breach is Suspected
1. Identify and isolate affected services (scale down Cloud Run, revoke SA credentials)
2. Preserve logs immediately (export to Cloud Storage before any cleanup)
3. Notify the security reviewer and orchestrator
4. Within 72 hours: Notify MeitY (DPDP Act Data Protection Board) if personal data is involved
5. Notify affected users within 72 hours of confirmed breach
6. Document in `docs/security/incidents/breach-YYYY-MM-DD.md`

### If OTP Abuse is Detected (mass SMS fraud)
1. Block the source IP at Cloud Armor level immediately
2. Temporarily increase OTP cooldown to 60 minutes via `shared.api_rate_limit` table
3. Notify MSG91 to flag the phone numbers
4. Review and tighten phone number validation (check for VOIP numbers)

---

## Tools and Commands

```bash
# Check .NET package vulnerabilities
dotnet list package --vulnerable --include-transitive

# Check npm vulnerabilities
npm audit --audit-level=high

# Scan for secrets in git history (run before push)
git secrets --scan
# Or use: trufflehog git file://. --since-commit HEAD~10

# Check for hardcoded IPs or credentials
grep -r "Password\s*=\s*['\"][^$]" backend/ --include="*.cs" | grep -v bin | grep -v obj

# Verify RLS is enabled on all user-owned tables
psql -c "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE rowsecurity = TRUE ORDER BY 1, 2;"

# List all Secret Manager secrets and check for REPLACE_ME values
gcloud secrets list --format="value(name)" | xargs -I{} sh -c 'val=$(gcloud secrets versions access latest --secret={} 2>/dev/null); [ "$val" = "REPLACE_ME" ] && echo "REPLACE_ME: {}"'
```

---

*This checklist should be reviewed and updated whenever new services, integrations, or compliance requirements are added.*
*Last updated: 2026-04-04*
