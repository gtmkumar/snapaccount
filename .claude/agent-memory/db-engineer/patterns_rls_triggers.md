---
name: Schema RLS & Trigger Patterns
description: Reusable RLS isolation policies, audit/updated_at triggers, and compliance no-delete/immutability triggers used across SnapAccount schemas.
type: project
---

**RLS is defence-in-depth, not primary enforcement.** The app connects as the schema owner (bypasses RLS); primary access control is app-layer RBAC + IDOR org filters. So mirror the simple existing policies — do NOT invent staff/admin read policies. Policies key off `current_setting('app.current_user_id', TRUE)::UUID`.

User-owned table (auth pattern, e.g. 050/052/062):
```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <t>_isolation ON <t> USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
```

Org-owned table (subscription/loan pattern):
```sql
USING (org_id IN (
  SELECT om.organization_id FROM auth.organization_member om
  WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
  UNION SELECT o.id FROM auth.organization o
  WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID));
```
Loan child tables scope via the parent application's `org_id` (see `loan.consents`, `loan.key_facts_statement`).

**No RLS** on global admin/config tables (e.g. `auth.feature_flag`, `auth.platform_config`, `subscription.razorpay_config`) — access is RBAC-gated.

`updated_at` maintenance: `CREATE TRIGGER ... BEFORE UPDATE ... EXECUTE FUNCTION shared.set_updated_at();` (function from `000_init.sql`).

**Compliance no-DELETE trigger** (DPDP/RBI append-only audit; e.g. `loan.consents`, `auth.user_consent`): BEFORE DELETE trigger that `RAISE EXCEPTION`. Hard delete blocked; soft-delete (`UPDATE deleted_at`) still works (it's what EF emits for erasure).

**Signed-field immutability trigger** (e.g. `loan.key_facts_statement`): a blanket no-UPDATE trigger is WRONG when the entity has a legit mutable field. KFS has `acknowledged_at` set by `RecordAcknowledgement()`. So the BEFORE UPDATE trigger raises only if a SIGNED field changes (`IS DISTINCT FROM` for NULL-safe compare on each), and explicitly permits `acknowledged_at`, audit cols, and `deleted_at`.

All `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS` + `CREATE` for idempotency.
