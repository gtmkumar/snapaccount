-- =============================================================================
-- 020_gst_hsn_sac_codes.sql
-- Phase 6B — GST Completion
--
-- Adds `gst.hsn_sac_codes` (plural) — Phase-6B-aligned naming for the CBIC
-- HSN/SAC reference dataset. Distinct from legacy `gst.hsn_sac_code` (singular)
-- in 004_gst_schema.sql, which is kept untouched (additive).
--
-- This table is a global reference lookup (no org_id, no RLS — read-only by all).
-- Indexed on `code` (B-tree exact lookup) and `description_tsvector` (GIN for
-- full-text search). The trigger keeps the tsvector in sync on insert/update.
--
-- SEED DATA (this migration): A small SENTINEL set of ~20 common Indian
-- HSN/SAC codes from CBIC. This is INTENTIONAL — full ~12,000-row CBIC dataset
-- must be loaded by Ops as a SEPARATE DATA MIGRATION (CSV bulk import) before
-- production. See `database/seeds/README.md` (TODO) for ops procedure.
--
-- Idempotent. Depends on: 000_init.sql (shared.set_updated_at).
-- =============================================================================

CREATE TABLE IF NOT EXISTS gst.hsn_sac_codes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(20) NOT NULL UNIQUE,
    code_type               VARCHAR(10) NOT NULL CHECK (code_type IN ('HSN','SAC')),
    description             TEXT NOT NULL,
    -- Recommended default GST rate per CBIC schedule. Org-level overrides
    -- live on the invoice line item, not here.
    default_gst_rate_pct    NUMERIC(5,2),
    chapter                 VARCHAR(10),                         -- HSN chapter (first 2 digits) for grouping
    -- Search vector (auto-maintained by trigger below)
    description_tsvector    TSVECTOR,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_hsn_sac_codes_code        ON gst.hsn_sac_codes (code);
CREATE INDEX IF NOT EXISTS idx_hsn_sac_codes_code_type   ON gst.hsn_sac_codes (code_type);
CREATE INDEX IF NOT EXISTS idx_hsn_sac_codes_chapter     ON gst.hsn_sac_codes (chapter) WHERE chapter IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hsn_sac_codes_tsvector    ON gst.hsn_sac_codes USING GIN (description_tsvector);
-- Trigram fallback for "starts-with" / fuzzy match on short codes (uses pg_trgm from 000_init.sql)
CREATE INDEX IF NOT EXISTS idx_hsn_sac_codes_code_trgm   ON gst.hsn_sac_codes USING GIN (code gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- tsvector maintenance trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gst.hsn_sac_codes_tsv_refresh()
RETURNS TRIGGER AS $$
BEGIN
    NEW.description_tsvector :=
        setweight(to_tsvector('english', COALESCE(NEW.code, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hsn_sac_codes_tsv') THEN
        CREATE TRIGGER trg_hsn_sac_codes_tsv
            BEFORE INSERT OR UPDATE OF code, description ON gst.hsn_sac_codes
            FOR EACH ROW EXECUTE FUNCTION gst.hsn_sac_codes_tsv_refresh();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hsn_sac_codes_updated_at') THEN
        CREATE TRIGGER trg_hsn_sac_codes_updated_at
            BEFORE UPDATE ON gst.hsn_sac_codes
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- =============================================================================
-- SENTINEL SEED — 20 common Indian HSN/SAC codes.
-- Production deployments MUST run a separate ops data migration to load the
-- full CBIC dataset (~12k rows). This sentinel set lets dev/staging boot.
-- =============================================================================
INSERT INTO gst.hsn_sac_codes (code, code_type, description, default_gst_rate_pct, chapter) VALUES
    ('1006',   'HSN', 'Rice',                                                    5.00,  '10'),
    ('1701',   'HSN', 'Cane or beet sugar and chemically pure sucrose',          5.00,  '17'),
    ('1905',   'HSN', 'Bread, biscuits, pastry and other bakers wares',         18.00, '19'),
    ('2202',   'HSN', 'Aerated waters, mineral waters, sweetened beverages',    28.00, '22'),
    ('2523',   'HSN', 'Portland cement, aluminous cement, slag cement',         28.00, '25'),
    ('3004',   'HSN', 'Medicaments (excluding 3002, 3005, 3006)',               12.00, '30'),
    ('3304',   'HSN', 'Beauty or make-up preparations, skin-care preparations', 18.00, '33'),
    ('4901',   'HSN', 'Printed books, brochures, leaflets',                      0.00, '49'),
    ('6109',   'HSN', 'T-shirts, singlets and other vests, knitted or crocheted', 12.00, '61'),
    ('6403',   'HSN', 'Footwear with outer soles of rubber/plastics/leather',   18.00, '64'),
    ('7308',   'HSN', 'Structures and parts of structures of iron or steel',    18.00, '73'),
    ('8517',   'HSN', 'Telephones for cellular networks; smartphones',          18.00, '85'),
    ('8703',   'HSN', 'Motor cars and other motor vehicles for passengers',     28.00, '87'),
    ('9403',   'HSN', 'Other furniture and parts thereof',                      18.00, '94'),
    ('997212', 'SAC', 'Rental or leasing services involving own/leased non-residential property', 18.00, '99'),
    ('998311', 'SAC', 'Management consulting services',                         18.00, '99'),
    ('998313', 'SAC', 'Information technology consulting and support services', 18.00, '99'),
    ('998314', 'SAC', 'Information technology design and development services', 18.00, '99'),
    ('998399', 'SAC', 'Other professional, technical and business services',    18.00, '99'),
    ('999111', 'SAC', 'Executive and other top management services',            18.00, '99')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- End of 020_gst_hsn_sac_codes.sql
-- =============================================================================
