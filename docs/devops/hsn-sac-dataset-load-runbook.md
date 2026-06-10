# HSN/SAC Reference Data — CBIC Dataset Load Runbook

**Phase:** 7 Wave 2 — P6-HANDOFF-17, GAP-038
**Owner:** devops-engineer (runbook) + db-engineer (schema review)
**Date:** 2026-06-10
**Status:** **⏳ PENDING STAGING ACCESS** — execution steps are ready; blocked on staging DB access (team lead must grant)

---

## Context

The GST service (`gst.hsn_sac_code` table — provisioned by migration `020_gst_hsn_sac_codes.sql`)
requires the full ~12,000-row CBIC HSN/SAC dataset to power:
- `HsnSacTypeahead` component in the admin panel (search as-you-type)
- GSTR-1 item validation (every line item requires a valid 4/6/8-digit HSN code)
- CA confirmation flow (plan E3.2 — HSN browsable manager, screen 97)
- GSTIN compliance checks

An empty or sparse dataset causes a broken typeahead in production (GAP-038) and
will fail GSTN API validation at filing time.

---

## Source Data

| Property | Details |
|---|---|
| **Provider** | CBIC (Central Board of Indirect Taxes and Customs), Government of India |
| **Portal** | https://www.cbic.gov.in/resources//htdocs-cbec/gst/hsn_sac_codes.xlsx |
| **Alternate** | https://www.gst.gov.in → GST Rate Finder → Download HSN/SAC codes |
| **Format** | Excel (.xlsx) — approx. 12,000 HSN rows + ~1,000 SAC rows |
| **Frequency** | Updated annually (new HSN codes added by WCO; SAC by CBIC) |
| **License** | Public government data — no restrictions on use |

> **Note:** The CBIC portal sometimes gates downloads behind CAPTCHA.
> If direct download is blocked, download via the GST Rate Finder search interface
> and export, or use the offline Excel file distributed with the GST filing software
> (GSTN portal provides an offline tool that bundles the dataset).

---

## Target Schema

```sql
-- Migration 020_gst_hsn_sac_codes.sql (already applied)
-- gst.hsn_sac_code table:
--   id             UUID PRIMARY KEY
--   code           VARCHAR(8)   NOT NULL  (4, 6, or 8 digit HSN; or SAC code)
--   description    TEXT         NOT NULL
--   code_type      VARCHAR(3)   NOT NULL  ('HSN' or 'SAC')
--   chapter        VARCHAR(2)   NULL      (HSN only — first 2 digits)
--   is_active      BOOLEAN      NOT NULL  DEFAULT TRUE
--   created_at     TIMESTAMPTZ  NOT NULL  DEFAULT NOW()
--   updated_at     TIMESTAMPTZ  NOT NULL  DEFAULT NOW()
--   deleted_at     TIMESTAMPTZ  NULL
```

---

## Pre-conditions

