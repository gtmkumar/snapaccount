#!/usr/bin/env bash
# =============================================================================
# migrate-entrypoint.sh
# Entrypoint for the db-migrate Cloud Run Job (backend/Dockerfile.migrate).
#
# The job injects DB_CONNECTION as a .NET-style connection string from Secret
# Manager (e.g. "Host=h;Port=5432;Database=snapaccount;Username=u;Password=p;SSL Mode=Require").
# libpq / psql want the PG* environment variables, so we translate one to the other,
# then hand off to the vetted raw-SQL applier (apply-migrations.sh).
# =============================================================================
set -euo pipefail

_trim() {  # strip leading/trailing whitespace without collapsing inner chars (passwords)
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

if [ -n "${DB_CONNECTION:-}" ]; then
  IFS=';' read -ra _parts <<< "${DB_CONNECTION}"
  for _p in "${_parts[@]}"; do
    [ -z "${_p}" ] && continue
    _key="$(_trim "${_p%%=*}")"
    _key="$(printf '%s' "${_key}" | tr '[:upper:]' '[:lower:]')"
    _val="$(_trim "${_p#*=}")"
    case "${_key}" in
      host|server)                  export PGHOST="${_val}" ;;
      port)                         export PGPORT="${_val}" ;;
      database|db)                  export PGDATABASE="${_val}" ;;
      username|user|"user id"|uid)  export PGUSER="${_val}" ;;
      password|pwd)                 export PGPASSWORD="${_val}" ;;
      "ssl mode"|sslmode)
        # Npgsql "SSL Mode" (Disable/Prefer/Require/VerifyCA/VerifyFull) → libpq sslmode (lowercase, hyphenated).
        _sm="$(printf '%s' "${_val}" | tr '[:upper:]' '[:lower:]')"
        case "${_sm}" in
          verifyca)   _sm="verify-ca" ;;
          verifyfull) _sm="verify-full" ;;
        esac
        export PGSSLMODE="${_sm}"
        ;;
    esac
  done
fi

export PGPORT="${PGPORT:-5432}"

echo "Migration runner: target ${PGUSER:-?}@${PGHOST:-?}:${PGPORT}/${PGDATABASE:-?}"
exec "$(dirname "$0")/apply-migrations.sh"
