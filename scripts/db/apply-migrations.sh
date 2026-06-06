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

for f in "${FILES[@]}"; do
  echo ">>> Applying $(basename "$f")"
  # ON_ERROR_STOP=1 makes psql exit non-zero on the first SQL error;
  # set -e then aborts the whole script, failing the CI job.
  psql -v ON_ERROR_STOP=1 --quiet -f "$f"
done

echo
echo "SUCCESS: all ${#FILES[@]} migrations applied with zero errors."
