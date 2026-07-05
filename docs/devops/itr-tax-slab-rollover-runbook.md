# ITR Tax Slab Rollover Runbook

**Frequency:** Once per year, on or before April 1 (start of new Assessment Year)  
**Owner:** Ops / DevOps (coordinates with backend-agent for schema confirmation)  
**Table:** `itr.tax_slab_versions`  
**Critical rule:** NEVER UPDATE existing rows. Always INSERT a new versioned row.

---

## Background

Indian income tax slabs change annually with the Union Budget (typically February).
SnapAccount's ITR engine is config-driven: tax calculation logic reads slab data from
`itr.tax_slab_versions` keyed by Assessment Year (AY). This means:

- Old AY calculations remain reproducible (no mutation of historical data).
- New slabs take effect for the new AY without a code deployment.
- Both Old Regime and New Regime slabs are stored as separate rows per AY.

The financial year runs April 1 – March 31. Assessment Year = financial year + 1.
For example, FY 2025-26 → AY 2026-27.

---

## Pre-rollover Checklist

Before April 1 each year:

- [ ] Read the Finance Bill / Union Budget notification for revised tax slabs.
- [ ] Confirm new `assessment_year` string (format: `YYYY-YY`, e.g., `2026-27`).
- [ ] Check both regimes: Old Regime and New Regime (Section 115BAC).
- [ ] Note any surcharge threshold changes (income > 50L, > 1Cr, > 2Cr, > 5Cr).
- [ ] Note rebate threshold changes (Section 87A — e.g., currently ₹7L under new regime).
- [ ] Confirm the `itr.tax_slab_versions` table schema has not changed (check with backend-agent).
- [ ] Schedule a maintenance window with backend-agent to avoid race conditions during migration.

---

## Step-by-Step: Add New AY Slabs

### 1. Connect to the database

```bash
# Via Cloud SQL Auth Proxy (production)
cloud-sql-proxy --credentials-file=/path/to/sa-key.json \
    ${GCP_PROJECT_ID}:asia-south1:snapaccount-postgres &

PGPASSWORD=$(gcloud secrets versions access latest --secret="db-connection-string-prod" \
    | grep -o 'Password=[^;]*' | cut -d= -f2) \
psql -h 127.0.0.1 -U snapaccount-app -d snapaccount

# Or via migration-runner-sa in CI (preferred — see .github/workflows/db-migrate.yml)
```

### 2. Verify the current latest AY

```sql
SELECT assessment_year, regime, effective_from, created_at
FROM itr.tax_slab_versions
ORDER BY effective_from DESC
LIMIT 10;
```

### 3. Insert new AY slabs — sample template

Replace `{AY}`, `{FY_START}`, and slab values with actuals from the Finance Bill.

