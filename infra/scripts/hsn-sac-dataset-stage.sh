#!/usr/bin/env bash
# SnapAccount — HSN/SAC CBIC Dataset Staging Pipeline (GAP-038/GAP-072)
#
# This script executes the dataset load documented in:
#   docs/devops/hsn-sac-dataset-load-runbook.md
#
# It downloads the CBIC HSN/SAC master list, converts it, generates an
# idempotent SQL file, and loads it into the target database via Cloud SQL Proxy.
#
# Usage:
#   # Staging (requires Cloud SQL Proxy + service account with Cloud SQL Client role)
#   export GCP_PROJECT_ID=snapaccount-staging
#   export CLOUD_SQL_INSTANCE=snapaccount-postgres
#   export DB_NAME=snapaccount
#   export DB_USER=snapaccount-app
#   export DB_PASSWORD=<from Secret Manager>
#   export CLOUD_SQL_REGION=asia-south1
#   bash infra/scripts/hsn-sac-dataset-stage.sh
#
#   # Dry-run only (no DB load — generate SQL and validate syntax only)
#   DRY_RUN=true bash infra/scripts/hsn-sac-dataset-stage.sh
#
# Prerequisites:
#   - Python 3.8+ with openpyxl: pip install openpyxl
#   - psql CLI (PostgreSQL client)
#   - Cloud SQL Auth Proxy v2: https://cloud.google.com/sql/docs/postgres/sql-proxy
#     Binary name: cloud-sql-proxy (not cloud_sql_proxy legacy)
#   - gcloud CLI authenticated with a service account that has:
#       roles/cloudsql.client  (to connect via proxy)
#       roles/secretmanager.secretAccessor (to read DB_PASSWORD from Secret Manager)
#
# Staging-access blocker:
#   As of 2026-06-11 this script is PENDING staging DB access grant.
#   Team lead must grant the migration-runner-sa service account Cloud SQL Client
#   role before this script can reach the database (see runbook §Pre-conditions).
#
# Output:
#   /tmp/snapaccount-hsn-sac/hsn_sac_load.sql  — generated SQL file
#   /tmp/snapaccount-hsn-sac/load.log           — execution log
#
# Idempotent: ON CONFLICT (code) WHERE deleted_at IS NULL DO UPDATE
#   Re-running updates descriptions but does not create duplicates.

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-snapaccount-postgres}"
CLOUD_SQL_REGION="${CLOUD_SQL_REGION:-asia-south1}"
DB_NAME="${DB_NAME:-snapaccount}"
DB_USER="${DB_USER:-snapaccount-app}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD (read from Secret Manager: db-connection-string-prod)}"
PROXY_PORT="${PROXY_PORT:-5433}"
DRY_RUN="${DRY_RUN:-false}"

WORKDIR="/tmp/snapaccount-hsn-sac"
XLSX_PATH="${WORKDIR}/hsn_sac_cbic.xlsx"
CSV_PATH="${WORKDIR}/hsn_sac_clean.csv"
SQL_PATH="${WORKDIR}/hsn_sac_load.sql"
LOG_PATH="${WORKDIR}/load.log"

# CBIC download URLs (try in order — portal sometimes blocks direct download)
CBIC_URL_PRIMARY="https://www.cbic.gov.in/resources//htdocs-cbec/gst/hsn_sac_codes.xlsx"
CBIC_URL_FALLBACK="https://www.gst.gov.in/resources/hsn_sac_codes.xlsx"

# Minimum acceptable row counts
MIN_HSN_ROWS=10000
MIN_SAC_ROWS=500
MAX_TOTAL_ROWS=20000   # sanity upper-bound

echo "================================================="
echo " SnapAccount — HSN/SAC Dataset Staging (GAP-038)"
echo " Project  : ${GCP_PROJECT_ID}"
echo " Instance : ${CLOUD_SQL_INSTANCE} (${CLOUD_SQL_REGION})"
echo " Target   : ${DB_NAME}.gst.hsn_sac_code"
echo " Dry-run  : ${DRY_RUN}"
echo "================================================="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "${WORKDIR}"
exec > >(tee "${LOG_PATH}") 2>&1

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Verify dependencies
# ─────────────────────────────────────────────────────────────────────────────
echo "Step 1: Checking dependencies..."

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Install Python 3.8+." >&2
    exit 1