- [ ] Migration `020_gst_hsn_sac_codes.sql` applied (verify: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='gst' AND table_name='hsn_sac_code';` — should return 1)
- [ ] PostgreSQL `COPY` access available (staging DB service account `migration-runner-sa` or direct psql access)
- [ ] CBIC dataset downloaded and converted to CSV (see Step 1)
- [ ] **Team lead has granted staging DB access** ← **PENDING TL-ACTION**

---

## Step 1: Download and Prepare the Dataset

### 1a. Download from CBIC portal

```bash
# Download the official HSN/SAC master list
# NOTE: if the direct link is captcha-gated, download manually from the browser
curl -L -o /tmp/hsn_sac_cbic.xlsx \
  "https://www.cbic.gov.in/resources//htdocs-cbec/gst/hsn_sac_codes.xlsx" \
  --retry 3 --retry-delay 5

# Verify download (should be ~1–3 MB)
ls -lh /tmp/hsn_sac_cbic.xlsx
```

### 1b. Convert Excel to CSV

```bash
# Option A: Python (recommended — available on most CI/staging environments)
pip install openpyxl --quiet

python3 << 'EOF'
import openpyxl, csv, sys

wb = openpyxl.load_workbook('/tmp/hsn_sac_cbic.xlsx', read_only=True, data_only=True)
ws = wb.active

rows = list(ws.iter_rows(values_only=True))
print(f"Total rows in workbook: {len(rows)}", file=sys.stderr)

# Skip header row(s) — typically row 1 is column headers
with open('/tmp/hsn_sac_clean.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_ALL)
    for row in rows[1:]:
        code = str(row[0]).strip() if row[0] else None
        description = str(row[1]).strip() if row[1] else None
        code_type = str(row[2]).strip().upper() if len(row) > 2 and row[2] else (
            'SAC' if (code and len(code) <= 6 and code.startswith('99')) else 'HSN'
        )
        if code and description and len(code) >= 4:
            writer.writerow([code, description, code_type])

print("CSV written to /tmp/hsn_sac_clean.csv", file=sys.stderr)
EOF

# Verify row count (expect ~12,000–13,000 rows)
wc -l /tmp/hsn_sac_clean.csv
```

### 1c. Inspect sample rows

```bash
head -20 /tmp/hsn_sac_clean.csv
# Expected format (code, description, code_type):
# "01","Live animals","HSN"
# "0101","Live horses, asses, mules and hinnies","HSN"
# "010110","Pure-bred breeding horses","HSN"
# ...
# "9954","Construction services","SAC"
```

---

## Step 2: Generate the SQL Load File

```bash
# Generate a single idempotent INSERT SQL file for safe re-runs
python3 << 'EOF'
import csv, uuid, datetime

now = datetime.datetime.utcnow().isoformat() + 'Z'

with open('/tmp/hsn_sac_clean.csv', 'r', encoding='utf-8') as f_in, \
     open('/tmp/hsn_sac_load.sql', 'w', encoding='utf-8') as f_out:

    f_out.write("-- SnapAccount: HSN/SAC CBIC Master Dataset Load\n")
    f_out.write(f"-- Generated: {now}\n")
    f_out.write("-- Source: CBIC (https://www.cbic.gov.in)\n")
    f_out.write("-- Target: gst.hsn_sac_code\n\n")
    f_out.write("BEGIN;\n\n")

    reader = csv.reader(f_in)
    count = 0
    for row in reader:
        if len(row) < 2:
            continue
        code = row[0].strip()
        description = row[1].strip().replace("'", "''")  # escape single quotes
        code_type = row[2].strip().upper() if len(row) > 2 else 'HSN'
        chapter = code[:2] if code_type == 'HSN' and len(code) >= 2 else 'NULL'

        if chapter != 'NULL':
            chapter_val = f"'{chapter}'"
        else:
            chapter_val = 'NULL'

        f_out.write(
            f"INSERT INTO gst.hsn_sac_code (id, code, description, code_type, chapter, is_active, created_at, updated_at)\n"
            f"VALUES (gen_random_uuid(), '{code}', '{description}', '{code_type}', {chapter_val}, TRUE, NOW(), NOW())\n"
            f"ON CONFLICT (code) WHERE deleted_at IS NULL DO UPDATE\n"
            f"  SET description = EXCLUDED.description,\n"
            f"      updated_at  = NOW()\n"
            f"  WHERE gst.hsn_sac_code.description IS DISTINCT FROM EXCLUDED.description;\n\n"
        )
        count += 1

    f_out.write("COMMIT;\n")
    print(f"Generated {count} INSERT statements → /tmp/hsn_sac_load.sql")
EOF

# Verify output
wc -l /tmp/hsn_sac_load.sql
head -30 /tmp/hsn_sac_load.sql
```

> **Idempotency note:** The `ON CONFLICT` clause uses the `code` partial unique index
> (on `code WHERE deleted_at IS NULL`). Re-running updates descriptions but does NOT
> create duplicates. The initial migration must have created this index — verify:
> ```sql
> SELECT indexname FROM pg_indexes WHERE tablename='hsn_sac_code' AND schemaname='gst';
> ```

---

## Step 3: Validate SQL File (Dry-Run)

```bash
# Syntax check with psql (no DB required — just parse)
psql --no-psqlrc -c '\quit' 2>/dev/null && \
  psql postgresql://localhost/postgres \
    -c "BEGIN; SET search_path TO gst; \i /tmp/hsn_sac_load.sql; ROLLBACK;" \
    2>&1 | tail -20

# Expected output: "ROLLBACK" (means dry-run succeeded)
```

---

## Step 4: Apply to Staging

> **⏳ PENDING STAGING ACCESS — team lead must grant `migration-runner-sa` Cloud SQL access**
>
> **Team-lead action:** Run the following after granting access:
> ```bash
> gcloud sql instances describe snapaccount-postgres --project="${GCP_PROJECT_ID}"
> # Confirm instance is RUNNABLE, then proceed
> ```

```bash
# Set environment
export GCP_PROJECT_ID=snapaccount-staging   # or snapaccount-prod
export CLOUD_SQL_INSTANCE=snapaccount-postgres
export CLOUD_SQL_REGION=asia-south1
export DB_NAME=snapaccount

# Option A: Via Cloud SQL Proxy (recommended for local/CI execution)
# 1. Start proxy (run in background)
cloud_sql_proxy "${GCP_PROJECT_ID}:${CLOUD_SQL_REGION}:${CLOUD_SQL_INSTANCE}" \
  --credentials-file="${GOOGLE_APPLICATION_CREDENTIALS}" \
  --port=5433 &
PROXY_PID=$!
sleep 3

# 2. Run the load
PGPASSWORD="${DB_PASSWORD}" psql \
  -h 127.0.0.1 -p 5433 \
  -U snapaccount-app \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f /tmp/hsn_sac_load.sql

echo "Exit code: $?"

# 3. Verify row count
PGPASSWORD="${DB_PASSWORD}" psql \
  -h 127.0.0.1 -p 5433 \
  -U snapaccount-app \
  -d "${DB_NAME}" \
  -c "SELECT code_type, COUNT(*) FROM gst.hsn_sac_code WHERE deleted_at IS NULL GROUP BY code_type;"

# Expected output:
#  code_type | count
# -----------+-------
#  HSN       | ~12000
#  SAC       | ~1000

kill "${PROXY_PID}"

# Option B: Via Cloud Run Job (CI/CD — preferred for production)
# (Trigger the db-migrate.yml workflow with MIGRATION_FILE=/tmp/hsn_sac_load.sql)
```

---

## Step 5: Verify in Admin Panel

After loading:
1. Open admin panel → GST → any GSTR-1 draft → Line Items → HSN field.
2. Type `01` — should show `01: Live animals` immediately.
3. Type `9954` — should show `9954: Construction services (SAC)`.
4. Confirm the typeahead responds within 200ms (indexed on `code` column).

---

## Maintenance: Annual Updates

CBIC updates HSN codes annually (aligned with WCO HS update cycle, January 1).
SAC codes updated when CBIC issues new circulars.

Procedure:
1. Download fresh CBIC dataset (Step 1).
2. Regenerate `/tmp/hsn_sac_load.sql` (Step 2).
3. The `ON CONFLICT ... DO UPDATE` clause handles new codes and updated descriptions without deletion.
4. To deactivate codes removed from the CBIC master list:
   ```sql
   -- Soft-delete codes no longer in the CBIC master (set is_active = FALSE).
   -- Do NOT hard-delete — existing GST returns reference these codes.
   UPDATE gst.hsn_sac_code SET is_active = FALSE, updated_at = NOW()
   WHERE code NOT IN (<list-of-active-codes-from-new-dataset>)
   AND deleted_at IS NULL;
   ```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ON CONFLICT` clause fails | Missing unique index on `code` | `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_hsn_sac_code_active ON gst.hsn_sac_code (code) WHERE deleted_at IS NULL;` |
| psql `\i` not found | SQL file path wrong | Use absolute path |
| `permission denied for schema gst` | User lacks `USAGE` on schema | `GRANT USAGE ON SCHEMA gst TO snapaccount-app; GRANT INSERT, UPDATE ON gst.hsn_sac_code TO snapaccount-app;` |
| Excel column order differs | CBIC changed column order | Inspect `head -2 /tmp/hsn_sac_clean.csv` and adjust Python column indices in Step 1b |
| Row count < 10,000 | Incomplete download or wrong sheet | Check `wb.sheetnames` in Python; CBIC workbook may have multiple sheets (try `ws = wb['HSN']`) |

---

## References

- [CBIC HSN/SAC Downloads](https://www.cbic.gov.in/resources//htdocs-cbec/gst/hsn_sac_codes.xlsx)
- [GST Rate Finder](https://www.gst.gov.in/ratefinder/home)
- [WCO HS 2022 Update](https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx)
- Migration: `database/migrations/020_gst_hsn_sac_codes.sql`
- Admin page spec: docs/design/screens/97-hsn-sac-manager.md (GAP-038)
