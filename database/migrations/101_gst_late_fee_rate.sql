-- =============================================================================
-- 101_gst_late_fee_rate.sql
-- DG-GST-04: Config-driven, FY-versioned GST late-fee and interest rate table.
--
-- Statutory rates (as of FY 2024-25, CGST Act):
--   GSTR-3B non-nil : Rs 50/day  (max Rs 10,000)
--   GSTR-3B nil     : Rs 20/day  (max Rs 500)
--   GSTR-1  non-nil : Rs 200/day (max Rs 5,000 — per CGST+SGST combined)
--   GSTR-1  nil     : Rs 50/day
--   Interest on net tax payable : 18% p.a. (simple interest, CGST Section 50)
--
-- Rates change by government notification — never hardcode, always read from
-- this table. The application layer checks valid_from / valid_to for the
-- filing date to pick the correct rate.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. gst.gst_late_fee_rate — per-day late-fee amounts (config-driven)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gst.gst_late_fee_rate (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    return_type     varchar(20)     NOT NULL,   -- 'GSTR-1', 'GSTR-3B', 'GSTR-9', etc.
    is_nil_return   boolean         NOT NULL DEFAULT false,
    per_day_amount  numeric(10,2)   NOT NULL,   -- Rs per day (INR, never float)
    max_cap_amount  numeric(10,2),              -- NULL = no cap; else Rs cap
    valid_from      date            NOT NULL,
    valid_to        date,                       -- NULL = currently active
    notes           text,

    CONSTRAINT pk_gst_late_fee_rate PRIMARY KEY (id),
    CONSTRAINT chk_gst_late_fee_rate_return_type
        CHECK (return_type IN ('GSTR-1','GSTR-3B','GSTR-9','GSTR-2A','GSTR-2B')),
    CONSTRAINT chk_gst_late_fee_rate_valid_period
        CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT chk_gst_late_fee_rate_per_day
        CHECK (per_day_amount >= 0),
    CONSTRAINT chk_gst_late_fee_rate_cap
        CHECK (max_cap_amount IS NULL OR max_cap_amount >= 0)
);

COMMENT ON TABLE gst.gst_late_fee_rate IS
    'DG-GST-04: Config-driven late-fee rate lookup. '
    'One row per (return_type, is_nil_return) range. '
    'Never hardcode penalty amounts — query this table by filing date.';

CREATE INDEX IF NOT EXISTS ix_gst_late_fee_rate_return_type
    ON gst.gst_late_fee_rate (return_type, is_nil_return);

CREATE INDEX IF NOT EXISTS ix_gst_late_fee_rate_valid_from
    ON gst.gst_late_fee_rate (valid_from, valid_to);

-- ---------------------------------------------------------------------------
-- 2. gst.gst_interest_rate — annual interest rate on unpaid GST (Section 50)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gst.gst_interest_rate (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    rate_pct        numeric(5,2)    NOT NULL,   -- e.g. 18.00 = 18% p.a.
    valid_from      date            NOT NULL,
    valid_to        date,                       -- NULL = currently active
    notes           text,

    CONSTRAINT pk_gst_interest_rate PRIMARY KEY (id),
    CONSTRAINT chk_gst_interest_rate_valid_period
        CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT chk_gst_interest_rate_pct
        CHECK (rate_pct >= 0 AND rate_pct <= 100)
);

COMMENT ON TABLE gst.gst_interest_rate IS
    'DG-GST-04: Config-driven interest rate on net GST payable. '
    'CGST Act Section 50: currently 18% p.a. on delayed payment. '
    'Simple interest per day = rate_pct / 365 / 100.';

CREATE INDEX IF NOT EXISTS ix_gst_interest_rate_valid_from
    ON gst.gst_interest_rate (valid_from, valid_to);

-- ---------------------------------------------------------------------------
-- 3. Seed statutory rates (FY 2017-18 onwards — rates are stable since launch)
-- ---------------------------------------------------------------------------

-- Late fee rates (per CGST Act + SGST Act combined where applicable)

INSERT INTO gst.gst_late_fee_rate
    (id, return_type, is_nil_return, per_day_amount, max_cap_amount, valid_from, notes)
VALUES
    -- GSTR-3B non-nil: Rs 25/day CGST + Rs 25/day SGST = Rs 50/day combined
    -- Cap: Rs 10,000 per CGST Act 47 (amended; earlier Rs 5,000 before Oct 2022)
    (gen_random_uuid(), 'GSTR-3B', false, 50.00, 10000.00, '2017-07-01',
     'GSTR-3B non-nil: Rs 50/day (Rs 25 CGST + Rs 25 SGST). Max cap Rs 10,000.'),

    -- GSTR-3B nil: Rs 10/day CGST + Rs 10/day SGST = Rs 20/day combined
    -- Cap: Rs 500 per CGST Act 47 (amended)
    (gen_random_uuid(), 'GSTR-3B', true,  20.00,   500.00, '2017-07-01',
     'GSTR-3B nil return: Rs 20/day (Rs 10 CGST + Rs 10 SGST). Max cap Rs 500.'),

    -- GSTR-1 non-nil: Rs 100/day CGST + Rs 100/day SGST = Rs 200/day combined
    -- Cap: Rs 5,000 per CGST Act 47
    (gen_random_uuid(), 'GSTR-1', false, 200.00, 5000.00, '2017-07-01',
     'GSTR-1 non-nil: Rs 200/day (Rs 100 CGST + Rs 100 SGST). Max cap Rs 5,000.'),

    -- GSTR-1 nil: Rs 25/day CGST + Rs 25/day SGST = Rs 50/day combined
    -- Cap: Rs 1,000 per CGST Act 47
    (gen_random_uuid(), 'GSTR-1', true,   50.00, 1000.00, '2017-07-01',
     'GSTR-1 nil return: Rs 50/day (Rs 25 CGST + Rs 25 SGST). Max cap Rs 1,000.')

ON CONFLICT DO NOTHING;

-- Interest rates
INSERT INTO gst.gst_interest_rate
    (id, rate_pct, valid_from, notes)
VALUES
    (gen_random_uuid(), 18.00, '2017-07-01',
     'CGST Act Section 50: 18% p.a. simple interest on delayed payment of GST.')
ON CONFLICT DO NOTHING;

COMMIT;