fi

if ! python3 -c "import openpyxl" 2>/dev/null; then
    echo "Installing openpyxl..."
    pip install openpyxl --quiet
fi

if ! command -v psql &>/dev/null; then
    echo "ERROR: psql not found. Install PostgreSQL client tools." >&2
    exit 1
fi

# cloud-sql-proxy v2 (binary name changed from legacy cloud_sql_proxy)
if ! command -v cloud-sql-proxy &>/dev/null; then
    echo "ERROR: cloud-sql-proxy not found."
    echo "Install: https://cloud.google.com/sql/docs/postgres/sql-proxy#install"
    if [ "${DRY_RUN}" = "false" ]; then
        exit 1
    fi
    echo "WARNING: Continuing in DRY_RUN mode without proxy."
fi

echo "  Dependencies OK"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Download CBIC dataset
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 2: Downloading CBIC HSN/SAC dataset..."

if [ -f "${XLSX_PATH}" ] && [ "$(stat -f%z "${XLSX_PATH}" 2>/dev/null || stat -c%s "${XLSX_PATH}" 2>/dev/null)" -gt 100000 ]; then
    echo "  Using cached download: ${XLSX_PATH}"
else
    echo "  Trying primary URL: ${CBIC_URL_PRIMARY}"
    if ! curl -L -o "${XLSX_PATH}" \
        --retry 3 --retry-delay 5 \
        --connect-timeout 30 --max-time 120 \
        --user-agent "Mozilla/5.0 (compatible; SnapAccount-HSN-Loader/1.0)" \
        "${CBIC_URL_PRIMARY}" 2>/dev/null; then

        echo "  Primary URL failed — trying fallback: ${CBIC_URL_FALLBACK}"
        curl -L -o "${XLSX_PATH}" \
            --retry 3 --retry-delay 5 \
            --connect-timeout 30 --max-time 120 \
            "${CBIC_URL_FALLBACK}" || {
            echo ""
            echo "ERROR: Both download URLs failed." >&2
            echo "  Manual download required:" >&2
            echo "  1. Download from: ${CBIC_URL_PRIMARY}" >&2
            echo "  2. Save to: ${XLSX_PATH}" >&2
            echo "  3. Re-run this script." >&2
            exit 1
        }
    fi
fi

XLSX_SIZE=$(stat -f%z "${XLSX_PATH}" 2>/dev/null || stat -c%s "${XLSX_PATH}" 2>/dev/null)
echo "  Downloaded: ${XLSX_PATH} (${XLSX_SIZE} bytes)"

if [ "${XLSX_SIZE}" -lt 100000 ]; then
    echo "ERROR: Downloaded file is too small (${XLSX_SIZE} bytes) — likely a CAPTCHA page." >&2
    echo "  Download manually from: ${CBIC_URL_PRIMARY}" >&2
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Convert Excel to CSV
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 3: Converting Excel to CSV..."

python3 << PYEOF
import openpyxl, csv, sys

wb = openpyxl.load_workbook('${XLSX_PATH}', read_only=True, data_only=True)
print(f"  Workbook sheets: {wb.sheetnames}", file=sys.stderr)

# Try to find the right sheet (CBIC sometimes uses named sheets)
sheet_name = None
for candidate in ['HSN', 'HSN_SAC', 'Sheet1', 'Sheet 1', None]:
    if candidate is None:
        ws = wb.active
        sheet_name = ws.title
        break
    elif candidate in wb.sheetnames:
        ws = wb[candidate]
        sheet_name = candidate
        break

print(f"  Using sheet: {sheet_name}", file=sys.stderr)

rows = list(ws.iter_rows(values_only=True))
print(f"  Total rows in sheet: {len(rows)}", file=sys.stderr)

