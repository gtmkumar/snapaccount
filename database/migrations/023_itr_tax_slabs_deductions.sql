-- =============================================================================
-- 023_itr_tax_slabs_deductions.sql
-- Phase 6D — ITR Engine (additive)
-- Adds AY-versioned tax slab + deduction reference tables for the
-- config-driven tax computation engine.
-- Depends on: 000_init.sql (shared.set_updated_at), 006_itr_schema.sql
--
-- IMPORTANT — AY rollover discipline:
--   * Tax slabs and deduction limits CHANGE every Assessment Year (AY).
--   * Each (ay, regime) row is IMMUTABLE once seeded.
--   * On AY rollover (April 1 each year), ops/devops MUST INSERT a new
--     versioned row — NEVER UPDATE an existing one.
--   * The tax computation engine reads (ay, regime) -> slabs/deduction limits;
--     historical filings must always resolve against the AY they were filed in.
--   * If a Finance Bill amends slabs mid-year (rare), introduce a NEW row with
--     a later effective_from and let the engine pick by date.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- itr.tax_slab_versions
-- Versioned tax slab table keyed by (ay, regime, effective_from).
-- slabs_jsonb stores an ordered array of slab brackets.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.tax_slab_versions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ay                      TEXT NOT NULL,                       -- e.g. 'AY2025-26', 'AY2026-27'
    regime                  TEXT NOT NULL CHECK (regime IN ('OLD','NEW')),
    -- slabs_jsonb shape: [{ "from": 0, "to": 300000, "rate": 0, "cess": 4 }, ...]
    -- "to" may be null for the top open-ended bracket. "rate" is %, "cess" is %
    slabs_jsonb             JSONB NOT NULL,
    rebate_under_87a        NUMERIC(20,2) NOT NULL DEFAULT 0,    -- Rebate cap (income limit)
    rebate_under_87a_amount NUMERIC(20,2) NOT NULL DEFAULT 0,    -- Max rebate amount
    standard_deduction      NUMERIC(20,2) NOT NULL DEFAULT 0,    -- Salaried standard deduction
    surcharge_jsonb         JSONB,                                -- [{ "from": 5000000, "to": 10000000, "rate": 10 }, ...]
    cess_pct                NUMERIC(5,2) NOT NULL DEFAULT 4,     -- Health & Education Cess
    effective_from          DATE NOT NULL,
    effective_to            DATE,                                 -- NULL = current
    source_citation         TEXT,                                 -- e.g. 'Finance Act 2024 §115BAC, Notification S.O. 1234(E)'
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT chk_tax_slab_versions_period
        CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_tax_slab_versions_ay_regime_eff
        UNIQUE (ay, regime, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_tax_slab_versions_ay         ON itr.tax_slab_versions (ay);
CREATE INDEX IF NOT EXISTS idx_tax_slab_versions_regime     ON itr.tax_slab_versions (regime);
CREATE INDEX IF NOT EXISTS idx_tax_slab_versions_ay_regime  ON itr.tax_slab_versions (ay, regime);
CREATE INDEX IF NOT EXISTS idx_tax_slab_versions_effective  ON itr.tax_slab_versions (effective_from, effective_to);

DROP TRIGGER IF EXISTS trg_tax_slab_versions_updated_at ON itr.tax_slab_versions;
CREATE TRIGGER trg_tax_slab_versions_updated_at
    BEFORE UPDATE ON itr.tax_slab_versions
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- Reference table — readable by all authenticated users; no RLS required.
COMMENT ON TABLE itr.tax_slab_versions IS
    'AY-versioned tax slabs. IMMUTABLE — never UPDATE; INSERT new (ay,regime,effective_from) for rollover.';

-- -----------------------------------------------------------------------------
-- itr.deduction_sections
-- Versioned deduction-section limits per AY × regime.
-- sub_limits_jsonb captures sub-section caps (e.g. 80D senior citizen sub-limit).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.deduction_sections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section             TEXT NOT NULL,                          -- '80C', '80CCD(1B)', '80D', '80G', '80E', 'HRA', 'STD_DEDUCTION', etc.
    ay                  TEXT NOT NULL,                          -- 'AY2025-26'
    regime              TEXT NOT NULL CHECK (regime IN ('OLD','NEW','BOTH')),
    description         TEXT,
    max_amount          NUMERIC(20,2),                          -- NULL = uncapped (e.g. 80G actual donation)
    sub_limits_jsonb    JSONB,                                   -- e.g. { "self_family": 25000, "senior_self": 50000, "parent_senior": 50000 }
    is_available        BOOLEAN NOT NULL DEFAULT TRUE,           -- FALSE for sections disallowed in NEW regime
    source_citation     TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_deduction_sections_section_ay_regime
        UNIQUE (section, ay, regime)
);

