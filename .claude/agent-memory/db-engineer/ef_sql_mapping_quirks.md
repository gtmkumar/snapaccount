---
name: Service EF↔SQL mapping quirks
description: Which services have no EF migrations, how BaseAuditableEntity drives required columns, and per-table reconciliation notes (notification/callback/loan)
type: project
---

Several services have **NO EF Core migrations** — the SQL files in `database/migrations/` are the canonical schema and the EF entity configurations are mapped onto existing columns. Confirmed for: **NotificationService, CallbackService, LoanService**. When backend-agent adds a new EF entity/property to these, db-engineer must add the backing SQL (additive).

**BaseAuditableEntity is the silent column contract.** `backend/Shared/.../BaseDbContext.cs` does two things for EVERY `BaseAuditableEntity` subtype, applied AFTER per-service `ApplyConfigurationsFromAssembly` (so it overrides config):
1. Adds a **global query filter `deleted_at IS NULL`** → the table MUST have a `deleted_at` column or all EF reads/writes fail. (This bit `loan.consents`, which 027 deliberately created without `deleted_at`; fixed additively in 061 — the `trg_consents_no_delete` trigger still blocks hard DELETE, soft-delete UPDATE is allowed.)
2. Maps `CreatedBy`/`UpdatedBy` (CLR `string?`) to **uuid** columns `created_by`/`updated_by` via a string↔Guid converter. So an entity expecting audit cols needs `updated_by` specifically — a column named `last_modified_by` (as 032 used for `loan.consent_catalog`) will NOT satisfy EF. 061 added `updated_by` and deprecated `last_modified_by`.
Columns NOT explicitly `HasColumnName`'d fall back to snake_case of the property name (BaseDbContext `ToSnakeCase`).

Reconciliation status by table (Phase 7 Wave 1):
- `notification.*` — reconciled by `060_notification_ef_alignment.sql`. 7 entities map onto 008+017+060 columns (e.g. `NotificationLogEntry.Locale→language`, `DlqItem.EventCode→event_type`/`ExhaustedAt→last_failed_at`, `NotificationTemplate.Body→body_template`/`SenderName→sender_id`). `notification_event` table was net-new in 060 (seeder needs it).
- `callback.assignments_log` + `callback.kpi_daily_snapshot` (MATERIALIZED VIEW, keyless `ToView`) — already present in `018_callback_schema.sql` and match EF exactly. MV has unique idx `(org_id, snapshot_date)` → refresh with `REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot` (scheduled job owned by devops). MVs can't do RLS → `GetKpiSnapshotQuery` filters `org_id` from caller identity (P6-HANDOFF-04 IDOR).
- `loan.consents` / `loan.consent_catalog` — reconciled by `061`. `Consent.ConsentLocale→consent_locale VARCHAR(10) DEFAULT 'en'`; consent catalog seeded en (032) + hi/bn (061) at v1.4 for 3 types `CREDIT_BUREAU`/`DATA_SHARE_WITH_BANK`/`DISBURSEMENT_MANDATE` — hi/bn bodies are placeholders flagged for legal review.

PG ENUM caveat: `loan.consent_type` (and `loan.application_document_*`) are real PG `ENUM` types with UPPER_SNAKE labels. LoanService relies on `UpperSnakeCaseNameTranslator` to map CLR enum names → labels. If you ever see "invalid input value for enum", that translator/registration is the place to check (backend scope, not db).