```sql
-- ============================================================
-- AY {AY} Tax Slab Rollover
-- Finance Bill: <link to official notification>
-- Inserted by: <ops name>
-- Inserted on: <YYYY-MM-DD>
-- NEVER UPDATE this row after go-live. Insert a new version to correct.
-- ============================================================

BEGIN;

-- Old Regime — AY {AY}
INSERT INTO itr.tax_slab_versions (
    id,
    assessment_year,    -- e.g. '2026-27'
    regime,             -- 'OLD' | 'NEW'
    effective_from,     -- first day of the AY: e.g. '2026-04-01'
    effective_to,       -- last day of the AY: e.g. '2027-03-31' (NULL if open-ended)
    slabs,              -- JSONB array of slab brackets
    surcharge_slabs,    -- JSONB array of surcharge brackets
    rebate_limit,       -- Section 87A rebate ceiling (in paise or as Money decimal)
    rebate_amount,      -- Section 87A rebate amount
    standard_deduction, -- Standard deduction for salaried (0 if not applicable)
    notes,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    '{AY}',
    'OLD',
    '{FY_START}-04-01',
    '{FY_START+1}-03-31',
    '[
        {"from": 0,       "to": 250000,  "rate": 0.00},
        {"from": 250001,  "to": 500000,  "rate": 0.05},
        {"from": 500001,  "to": 1000000, "rate": 0.20},
        {"from": 1000001, "to": null,    "rate": 0.30}
    ]'::jsonb,
    '[
        {"from": 5000000,  "to": 10000000, "rate": 0.10},
        {"from": 10000001, "to": 20000000, "rate": 0.15},
        {"from": 20000001, "to": 50000000, "rate": 0.25},
        {"from": 50000001, "to": null,     "rate": 0.37}
    ]'::jsonb,
    500000,    -- rebate_limit: ₹5L taxable income
    12500,     -- rebate_amount: ₹12,500 (verify from Finance Bill)
    50000,     -- standard_deduction: ₹50,000 salaried
    'AY {AY} Old Regime — verify surcharge rates from Finance Bill <number>',
    NOW(),
    NOW()
);

-- New Regime — AY {AY} (Section 115BAC)
INSERT INTO itr.tax_slab_versions (
    id,
    assessment_year,
    regime,
    effective_from,
    effective_to,
    slabs,
    surcharge_slabs,
    rebate_limit,
    rebate_amount,
    standard_deduction,
    notes,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    '{AY}',
    'NEW',
    '{FY_START}-04-01',
    '{FY_START+1}-03-31',
    '[
        {"from": 0,       "to": 300000,  "rate": 0.00},
        {"from": 300001,  "to": 600000,  "rate": 0.05},
        {"from": 600001,  "to": 900000,  "rate": 0.10},
        {"from": 900001,  "to": 1200000, "rate": 0.15},
        {"from": 1200001, "to": 1500000, "rate": 0.20},
        {"from": 1500001, "to": null,    "rate": 0.30}
    ]'::jsonb,
    '[
        {"from": 5000000,  "to": 10000000, "rate": 0.10},
        {"from": 10000001, "to": 20000000, "rate": 0.15},
        {"from": 20000001, "to": null,     "rate": 0.25}
    ]'::jsonb,
    700000,    -- rebate_limit: ₹7L taxable income (new regime FY 2023-24 onwards — verify)
    25000,     -- rebate_amount: ₹25,000 (verify from Finance Bill)
    75000,     -- standard_deduction: ₹75,000 salaried under new regime (FY 2024-25 — verify)
    'AY {AY} New Regime (Section 115BAC) — verify all values from Finance Bill <number>',
    NOW(),
    NOW()
);

-- Verify before committing
SELECT assessment_year, regime, effective_from, rebate_limit, standard_deduction
FROM itr.tax_slab_versions
WHERE assessment_year = '{AY}'
ORDER BY regime;

COMMIT;
```

### 4. Post-insert verification

```sql
-- Confirm no duplicate AY+regime combinations
SELECT assessment_year, regime, COUNT(*) AS cnt
FROM itr.tax_slab_versions
GROUP BY assessment_year, regime
HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Confirm new AY is returned by the active-slab query (replicate ItrService query)
SELECT * FROM itr.tax_slab_versions
WHERE assessment_year = '{AY}'
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
ORDER BY regime;
```

### 5. Notify backend-agent

After successful insert, notify backend-agent to:
- Confirm `ItrService.TaxSlabVersionRepository` picks up the new AY.
- Run existing golden-file tests against the new AY slabs.
- Verify tax calculation output for at least one Old Regime and one New Regime test case.

---

## Rollback Procedure

Because we never UPDATE, rollback is a soft delete:

```sql
-- DO NOT DELETE — mark as superseded instead
UPDATE itr.tax_slab_versions
SET notes = CONCAT(notes, ' | SUPERSEDED: <reason> on <date>'),
    effective_to = CURRENT_DATE - INTERVAL '1 day',
    updated_at = NOW()
WHERE assessment_year = '{AY}'
  AND regime = '{REGIME}';
-- Then insert a corrected row with a new created_at.
```

---

## Historical Record

| AY | Old Regime | New Regime | Inserted | Notes |
|----|------------|------------|----------|-------|
| Populate after first rollover | | | | |

---

## Related

- Schema: `database/migrations/` (ItrService migrations)
- Service: `backend/Services/FinanceService/Finance.Infrastructure/Itr/`
- Scope doc: `.claude/orchestrator/phase-6D-scope.md`
- Document AI quota: `docs/devops/document-ai-quota-itr.md`