CREATE INDEX IF NOT EXISTS idx_deduction_sections_ay         ON itr.deduction_sections (ay);
CREATE INDEX IF NOT EXISTS idx_deduction_sections_section    ON itr.deduction_sections (section);
CREATE INDEX IF NOT EXISTS idx_deduction_sections_ay_regime  ON itr.deduction_sections (ay, regime);

DROP TRIGGER IF EXISTS trg_deduction_sections_updated_at ON itr.deduction_sections;
CREATE TRIGGER trg_deduction_sections_updated_at
    BEFORE UPDATE ON itr.deduction_sections
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.deduction_sections IS
    'AY-versioned deduction-section limits. IMMUTABLE per (section,ay,regime).';

-- =============================================================================
-- SEED DATA — AY2025-26 (Finance Act 2024) and AY2026-27 (Finance Act 2025)
-- =============================================================================
-- AY2025-26 = FY 2024-25 (returns filed by July 2025)
-- AY2026-27 = FY 2025-26 (returns filed by July 2026)
--
-- Cess: 4% Health & Education Cess on tax + surcharge.
-- Rebate u/s 87A:
--   AY2025-26 OLD: rebate up to ₹12,500 if taxable income ≤ ₹5L
--   AY2025-26 NEW: rebate up to ₹25,000 if taxable income ≤ ₹7L
--   AY2026-27 OLD: same as AY2025-26 (no change in old regime)
--   AY2026-27 NEW: rebate up to ₹60,000 if taxable income ≤ ₹12L (Finance Act 2025)
-- Standard deduction (salaried):
--   OLD: ₹50,000 (both AY)
--   NEW AY2025-26: ₹75,000 (raised from ₹50k by Finance Act 2024)
--   NEW AY2026-27: ₹75,000
-- =============================================================================

-- ---- AY2025-26 OLD regime (unchanged from FY2023-24 except basic) ----------
INSERT INTO itr.tax_slab_versions (
    ay, regime, slabs_jsonb,
    rebate_under_87a, rebate_under_87a_amount,
    standard_deduction, cess_pct, effective_from, effective_to, source_citation, notes
) VALUES (
    'AY2025-26', 'OLD',
    '[
        {"from": 0,        "to": 250000,  "rate": 0},
        {"from": 250000,   "to": 500000,  "rate": 5},
        {"from": 500000,   "to": 1000000, "rate": 20},
        {"from": 1000000,  "to": null,    "rate": 30}
    ]'::JSONB,
    500000, 12500,
    50000, 4,
    DATE '2024-04-01', DATE '2025-03-31',
    'Finance Act 2024; Income Tax Act §87A; Old Regime slabs unchanged from FY2023-24',
    'Senior citizen (60-79) basic exemption ₹3L and super-senior (80+) ₹5L are applied at engine level. -- TODO verify senior thresholds at runtime (engine reads dob + ay).'
)
ON CONFLICT (ay, regime, effective_from) DO NOTHING;

-- ---- AY2025-26 NEW regime (default; Finance Act 2024 revised slabs) --------
INSERT INTO itr.tax_slab_versions (
    ay, regime, slabs_jsonb,
    rebate_under_87a, rebate_under_87a_amount,
    standard_deduction, cess_pct, effective_from, effective_to, source_citation, notes
) VALUES (
    'AY2025-26', 'NEW',
    '[
        {"from": 0,        "to": 300000,  "rate": 0},
        {"from": 300000,   "to": 700000,  "rate": 5},
        {"from": 700000,   "to": 1000000, "rate": 10},
        {"from": 1000000,  "to": 1200000, "rate": 15},
        {"from": 1200000,  "to": 1500000, "rate": 20},
        {"from": 1500000,  "to": null,    "rate": 30}
    ]'::JSONB,
    700000, 25000,
    75000, 4,
    DATE '2024-04-01', DATE '2025-03-31',
    'Finance (No.2) Act 2024; §115BAC; standard deduction raised to ₹75,000 for salaried',
    'Default regime u/s 115BAC. Surcharge capped at 25% in new regime.'
)
ON CONFLICT (ay, regime, effective_from) DO NOTHING;

