-- =============================================================================
-- 072_itr_act_version_dimension.sql
-- Phase 7 / GAP-102 (HIGH-design) — IT Act 2025 dimension on ITR config tables.
--
-- CONTEXT
--   The new Income-tax Act, 2025 replaces the Income-tax Act, 1961 effective
--   1 April 2026 (i.e. from "tax year" 2026-27 onward — the new Act renames
--   "Assessment Year" / "Previous Year" to a single forward-looking "tax year").
--   The Act renumbers most sections (e.g. the old §80C/§80D/§87A move to new
--   clause numbers). SnapAccount's ITR config is currently versioned only by
--   FY/AY + regime; it has no dimension to distinguish *which Act* a config row
--   belongs to, so a 1961-era and a 2025-era config for the same period cannot
--   coexist or be resolved unambiguously.
--
-- THIS MIGRATION (additive only — no column altered/removed)
--   1. Adds act_version + tax_year to the FY/AY-versioned config tables:
--        itr.tax_slab_versions   (023)
--        itr.deduction_sections  (023)
--        itr.tax_slab            (006, legacy FY-versioned slab table)
--      act_version defaults to 'IT_ACT_1961' so every existing row keeps its
--      current meaning and existing resolution is unchanged.
--   2. Creates reference table itr.act_section_mapping for the 1961->2025
--      section renumbering, seeded with a few ILLUSTRATIVE well-known rows.
--
-- BACKEND HANDOFF
--   ItrService config-resolution handlers must add `act_version` to their lookup
--   predicate once IT Act 2025 content lands: for tax years 2026-27 onward,
--   resolve config WHERE act_version = 'IT_ACT_2025'; for earlier periods keep
--   'IT_ACT_1961'. Until 2025-Act rows are seeded (a content task), the default
--   keeps every lookup resolving to IT_ACT_1961 exactly as today.
--
-- Depends on: 006_itr_schema.sql, 023_itr_tax_slabs_deductions.sql,
--             000_init.sql (shared.set_updated_at)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- act_version + tax_year on the FY/AY-versioned config tables
-- -----------------------------------------------------------------------------
-- act_version values: 'IT_ACT_1961' (default) | 'IT_ACT_2025'.
-- tax_year is the new-Act terminology (e.g. '2026-27'), kept ALONGSIDE the
-- existing ay / financial_year columns rather than replacing them.
-- -----------------------------------------------------------------------------

ALTER TABLE itr.tax_slab_versions
    ADD COLUMN IF NOT EXISTS act_version VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_1961',
    ADD COLUMN IF NOT EXISTS tax_year    VARCHAR(10);

ALTER TABLE itr.deduction_sections
    ADD COLUMN IF NOT EXISTS act_version VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_1961',
    ADD COLUMN IF NOT EXISTS tax_year    VARCHAR(10);

ALTER TABLE itr.tax_slab
    ADD COLUMN IF NOT EXISTS act_version VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_1961',
    ADD COLUMN IF NOT EXISTS tax_year    VARCHAR(10);

