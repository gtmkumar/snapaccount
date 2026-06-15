---
name: schema-accounting-edit-log
description: accounting.edit_log MCA statutory audit (migration 071) — DB-level immutable + non-disableable capture pattern, reusable for any "tamper-proof audit trail" requirement
metadata:
  type: project
---

`accounting.edit_log` (migration 071, GAP-100) is the MCA Companies (Accounts) Rules statutory edit log: per-transaction who/what/when/before/after for books of account, NON-DISABLEABLE + IMMUTABLE at the DB level, 8-year retention.

**The reusable "tamper-proof audit trail" pattern** (use this for any future statutory append-only log):
- Append-only table: NO `updated_at`/`deleted_at` (a written row is frozen). Add `retention_until DATE` to document the KEEP-until; NO purge job (retention = KEEP).
- Immutability for ALL roles incl. owner/SUPER_ADMIN: `BEFORE UPDATE`, `BEFORE DELETE`, AND `BEFORE TRUNCATE` triggers that `RAISE EXCEPTION USING ERRCODE='restrict_violation'`. A Postgres trigger is NOT bypassed by table ownership — that's the statutory guarantee. TRUNCATE needs its own `FOR EACH STATEMENT` trigger (row-level BEFORE DELETE does not catch TRUNCATE). Add `REVOKE UPDATE,DELETE,TRUNCATE FROM PUBLIC` (+ `snapaccount_app` if it exists) as defence-in-depth.
- Non-disableable capture = DB-level `AFTER INSERT/UPDATE/DELETE FOR EACH ROW` triggers on the SOURCE tables (so it fires for EF, raw SQL, psql alike). ONE generic `capture_edit_log()` function serves tables with differing column spellings by resolving `org_id`/`entity_id`/`fy_year` from `to_jsonb(NEW/OLD)` (handles `organization_id` vs `org_id`, `financial_year` vs `fy_year`). entity_type passed via `TG_ARGV[0]`.
- `changed_by` from `current_setting('app.current_user_id', TRUE)` (missing_ok), falling back to the row's `updated_by`/`created_by`/`posted_by`/`reviewer_user_id`. Also reads `app.change_reason`/`app.request_id`/`app.correlation_id` GUCs. **Backend must `SET LOCAL app.current_user_id` per accounting write txn** or `changed_by` is NULL — this is the one backend handoff.

**Captured tables:** `accounting.journal_entry`, `journal_entry_line`, `account`, `ledger_entries`. NOT `accounting.ledger` — it holds DERIVED running balances (GENERATED closing_balance), a recomputable projection, not source transactions. The task said "ledger_entry" but the real txn table is `ledger_entries` (016, OCR pipeline, uses `org_id`); `journal_entry`/`account` use `organization_id`.

**Auditor-report contract** (documented in schema-overview.md): FY export = `SELECT ... FROM accounting.edit_log WHERE org_id=:org AND fy_year=:fy ORDER BY changed_at, id` (caller injects org_id from identity, no trusting request body).

See also [[patterns_rls_triggers]], [[migration_conventions]].