-- ---- AY2026-27 OLD regime (no change) --------------------------------------
INSERT INTO itr.tax_slab_versions (
    ay, regime, slabs_jsonb,
    rebate_under_87a, rebate_under_87a_amount,
    standard_deduction, cess_pct, effective_from, effective_to, source_citation, notes
) VALUES (
    'AY2026-27', 'OLD',
    '[
        {"from": 0,        "to": 250000,  "rate": 0},
        {"from": 250000,   "to": 500000,  "rate": 5},
        {"from": 500000,   "to": 1000000, "rate": 20},
        {"from": 1000000,  "to": null,    "rate": 30}
    ]'::JSONB,
    500000, 12500,
    50000, 4,
    DATE '2025-04-01', NULL,
    'Finance Act 2025; Old Regime slabs unchanged',
    '-- TODO verify old-regime slabs were not amended by Finance Act 2025 supplementary notification.'
)
ON CONFLICT (ay, regime, effective_from) DO NOTHING;

-- ---- AY2026-27 NEW regime (Finance Act 2025 revised slabs + ₹12L rebate) ---
INSERT INTO itr.tax_slab_versions (
    ay, regime, slabs_jsonb,
    rebate_under_87a, rebate_under_87a_amount,
    standard_deduction, cess_pct, effective_from, effective_to, source_citation, notes
) VALUES (
    'AY2026-27', 'NEW',
    '[
        {"from": 0,        "to": 400000,  "rate": 0},
        {"from": 400000,   "to": 800000,  "rate": 5},
        {"from": 800000,   "to": 1200000, "rate": 10},
        {"from": 1200000,  "to": 1600000, "rate": 15},
        {"from": 1600000,  "to": 2000000, "rate": 20},
        {"from": 2000000,  "to": 2400000, "rate": 25},
        {"from": 2400000,  "to": null,    "rate": 30}
    ]'::JSONB,
    1200000, 60000,
    75000, 4,
    DATE '2025-04-01', NULL,
    'Finance Act 2025; §115BAC revised; rebate u/s 87A up to ₹60,000 if income ≤ ₹12L',
    '-- TODO verify exact slab ceilings at engine startup against CBDT notification before AY2026-27 filings open (July 2026).'
)
ON CONFLICT (ay, regime, effective_from) DO NOTHING;

-- ---- itr.deduction_sections seeds ------------------------------------------
-- Seed both AY2025-26 and AY2026-27 for OLD regime (NEW regime disallows most Chapter VI-A).
-- BOTH regime rows used for items allowed in both (e.g., standard deduction, employer NPS 80CCD(2)).

