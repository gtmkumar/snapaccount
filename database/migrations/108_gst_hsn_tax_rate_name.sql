-- =============================================================================
-- 108_gst_hsn_tax_rate_name.sql
-- DG-GST-06: HSN-based GST rate resolution must honour asOfDate via the
-- FY-versioned temporal tax-rate table (gst.gst_tax_rate) instead of ignoring it.
--
-- Change: adds a nullable `tax_rate_name` column to gst.hsn_sac_codes that
-- links each HSN/SAC entry to a named row in gst.gst_tax_rate.
-- When set, GstCalculationService.GetRateForHsnAsync routes through the temporal
-- table (valid_from/valid_to) instead of the legacy flat default_gst_rate_pct.
--
-- Idempotent (IF NOT EXISTS guards).
-- Additive — no existing data or columns are altered.
-- Depends on: 020_gst_hsn_sac_codes.sql (table), 004_gst_schema.sql (gst_tax_rate).
-- =============================================================================

BEGIN;

-- Add the link column.
-- Nullable so that existing rows without a mapped rate name continue to resolve
-- via the legacy flat default_gst_rate_pct column (backward-compatible fallback).
ALTER TABLE gst.hsn_sac_codes
    ADD COLUMN IF NOT EXISTS tax_rate_name VARCHAR(100);

-- Partial index: only index rows that have a rate name (the temporal-resolution path).
-- Keeps the index lean since many legacy rows may remain unmapped initially.
CREATE INDEX IF NOT EXISTS ix_hsn_sac_codes_tax_rate_name
    ON gst.hsn_sac_codes (tax_rate_name)
    WHERE tax_rate_name IS NOT NULL;

-- =============================================================================
-- Seed: backfill tax_rate_name for the 20 sentinel rows inserted in migration 020.
-- Maps each CBIC-seeded HSN/SAC code to the closest standard GST rate name that
-- matches gst.gst_tax_rate.rate_name convention (seeded in 999_seed_reference_data).
-- Only updates rows where tax_rate_name is still NULL — idempotent.
-- =============================================================================
UPDATE gst.hsn_sac_codes
SET tax_rate_name = CASE default_gst_rate_pct
    WHEN  0.00 THEN 'GST 0%'
    WHEN  5.00 THEN 'GST 5%'
    WHEN 12.00 THEN 'GST 12%'
    WHEN 18.00 THEN 'GST 18%'
    WHEN 28.00 THEN 'GST 28%'
    ELSE NULL   -- unknown rate; leave unmapped, fall back to flat rate
END
WHERE tax_rate_name IS NULL
  AND default_gst_rate_pct IS NOT NULL
  -- Only backfill if the target rate name actually exists in gst_tax_rate,
  -- so a stale seed does not point at a nonexistent rate.
  AND EXISTS (
      SELECT 1 FROM gst.gst_tax_rate gtr
      WHERE gtr.rate_name = CASE default_gst_rate_pct
          WHEN  0.00 THEN 'GST 0%'
          WHEN  5.00 THEN 'GST 5%'
          WHEN 12.00 THEN 'GST 12%'
          WHEN 18.00 THEN 'GST 18%'
          WHEN 28.00 THEN 'GST 28%'
          ELSE NULL
      END
        AND gtr.is_active = TRUE
        AND gtr.deleted_at IS NULL
  );

COMMIT;

-- =============================================================================
-- End of 108_gst_hsn_tax_rate_name.sql
-- =============================================================================
