---
name: schema-auth-security-log-tables
description: RLS decision for append-only auth/security telemetry log tables — when NOT to enable RLS despite the user-owned default
metadata:
  type: project
---

Auth/security **telemetry log tables** intentionally do NOT get RLS, even though the house default is "RLS on user-owned tables". The precedent set: `auth.otp_request`, `auth.ai_usage_log`, `loan.fraud_checks`, and (migration 089) `auth.device_integrity_checks`.

**Why:** these are append-only logs where (a) `user_id` is nullable (the event can fire before auth resolves — OTP-send, pre-auth attestation), (b) the **backend is the sole writer**, and (c) the only read path is admin/security dashboards that aggregate across **all** users. Per-user RLS isolation (`user_id = app.current_user_id`) would break the only consumer.

**How to apply:** when formalizing a new auth/security log/telemetry table, classify it against this precedent BEFORE reaching for the 083-style `device_approval_requests` RLS block. RLS-on tables in auth (`user`, `user_device`, `device_approval_requests`, `kyc_verification`, `user_consent`…) are rows a *customer reads about themselves*. RLS-off log tables are rows *the system writes about events* for admin consumption. Document the no-RLS decision explicitly in the migration header + a guard comment so reviewers don't flag it as a missing control. See [[schema_dpdp_anonymization_pair]] for the related FK-ON-DELETE-SET-NULL survival pattern on telemetry.

Migration 089 specifics: backend-agent applied the DDL ad-hoc first; formalizing involved verifying with `\d`, confirming the unquoted `auth.user` FK normalized to canonical `auth."user"(id)`, and the file adding the missing `COMMENT`s (the only reconciled drift). Ledger entry in docs/database/schema-overview.md under the 087/088 convention.
