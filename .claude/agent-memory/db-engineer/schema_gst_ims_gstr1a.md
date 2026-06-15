---
name: schema-gst-ims-gstr1a
description: gst.ims_invoices / ims_action_logs / gstr1a_amendments (migration 074) — GSTN IMS + GSTR-1A tables, RLS house style, append-only audit, RBAC mirror grants
metadata:
  type: project
---

Migration 074 (GAP-101, 2026-06-11) created the GstService IMS (Invoice Management System — mandatory ITC flow Apr-2026) + GSTR-1A backing tables from the EF configs (no inline DDL in handoff; reconstructed from `ImsInvoiceConfiguration`/`ImsActionLogConfiguration`/`Gstr1aAmendmentConfiguration` and verified column-for-column).

- `gst.ims_invoices` — inbound supplier invoices; unique PARTIAL index `uix_ims_invoices_org_supplier_invoice_period (organization_id, supplier_gstin, invoice_number, period) WHERE deleted_at IS NULL` (partial so soft-deleted rows don't block re-ingest). All money cols `numeric(18,2)`. `created_by`/`updated_by` are VARCHAR(128) here (not UUID — EF maps them as string).
- `gst.ims_action_logs` — APPEND-ONLY (no updated_at/deleted_at), immutable via the 071 [[schema-accounting-edit-log]] pattern: `gst.reject_ims_action_log_mutation()` rejects UPDATE/DELETE/TRUNCATE + REVOKE from PUBLIC/snapaccount_app. NO FK to ims_invoices (matches EF — avoid cascade on append log). 7-year retention.
- `gst.gstr1a_amendments` — `amendment_payload_json jsonb`.

**RLS HOUSE-STYLE LESSON (important):** the orchestrator's handoff sketched `org_id = current_setting('app.current_org_id', true)`. That GUC does NOT exist anywhere. Every live gst.* table uses column `organization_id` with the org-MEMBERSHIP subquery keyed on `current_setting('app.current_user_id', TRUE)::uuid` (same as accounting.*). When a handoff sketches a GUC/policy form that differs from the live house style, verify against `pg_policies` on existing same-schema tables and PREFER the house style. See [[patterns_rls_triggers]].

**RBAC mirror (070 pattern):** seeded gst.ims.read/action/sync + gst.gstr1a.read/create. action_type_id NULL (no matching action_type key — don't invent). Grants mirror by join: READS ← gst.itc.reconcile (CA/ORG_ADMIN/REVIEWER/SUPER_ADMIN); WRITES ← gst.returns.file (CA/DEV_LIMITED_MANAGER/ORG_ADMIN/SUPER_ADMIN). NOTE: `gst.returns.read` does NOT exist in auth.permission — use gst.itc.reconcile as the GST read audience. See [[conventions_rbac_permission_seed]].

**Live-DB gotcha:** verifying append-only by INSERTing a test row into a live immutable table means you can't DELETE it back (trigger blocks it, and disabling session_replication_role is correctly blocked by the safety classifier). For a brand-new otherwise-empty table, DROP + re-apply the migration to clean it — that's legitimate owner DDL, not a control bypass. Better: do destructive append-only verification on the scratch DB only.
