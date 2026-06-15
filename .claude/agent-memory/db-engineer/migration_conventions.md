---
name: Migration conventions & local replay
description: How SnapAccount SQL migrations are numbered/structured, and how to replay+verify the full chain on a scratch Postgres locally
type: project
---

Migration numbering & structure (as of Phase 7, latest = 061).

- Files live in `database/migrations/NNN_name.sql`, applied in lexical/numeric order. `000_init.sql` first (extensions: vector, pgcrypto, uuid-ossp, pg_trgm, btree_gin; creates all 12 schemas incl. `shared`; defines `shared.set_updated_at()`), then 001…NNN, then `999_seed_reference_data.sql` last. `database/init/00_extensions_and_schemas.sql` is the docker-entrypoint variant (largely duplicates 000_init); the migrations chain alone is self-sufficient.
- **All migrations must be additive + idempotent**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, guard triggers/policies with `DO $$ ... pg_trigger / pg_policies ... $$`. Never rename/drop; mark obsolete columns `-- DEPRECATED: reason, deprecated in Phase-N` and add a `COMMENT ON COLUMN`.
- Audit columns convention: `created_at`/`updated_at` TIMESTAMPTZ DEFAULT NOW(), `deleted_at` TIMESTAMPTZ NULL, `created_by`/`updated_by` UUID. `updated_at` auto-maintained by `trg_*_updated_at` → `shared.set_updated_at()`.
- Phase work is documented as an addendum section at the END of `docs/database/schema-overview.md` (one per phase), not by editing the original sections.

**Why:** the project favors a forward-only additive chain that can be replayed onto an empty DB in CI (GAP-071), so destructive edits to already-shipped migrations are forbidden.

**How to apply:** when adding a migration, continue the number sequence, keep it idempotent, replay the WHOLE chain on a throwaway DB before reporting:

```
export PGPASSWORD=postgresql
PSQL=/opt/homebrew/opt/postgresql@16/bin/psql   # local client is pg16; server is pg18 (Homebrew)
$PSQL -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS snapaccount_migration_test;"
$PSQL -h localhost -U postgres -d postgres -c "CREATE DATABASE snapaccount_migration_test;"
for f in $(ls database/migrations/*.sql | sort); do \
  $PSQL -v ON_ERROR_STOP=1 -h localhost -U postgres -d snapaccount_migration_test -f "$f" || break; done
```

Local Postgres is reachable at Host=localhost Port=5432 user=postgres pw=postgresql. Use a scratch DB `snapaccount_migration_test`; never mutate the main `snapaccount` dev DB. Note `000_init.sql` runs `ALTER DATABASE snapaccount SET search_path...` which is harmless against the scratch DB (no-op/!error only if the literal `snapaccount` DB is absent).
