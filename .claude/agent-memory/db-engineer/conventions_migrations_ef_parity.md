---
name: Migration & EF Parity Conventions
description: How SnapAccount DB migrations are numbered/run and how to achieve EF↔SQL parity when backend merges EF entities with no backing SQL.
type: project
---

Migrations live FLAT in `database/migrations/NNN_name.sql` (zero-padded 3-digit, run in numeric order; `999_seed_reference_data.sql` runs last). There are NO `Phase-N/` subfolders despite the generic db-engineer prompt — continue the flat sequence (latest as of 2026-06-10 is `064`).

**Why:** AuthService, LoanService, SubscriptionService, NotificationService, CallbackService have **no EF Core migrations** — these SQL files are the canonical schema. backend-agent regularly merges EF entities/`IEntityTypeConfiguration` with no SQL, and db-engineer authors the matching additive migration afterward.

**How to apply (EF↔SQL parity), every time:**
- Read the EF `IEntityTypeConfiguration` AND the domain entity. Match `HasColumnName`, `HasMaxLength` (→ VARCHAR(n)), `HasPrecision(p,s)` (→ NUMERIC(p,s)), `HasColumnType("jsonb")`, nullability (value types non-null, `T?` null).
- `BaseAuditableEntity` (in `SnapAccount.Shared.Domain`) means the table MUST have `created_at, updated_at, deleted_at, created_by, updated_by`. `created_by`/`updated_by` are **uuid** columns — `BaseDbContext` registers a string↔Guid `ValueConverter`, so bind uuid. They are often NOT in the config (inherited + auto-snake_cased by `BaseDbContext`), so add them even when the config omits them, or EF inserts break.
- `BaseDbContext` applies a GLOBAL `deleted_at IS NULL` query filter to every `BaseAuditableEntity` — omitting `deleted_at` breaks all EF reads/writes (lesson from migration 061).
- Use the EXACT index names from `HasDatabaseName(...)` (these use an `ix_` prefix; older hand-written tables use `idx_`). Match them so the runtime DB matches EF's expectation.
- Extensions/schemas/`shared.set_updated_at()` come from `000_init.sql`. `gen_random_uuid()` = pgcrypto.

**Additive policy:** never rename/drop/alter existing columns. Supersede by adding a new column and tagging the old one `-- DEPRECATED: reason, deprecated in Phase-N`.

**Verification recipe (proven):** spin up `pgvector/pgvector:pg17` (needs `vector` ext for `000`), apply `000`…latest + `999` with `psql -v ON_ERROR_STOP=1`, then re-apply the new files a second time to prove idempotency, then diff `information_schema.columns` against the EF config. Do NOT touch the main dev DB.