-- CHECK the act_version vocabulary (idempotent add).
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tax_slab_versions_act_version') THEN
        ALTER TABLE itr.tax_slab_versions ADD CONSTRAINT chk_tax_slab_versions_act_version
            CHECK (act_version IN ('IT_ACT_1961','IT_ACT_2025'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deduction_sections_act_version') THEN
        ALTER TABLE itr.deduction_sections ADD CONSTRAINT chk_deduction_sections_act_version
            CHECK (act_version IN ('IT_ACT_1961','IT_ACT_2025'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tax_slab_act_version') THEN
        ALTER TABLE itr.tax_slab ADD CONSTRAINT chk_tax_slab_act_version
            CHECK (act_version IN ('IT_ACT_1961','IT_ACT_2025'));
    END IF;
END $$;

-- Resolution indexes including the new dimension.
CREATE INDEX IF NOT EXISTS idx_tax_slab_versions_ay_regime_act
    ON itr.tax_slab_versions (ay, regime, act_version);
CREATE INDEX IF NOT EXISTS idx_deduction_sections_ay_regime_act
    ON itr.deduction_sections (ay, regime, act_version);
CREATE INDEX IF NOT EXISTS idx_tax_slab_fy_act
    ON itr.tax_slab (financial_year, act_version);

-- Backfill tax_year for existing rows from the existing ay / financial_year
-- (ILLUSTRATIVE convenience only — does NOT change act_version, which stays 1961).
-- 'AY2026-27' tax_year is the FY the AY assesses: AY2026-27 assesses tax year 2025-26.
UPDATE itr.tax_slab_versions
   SET tax_year = regexp_replace(ay, '^AY', '')
 WHERE tax_year IS NULL AND ay IS NOT NULL;
UPDATE itr.deduction_sections
   SET tax_year = regexp_replace(ay, '^AY', '')
 WHERE tax_year IS NULL AND ay IS NOT NULL;
UPDATE itr.tax_slab
   SET tax_year = financial_year
 WHERE tax_year IS NULL AND financial_year IS NOT NULL;

COMMENT ON COLUMN itr.tax_slab_versions.act_version IS
    'Governing Act: IT_ACT_1961 (default) or IT_ACT_2025. Handlers must filter on '
    'this from tax year 2026-27 onward once 2025-Act config is seeded.';
COMMENT ON COLUMN itr.tax_slab_versions.tax_year IS
    'IT Act 2025 "tax year" terminology (e.g. 2026-27), kept alongside ay.';
COMMENT ON COLUMN itr.deduction_sections.act_version IS
    'Governing Act: IT_ACT_1961 (default) or IT_ACT_2025.';
COMMENT ON COLUMN itr.tax_slab.act_version IS
    'Governing Act: IT_ACT_1961 (default) or IT_ACT_2025.';

-- -----------------------------------------------------------------------------
-- itr.act_section_mapping — 1961 -> 2025 section renumbering reference
-- -----------------------------------------------------------------------------
-- Maps an old (1961) section identifier to its equivalent under the governing
-- new Act. Reference table — readable by all authenticated users; no RLS.
-- Seeded rows are ILLUSTRATIVE: a complete, legally-vetted mapping is a content
-- task. is_illustrative=TRUE flags every row that has not been verified against
-- the enacted text. act_version_from records the Act that introduces the new
-- numbering (IT_ACT_2025).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.act_section_mapping (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    old_section      VARCHAR(30) NOT NULL,                  -- 1961 section, e.g. '80C'
    new_section      VARCHAR(30),                           -- 2025 clause; NULL if not yet mapped
    act_version_from VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_2025'
                        CHECK (act_version_from IN ('IT_ACT_2025')),
    description      TEXT,
    is_illustrative  BOOLEAN NOT NULL DEFAULT TRUE,         -- TRUE until legally verified
    source_citation  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    created_by       UUID,
    updated_by       UUID,
    CONSTRAINT uq_act_section_mapping_old_actfrom UNIQUE (old_section, act_version_from)
);

CREATE INDEX IF NOT EXISTS idx_act_section_mapping_old ON itr.act_section_mapping (old_section);
CREATE INDEX IF NOT EXISTS idx_act_section_mapping_new ON itr.act_section_mapping (new_section);

DROP TRIGGER IF EXISTS trg_act_section_mapping_updated_at ON itr.act_section_mapping;
CREATE TRIGGER trg_act_section_mapping_updated_at
    BEFORE UPDATE ON itr.act_section_mapping
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.act_section_mapping IS
    'Income-tax Act 1961 -> 2025 section renumbering reference. Seed rows are '
    'ILLUSTRATIVE (is_illustrative=TRUE) — full legally-vetted mapping is a '
    'separate content task. Do not rely on illustrative rows for filing output.';

-- ILLUSTRATIVE seeds — three well-known, publicly-discussed mappings.
-- New-clause numbers below reflect commonly-cited public mappings of the
-- Income-tax Act, 2025 and MUST be verified against the enacted text before use.
INSERT INTO itr.act_section_mapping
    (old_section, new_section, act_version_from, description, is_illustrative, source_citation)
VALUES
    ('80C',  '123', 'IT_ACT_2025',
        'Deductions for life insurance, PF, PPF, ELSS, principal repayment etc. '
        '(old §80C) consolidated under the IT Act 2025 deduction schedule.',
        TRUE,  'ILLUSTRATIVE — verify against Income-tax Act, 2025 enacted text'),
    ('80D',  '126', 'IT_ACT_2025',
        'Medical insurance premium deduction (old §80D).',
        TRUE,  'ILLUSTRATIVE — verify against Income-tax Act, 2025 enacted text'),
    ('87A',  '157', 'IT_ACT_2025',
        'Rebate for resident individuals below the income threshold (old §87A).',
        TRUE,  'ILLUSTRATIVE — verify against Income-tax Act, 2025 enacted text')
ON CONFLICT (old_section, act_version_from) DO NOTHING;

-- =============================================================================
-- End 072_itr_act_version_dimension.sql
-- =============================================================================