-- 80C — AY2025-26 OLD
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('80C', 'AY2025-26', 'OLD', 'Investments (LIC, PPF, ELSS, principal home loan, etc.)', 150000, NULL, TRUE, 'Income Tax Act §80C')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80C', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80C', 'AY2026-27', 'OLD', 'Investments (LIC, PPF, ELSS, principal home loan, etc.)', 150000, TRUE, 'Income Tax Act §80C')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80C', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80CCD(1B) — Additional NPS (₹50k over and above 80C)
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80CCD(1B)', 'AY2025-26', 'OLD', 'Additional NPS contribution', 50000, TRUE, '§80CCD(1B)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80CCD(1B)', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80CCD(1B)', 'AY2026-27', 'OLD', 'Additional NPS contribution', 50000, TRUE, '§80CCD(1B)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80CCD(1B)', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80CCD(2) — Employer NPS contribution (allowed in BOTH regimes; cap = 10% of salary, 14% if govt employee — handled at engine level)
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation, notes)
VALUES ('80CCD(2)', 'AY2025-26', 'BOTH', 'Employer NPS contribution', NULL,
    '{"private_employee_pct_of_salary": 14, "govt_employee_pct_of_salary": 14}'::JSONB,
    TRUE, '§80CCD(2)', 'Cap raised to 14% by Finance Act 2024 (was 10% private / 14% govt).')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('80CCD(2)', 'AY2026-27', 'BOTH', 'Employer NPS contribution', NULL,
    '{"private_employee_pct_of_salary": 14, "govt_employee_pct_of_salary": 14}'::JSONB,
    TRUE, '§80CCD(2)')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80D — Health insurance premium
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('80D', 'AY2025-26', 'OLD', 'Health insurance premium (self/family/parents)', 100000,
    '{"self_family_below_60": 25000, "self_family_senior": 50000, "parents_below_60": 25000, "parents_senior": 50000, "preventive_health_checkup": 5000}'::JSONB,
    TRUE, '§80D')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80D', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('80D', 'AY2026-27', 'OLD', 'Health insurance premium (self/family/parents)', 100000,
    '{"self_family_below_60": 25000, "self_family_senior": 50000, "parents_below_60": 25000, "parents_senior": 50000, "preventive_health_checkup": 5000}'::JSONB,
    TRUE, '§80D')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80D', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80E — Education loan interest (no cap, 8 yrs)
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation, notes)
VALUES ('80E', 'AY2025-26', 'OLD', 'Education loan interest', NULL, TRUE, '§80E', 'No upper cap; max 8 assessment years from start of repayment.')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80E', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation, notes)
VALUES ('80E', 'AY2026-27', 'OLD', 'Education loan interest', NULL, TRUE, '§80E', 'No upper cap; max 8 assessment years.')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80E', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80G — Donations (50%/100% subject to limits)
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation, notes)
VALUES ('80G', 'AY2025-26', 'OLD', 'Donations to charitable institutions', NULL,
    '{"qualifying_limit_pct_of_agti": 10}'::JSONB,
    TRUE, '§80G', 'Effective limit = lower of donation × eligibility-% or 10% of adjusted gross total income (handled at engine level).')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80G', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('80G', 'AY2026-27', 'OLD', 'Donations to charitable institutions', NULL,
    '{"qualifying_limit_pct_of_agti": 10}'::JSONB,
    TRUE, '§80G')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80G', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 80TTA / 80TTB — Savings interest / senior FD interest
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTA', 'AY2025-26', 'OLD', 'Savings account interest (non-senior)', 10000, TRUE, '§80TTA')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTA', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTA', 'AY2026-27', 'OLD', 'Savings account interest (non-senior)', 10000, TRUE, '§80TTA')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTA', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation, notes)
VALUES ('80TTB', 'AY2025-26', 'OLD', 'Interest income for senior citizens (60+)', 50000, TRUE, '§80TTB', 'Available only to resident seniors.')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTB', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTB', 'AY2026-27', 'OLD', 'Interest income for senior citizens (60+)', 50000, TRUE, '§80TTB')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('80TTB', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- HRA — handled at engine level; cap is min(actual HRA, rent paid - 10%basic, 50%/40% basic). Reference row only.
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation, notes)
VALUES ('HRA', 'AY2025-26', 'OLD', 'House rent allowance exemption', NULL, TRUE, '§10(13A)', 'Engine computes min(actual_hra, rent_paid - 10%basic, 50%basic for metro / 40% non-metro).')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('HRA', 'AY2025-26', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('HRA', 'AY2026-27', 'OLD', 'House rent allowance exemption', NULL, TRUE, '§10(13A)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('HRA', 'AY2026-27', 'NEW', 'Disallowed in new regime', 0, FALSE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- 24(b) — Home loan interest (self-occupied cap ₹2L; let-out: actual)
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('24B', 'AY2025-26', 'OLD', 'Home loan interest', 200000,
    '{"self_occupied_cap": 200000, "let_out": "uncapped"}'::JSONB, TRUE, '§24(b)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation, notes)
VALUES ('24B', 'AY2025-26', 'NEW', 'Self-occupied disallowed; let-out interest still allowed', 0,
    '{"self_occupied_cap": 0, "let_out": "uncapped"}'::JSONB, TRUE, '§115BAC',
    'New regime disallows self-occupied interest but let-out property interest can still be set off against let-out rental income.')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('24B', 'AY2026-27', 'OLD', 'Home loan interest', 200000,
    '{"self_occupied_cap": 200000, "let_out": "uncapped"}'::JSONB, TRUE, '§24(b)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, sub_limits_jsonb, is_available, source_citation)
VALUES ('24B', 'AY2026-27', 'NEW', 'Self-occupied disallowed; let-out interest still allowed', 0,
    '{"self_occupied_cap": 0, "let_out": "uncapped"}'::JSONB, TRUE, '§115BAC')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- STD_DEDUCTION — informational mirror of standard_deduction column on tax_slab_versions
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('STD_DEDUCTION', 'AY2025-26', 'OLD', 'Standard deduction (salaried)', 50000, TRUE, '§16(ia)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('STD_DEDUCTION', 'AY2025-26', 'NEW', 'Standard deduction (salaried)', 75000, TRUE, '§16(ia); Finance Act 2024')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('STD_DEDUCTION', 'AY2026-27', 'OLD', 'Standard deduction (salaried)', 50000, TRUE, '§16(ia)')
ON CONFLICT (section, ay, regime) DO NOTHING;
INSERT INTO itr.deduction_sections (section, ay, regime, description, max_amount, is_available, source_citation)
VALUES ('STD_DEDUCTION', 'AY2026-27', 'NEW', 'Standard deduction (salaried)', 75000, TRUE, '§16(ia); Finance Act 2025')
ON CONFLICT (section, ay, regime) DO NOTHING;

-- =============================================================================
-- End 023_itr_tax_slabs_deductions.sql
-- =============================================================================
