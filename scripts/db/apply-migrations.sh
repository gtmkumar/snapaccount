#!/usr/bin/env bash
# =============================================================================
# apply-migrations.sh
# Applies every SnapAccount SQL migration, in numeric order, to a Postgres DB.
#
# Used by the `db-migrate-test` CI gate to exercise the FULL migration sequence
# on a clean Postgres so broken migrations are caught before they merge. Also
# runnable locally for the same check.
#
# Ordering (must match what the app/init expects):
#   - All files in database/migrations/*.sql sorted with `sort -V` (version sort),
#     which yields: 000_init, 001_*, 002_*, ... 059_*, then 999_seed_reference_data.
#   - 000_init.sql is the FIRST file and enables extensions (pgvector, pgcrypto,
#     uuid-ossp, pg_trgm, btree_gin) and creates all service schemas, so no
#     separate init step is required — the migration sequence is self-contained.
#   - 999_seed_reference_data.sql runs LAST (seed/reference data).
#
# Each file is applied with `psql -v ON_ERROR_STOP=1`, so the script fails fast
# on the FIRST error and exits non-zero (failing the CI job).
#
# Required env (libpq standard vars):
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${REPO_ROOT}/database/migrations}"

: "${PGHOST:?PGHOST must be set}"
: "${PGPORT:?PGPORT must be set}"
: "${PGUSER:?PGUSER must be set}"
: "${PGDATABASE:?PGDATABASE must be set}"
# PGPASSWORD may legitimately be empty for trust auth; do not hard-require it.

echo "Applying migrations from: ${MIGRATIONS_DIR}"
echo "Target: ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo

shopt -s nullglob
# Portable across bash 3.2 (macOS) and 4+ (CI runners): read sorted list line by
# line instead of `mapfile`. `sort -V` orders numeric prefixes correctly:
# 000_init → 001 → … → 059 → 999_seed last.
FILES=()
while IFS= read -r line; do
  FILES+=("$line")
done < <(ls "${MIGRATIONS_DIR}"/*.sql | sort -V)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "ERROR: no .sql migration files found in ${MIGRATIONS_DIR}" >&2
  exit 1
fi

echo "Migration order (${#FILES[@]} files):"
for f in "${FILES[@]}"; do echo "  - $(basename "$f")"; done
echo

# Tracking table so re-runs are idempotent (incremental). On a FRESH database this is
# empty, so every file is applied (db-migrate-test still exercises the full chain); on an
# EXISTING database only un-applied files run, instead of failing on `CREATE TABLE ... already
# exists`. NOTE: a database previously migrated by a DIFFERENT mechanism (e.g. EF Core) must be
# baselined first — INSERT the already-applied filenames into public.schema_migrations so this
# runner skips them. See docs/devops/recurring-jobs-decision.md / db-migrate.yml.
psql -v ON_ERROR_STOP=1 --quiet -c \
  "CREATE TABLE IF NOT EXISTS public.schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"

applied=0
skipped=0
for f in "${FILES[@]}"; do
  base="$(basename "$f")"
  if [ "$(psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM public.schema_migrations WHERE filename = '${base}';")" = "1" ]; then
    echo "--- skip (already applied): ${base}"
    skipped=$((skipped + 1))
    continue
  fi
  echo ">>> Applying ${base}"
  # ON_ERROR_STOP=1 makes psql exit non-zero on the first SQL error;
  # set -e then aborts the whole script, failing the CI job. The file is recorded only
  # AFTER it applies cleanly, so a failed migration is retried on the next run.
  psql -v ON_ERROR_STOP=1 --quiet -f "$f"
  psql -v ON_ERROR_STOP=1 --quiet -c \
    "INSERT INTO public.schema_migrations (filename) VALUES ('${base}') ON CONFLICT (filename) DO NOTHING;"
  applied=$((applied + 1))
done

echo
echo "SUCCESS: applied ${applied}, skipped ${skipped} (of ${#FILES[@]} files) with zero errors."