with open('${CSV_PATH}', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_ALL)
    skipped = 0
    written = 0
    for row in rows[1:]:  # skip header row
        if not row or len(row) < 2:
            skipped += 1
            continue

        code = str(row[0]).strip() if row[0] else None
        description = str(row[1]).strip() if row[1] else None

        # Determine code_type
        if len(row) > 2 and row[2] and str(row[2]).strip().upper() in ('HSN', 'SAC'):
            code_type = str(row[2]).strip().upper()
        elif code and len(code) <= 6 and code.startswith('99'):
            code_type = 'SAC'
        else:
            code_type = 'HSN'

        # Skip blank/invalid rows
        if not code or not description:
            skipped += 1
            continue

        # Validate code format (4, 6, or 8 digit numeric for HSN; 4-6 for SAC)
        if not code.isdigit() or len(code) < 4:
            skipped += 1
            continue

        writer.writerow([code, description, code_type])
        written += 1

print(f"  Written: {written} rows, Skipped: {skipped} rows", file=sys.stderr)
PYEOF

CSV_ROWS=$(wc -l < "${CSV_PATH}" | tr -d ' ')
echo "  CSV rows: ${CSV_ROWS}"

if [ "${CSV_ROWS}" -lt "${MIN_HSN_ROWS}" ]; then
    echo "ERROR: CSV has only ${CSV_ROWS} rows — expected at least ${MIN_HSN_ROWS}." >&2
    echo "  The Excel file may be incomplete, or the column structure differs." >&2
    echo "  Inspect: head -5 ${CSV_PATH}" >&2
    exit 1
fi

if [ "${CSV_ROWS}" -gt "${MAX_TOTAL_ROWS}" ]; then
    echo "WARNING: CSV has ${CSV_ROWS} rows — more than expected ${MAX_TOTAL_ROWS}."
    echo "  Verify the dataset before loading."
fi

echo "  CSV sample:"
head -3 "${CSV_PATH}" | sed 's/^/    /'

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Generate idempotent SQL load file
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 4: Generating SQL load file..."

python3 << PYEOF
import csv, uuid, datetime

now = datetime.datetime.utcnow().isoformat() + 'Z'
count = 0
hsn_count = 0
sac_count = 0

with open('${CSV_PATH}', 'r', encoding='utf-8') as f_in, \
     open('${SQL_PATH}', 'w', encoding='utf-8') as f_out:

    f_out.write("-- SnapAccount: HSN/SAC CBIC Master Dataset Load\n")
    f_out.write(f"-- Generated: {now}\n")
    f_out.write("-- Source: CBIC (https://www.cbic.gov.in)\n")
    f_out.write("-- Target: gst.hsn_sac_code\n")
    f_out.write("-- Idempotent: ON CONFLICT (code) WHERE deleted_at IS NULL DO UPDATE\n")
    f_out.write("-- Script: infra/scripts/hsn-sac-dataset-stage.sh (GAP-038)\n\n")

    f_out.write("BEGIN;\n\n")

    # Verify the unique index exists before attempting upserts
    f_out.write("-- Verify unique index (required for ON CONFLICT)\n")
    f_out.write("DO \$\$\n")
    f_out.write("BEGIN\n")
    f_out.write("  IF NOT EXISTS (\n")
    f_out.write("    SELECT 1 FROM pg_indexes\n")
    f_out.write("    WHERE schemaname = 'gst'\n")
    f_out.write("      AND tablename = 'hsn_sac_code'\n")
    f_out.write("      AND indexname LIKE '%code%'\n")
    f_out.write("  ) THEN\n")
    f_out.write("    RAISE EXCEPTION 'Missing unique index on gst.hsn_sac_code.code — run migration 020 first';\n")
    f_out.write("  END IF;\n")
    f_out.write("END \$\$;\n\n")

    reader = csv.reader(f_in)
    for row in reader:
        if len(row) < 2:
            continue

        code = row[0].strip()
        description = row[1].strip().replace("'", "''")  # escape single quotes
        code_type = row[2].strip().upper() if len(row) > 2 else 'HSN'
        chapter = code[:2] if code_type == 'HSN' and len(code) >= 2 else None

        chapter_sql = f"'{chapter}'" if chapter else "NULL"

        f_out.write(
            f"INSERT INTO gst.hsn_sac_code\n"
            f"  (id, code, description, code_type, chapter, is_active, created_at, updated_at)\n"
            f"VALUES\n"
            f"  (gen_random_uuid(), '{code}', '{description}', '{code_type}', {chapter_sql}, TRUE, NOW(), NOW())\n"
            f"ON CONFLICT (code) WHERE deleted_at IS NULL DO UPDATE\n"
            f"  SET description = EXCLUDED.description,\n"
            f"      updated_at  = NOW()\n"
            f"  WHERE gst.hsn_sac_code.description IS DISTINCT FROM EXCLUDED.description;\n\n"
        )
        count += 1
        if code_type == 'HSN':
            hsn_count += 1
        else:
            sac_count += 1

    f_out.write("COMMIT;\n\n")
    f_out.write(f"-- Post-load verification\n")
    f_out.write("SELECT code_type, COUNT(*) AS count\n")
    f_out.write("FROM gst.hsn_sac_code\n")
    f_out.write("WHERE deleted_at IS NULL\n")
    f_out.write("GROUP BY code_type\n")
    f_out.write("ORDER BY code_type;\n")

