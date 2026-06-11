---
name: Migration & EF Parity Conventions
description: How SnapAccount DB migrations are numbered/run and how to achieve EF↔SQL parity when backend merges EF entities with no backing SQL.
type: project
---

Migrations live FLAT in `database/migrations/NNN_name.sql` (zero-padded 3-digit, run in numeric order; `999_seed_reference_data.sql` runs last). There are NO `Phase-N/` subfolders despite the generic db-engineer prompt — continue the flat sequence (latest as of 2026-06-11 is `066`).

**Local-DB replay drift is real — always diff the LIVE DB, never trust a migration file's claim.** When `066` reconciled the Phase-7 EF↔DB handoff (2026-06-11), TWO earlier migrations had declared schema that was ABSENT from the live `snapaccount` DB: `060` declared `notification.notification_event` + 6 `notification.notification_log` dispatch columns (none present), and `061` declared `loan.consents.consent_locale` (absent). The migration runner had not applied them in full locally. **How to apply:** before writing any "add column X" DDL, run `psql ... \d` / `information_schema.columns` against the live target table and add only the true delta; if an earlier file claims a column the DB lacks, re-apply it idempotently (`IF NOT EXISTS`) and flag the replay gap loudly in the migration header + schema-overview.md + the handoff report. `IF NOT EXISTS` makes re-application safe on environments where the earlier migration DID run.

**Singular vs plural table traps:** loan has BOTH `loan.applications` (EF-mapped, has `org_id`) and legacy `loan.loan_application`; BOTH `loan.partner_banks` (active, PK id) and `loan.partner_bank`; BOTH `loan.consents` (active) and `loan.loan_consent`; subscription has `subscription.usage_record` (SINGULAR, the EF target — `UsageRecordConfiguration.ToTable("usage_record")`) and a separate plural `subscription.usage_records` (from `064`). Always confirm the EF `ToTable(...)` target before adding columns; the handoff may name either.

**Why:** AuthService, LoanService, SubscriptionService, NotificationService, CallbackService have **no EF Core migrations** — these SQL files are the canonical schema. backend-agent regularly merges EF entities/`IEntityTypeConfiguration` with no SQL, and db-engineer authors the matching additive migration afterward.

**How to apply (EF↔SQL parity), every time:**
- Read the EF `IEntityTypeConfiguration` AND the domain entity. Match `HasColumnName`, `HasMaxLength` (→ VARCHAR(n)), `HasPrecision(p,s)` (→ NUMERIC(p,s)), `HasColumnType("jsonb")`, nullability (value types non-null, `T?` null).
- `BaseAuditableEntity` (in `SnapAccount.Shared.Domain`) means the table MUST have `created_at, updated_at, deleted_at, created_by, updated_by`. `created_by`/`updated_by` are **uuid** columns — `BaseDbContext` registers a string↔Guid `ValueConverter`, so bind uuid. They are often NOT in the config (inherited + auto-snake_cased by `BaseDbContext`), so add them even when the config omits them, or EF inserts break.
- `BaseDbContext` applies a GLOBAL `deleted_at IS NULL` query filter to every `BaseAuditableEntity` — omitting `deleted_at` breaks all EF reads/writes (lesson from migration 061).
- Use the EXACT index names from `HasDatabaseName(...)` (these use an `ix_` prefix; older hand-written tables use `idx_`). Match them so the runtime DB matches EF's expectation.
- Extensions/schemas/`shared.set_updated_at()` come from `000_init.sql`. `gen_random_uuid()` = pgcrypto.

**Additive policy:** never rename/drop/alter existing columns. Supersede by adding a new column and tagging the old one `-- DEPRECATED: reason, deprecated in Phase-N`.

**Verification recipe (proven):** spin up `pgvector/pgvector:pg17` (needs `vector` ext for `000`), apply `000`…latest + `999` with `psql -v ON_ERROR_STOP=1`, then re-apply the new files a second time to prove idempotency, then diff `information_schema.columns` against the EF config. Do NOT touch the main dev DB.