print(f"  Generated {count} INSERT statements ({hsn_count} HSN + {sac_count} SAC)")
print(f"  SQL file: ${SQL_PATH}")
PYEOF

SQL_LINES=$(wc -l < "${SQL_PATH}" | tr -d ' ')
echo "  SQL file size: ${SQL_LINES} lines"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Dry-run — parse-check only (no DB connection needed)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 5: SQL syntax validation..."

# Basic structural checks (no DB required)
if ! grep -q "^BEGIN;" "${SQL_PATH}"; then
    echo "ERROR: SQL file missing BEGIN; statement" >&2
    exit 1
fi
if ! grep -q "^COMMIT;" "${SQL_PATH}"; then
    echo "ERROR: SQL file missing COMMIT; statement" >&2
    exit 1
fi

INSERT_COUNT=$(grep -c "^INSERT INTO gst.hsn_sac_code" "${SQL_PATH}" || true)
echo "  INSERT statements: ${INSERT_COUNT}"

if [ "${INSERT_COUNT}" -lt "${MIN_HSN_ROWS}" ]; then
    echo "ERROR: Only ${INSERT_COUNT} INSERT statements — expected at least ${MIN_HSN_ROWS}" >&2
    exit 1
fi

echo "  Syntax check: PASSED"

if [ "${DRY_RUN}" = "true" ]; then
    echo ""
    echo "=== DRY RUN COMPLETE ==="
    echo ""
    echo "SQL file generated at: ${SQL_PATH}"
    echo "To apply to staging, re-run without DRY_RUN=true:"
    echo "  export GCP_PROJECT_ID=${GCP_PROJECT_ID}"
    echo "  export DB_PASSWORD=<secret>"
    echo "  bash infra/scripts/hsn-sac-dataset-stage.sh"
    echo ""
    echo "BLOCKER: Staging DB access requires TL grant to migration-runner-sa."
    echo "  See docs/devops/hsn-sac-dataset-load-runbook.md §Pre-conditions"
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Connect via Cloud SQL Auth Proxy and load
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 6: Connecting to Cloud SQL via Auth Proxy..."
echo "  Instance: ${GCP_PROJECT_ID}:${CLOUD_SQL_REGION}:${CLOUD_SQL_INSTANCE}"
echo "  Proxy port: ${PROXY_PORT}"

# Start Cloud SQL Auth Proxy in background
cloud-sql-proxy \
    "${GCP_PROJECT_ID}:${CLOUD_SQL_REGION}:${CLOUD_SQL_INSTANCE}" \
    --port="${PROXY_PORT}" \
    --quiet &
PROXY_PID=$!

# Wait for proxy to be ready
echo "  Waiting for proxy to start..."
for i in $(seq 1 10); do
    if PGPASSWORD="${DB_PASSWORD}" psql \
        -h 127.0.0.1 -p "${PROXY_PORT}" \
        -U "${DB_USER}" -d "${DB_NAME}" \
        -c "SELECT 1" -q &>/dev/null; then
        echo "  Proxy ready."
        break
    fi
    if [ "${i}" -eq 10 ]; then
        echo "ERROR: Cloud SQL Proxy did not become ready after 10 attempts." >&2
        kill "${PROXY_PID}" 2>/dev/null || true
        exit 1
    fi
    sleep 2
done

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Pre-load verification
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 7: Pre-load state..."

PRE_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -t -c "SELECT COUNT(*) FROM gst.hsn_sac_code WHERE deleted_at IS NULL;" \
    2>/dev/null | tr -d ' ')

echo "  Existing rows before load: ${PRE_COUNT}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 8: Apply the SQL load file
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 8: Applying HSN/SAC load (${INSERT_COUNT} upserts)..."
echo "  This may take 30–120 seconds for ~13,000 rows..."

PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 \
    -f "${SQL_PATH}" \
    2>&1 | tail -20

LOAD_EXIT_CODE=$?
if [ "${LOAD_EXIT_CODE}" -ne 0 ]; then
    echo "ERROR: psql returned exit code ${LOAD_EXIT_CODE}." >&2
    kill "${PROXY_PID}" 2>/dev/null || true
    echo "  Check ${LOG_PATH} for details." >&2
    exit 1
fi

echo "  Load completed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 9: Post-load verification
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Step 9: Post-load verification..."

PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -c "SELECT code_type, COUNT(*) AS count FROM gst.hsn_sac_code WHERE deleted_at IS NULL GROUP BY code_type ORDER BY code_type;"

POST_HSN=$(PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -t -c "SELECT COUNT(*) FROM gst.hsn_sac_code WHERE deleted_at IS NULL AND code_type='HSN';" \
    | tr -d ' ')

POST_SAC=$(PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -t -c "SELECT COUNT(*) FROM gst.hsn_sac_code WHERE deleted_at IS NULL AND code_type='SAC';" \
    | tr -d ' ')

echo "  HSN codes loaded: ${POST_HSN}"
echo "  SAC codes loaded: ${POST_SAC}"

if [ "${POST_HSN}" -lt "${MIN_HSN_ROWS}" ]; then
    echo "WARNING: HSN count (${POST_HSN}) is below expected minimum (${MIN_HSN_ROWS})." >&2
fi
if [ "${POST_SAC}" -lt "${MIN_SAC_ROWS}" ]; then
    echo "WARNING: SAC count (${POST_SAC}) is below expected minimum (${MIN_SAC_ROWS})." >&2
fi

# Spot-check: verify a known code exists
SPOT_CHECK=$(PGPASSWORD="${DB_PASSWORD}" psql \
    -h 127.0.0.1 -p "${PROXY_PORT}" \
    -U "${DB_USER}" -d "${DB_NAME}" \
    -t -c "SELECT description FROM gst.hsn_sac_code WHERE code='0101' AND deleted_at IS NULL LIMIT 1;" \
    | tr -d ' ')

if [ -n "${SPOT_CHECK}" ]; then
    echo "  Spot-check code '0101': FOUND (${SPOT_CHECK})"
else
    echo "WARNING: Spot-check code '0101' not found — verify dataset column mapping."
fi

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────
kill "${PROXY_PID}" 2>/dev/null || true

echo ""
echo "================================================="
echo " HSN/SAC Dataset Load Complete (GAP-038)"
echo "================================================="
echo ""
echo "  HSN rows: ${POST_HSN}"
echo "  SAC rows: ${POST_SAC}"
echo "  Log:      ${LOG_PATH}"
echo "  SQL file: ${SQL_PATH} (keep for audit; re-run is idempotent)"
echo ""
echo "Next step: verify typeahead in admin panel"
echo "  GST → any GSTR-1 draft → Line Items → HSN field"
echo "  Type '01' — expect 'Live animals' to appear"
echo "  Type '9954' — expect 'Construction services (SAC)' to appear"
echo ""
echo "Annual update: re-download CBIC dataset and re-run this script."
echo "  ON CONFLICT clause handles updates without duplicates."
