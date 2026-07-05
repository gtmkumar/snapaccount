-- =============================================================================
-- 084_gst_notice_form_type_deadline_appeal.sql
-- GAP-108: GST notice automation depth — form-type taxonomy, statutory deadline
--          engine, GSTAT appeal tracking.
--
-- Creates:
--   gst.notice_deadline_rules    — config-driven statutory deadline rules (FY-versioned)
--
-- Alters:
--   gst.notices                  — adds form_type, statutory_deadline, deadline_overridden,
--                                  appeal_stage, appeal_deadline, is_gstat_backlog_flagged
--
-- Backfills:
--   gst.notices.form_type        → 'OTHER' for all existing rows (safe default)
--   gst.notices.appeal_stage     → 'NONE' for all existing rows
--   gst.notice_deadline_rules    → seeded with CGST Act FY 2025-26 timelines
--
-- Idempotent: all DDL wrapped in IF NOT EXISTS / IF column NOT EXISTS guards.
-- Scratch-replay safe: can run on a fresh DB or on top of migration 083.
--
-- Owner: backend-agent (board #48, GAP-108)
-- Date:  2026-06-12
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CREATE gst.notice_deadline_rules (config-driven, FY-versioned)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gst.notice_deadline_rules (
    id                          uuid            NOT NULL DEFAULT gen_random_uuid(),
    financial_year              varchar(10)     NOT NULL,
    form_type                   varchar(20)     NOT NULL,
    response_window_days        int             NOT NULL CHECK (response_window_days > 0),
    allows_notice_text_override boolean         NOT NULL DEFAULT true,
    legal_basis                 varchar(500),
    is_active                   boolean         NOT NULL DEFAULT true,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    updated_at                  timestamptz     NOT NULL DEFAULT now(),
    deleted_at                  timestamptz,
    created_by                  uuid,
    updated_by                  uuid,
    CONSTRAINT pk_notice_deadline_rules PRIMARY KEY (id),
    -- One active rule per FY+form_type pair
    CONSTRAINT uq_notice_deadline_rules_fy_form_type UNIQUE (financial_year, form_type)
);

CREATE INDEX IF NOT EXISTS idx_notice_deadline_rules_active
    ON gst.notice_deadline_rules (is_active)
    WHERE is_active = true;

-- Update trigger (matches pattern used elsewhere in the gst schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_notice_deadline_rules_updated_at'
          AND tgrelid = 'gst.notice_deadline_rules'::regclass
    ) THEN
        CREATE TRIGGER trg_notice_deadline_rules_updated_at
            BEFORE UPDATE ON gst.notice_deadline_rules
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. SEED statutory deadline rules — FY 2025-26 per CGST Act / Rules
--    (also an "ALL" row as FY-agnostic fallback)
-- ---------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING makes this idempotent on re-run.

INSERT INTO gst.notice_deadline_rules
    (financial_year, form_type, response_window_days, allows_notice_text_override, legal_basis)
VALUES
    -- FY 2025-26 specific rows
    ('2025-26', 'ASMT_10',  30, true,
     'Rule 99 CGST Rules 2017 — Assessment scrutiny response window'),
    ('2025-26', 'DRC_01',   30, true,
     'Rule 142 CGST Rules 2017 — Summary demand notice response window'),
    ('2025-26', 'DRC_01A',  30, true,
     'Rule 142(1a) CGST Rules 2017 — Pre-SCN intimation response window'),
    ('2025-26', 'DRC_01B',   7, true,
     'Rule 88C CGST Rules 2017 inserted via Notification 38/2023 dt. 04-Aug-2023 — GSTR-1 vs 3B mismatch; 7 calendar days'),
    ('2025-26', 'DRC_01C',   7, true,
     'Rule 88D CGST Rules 2017 inserted via Notification 38/2023 dt. 04-Aug-2023 — GSTR-3B vs 2B ITC mismatch; 7 calendar days'),
    ('2025-26', 'ADT_01',   30, true,
     'Section 65(3) CGST Act 2017 — GST audit commencement response window'),
    ('2025-26', 'OTHER',    30, true,
     'Conservative default for unclassified notices'),

    -- FY 2026-27 rows (pre-seeded; update response_window_days via admin if Notifications amend them)
    ('2026-27', 'ASMT_10',  30, true,
     'Rule 99 CGST Rules 2017 — carried forward from 2025-26; verify against annual Notification'),
    ('2026-27', 'DRC_01',   30, true,
     'Rule 142 CGST Rules 2017 — carried forward from 2025-26'),
    ('2026-27', 'DRC_01A',  30, true,
     'Rule 142(1a) CGST Rules 2017 — carried forward from 2025-26'),
    ('2026-27', 'DRC_01B',   7, true,
     'Rule 88C CGST Rules 2017 — carried forward from 2025-26'),
    ('2026-27', 'DRC_01C',   7, true,
     'Rule 88D CGST Rules 2017 — carried forward from 2025-26'),
    ('2026-27', 'ADT_01',   30, true,
     'Section 65(3) CGST Act 2017 — carried forward from 2025-26'),
    ('2026-27', 'OTHER',    30, true,
     'Conservative default for unclassified notices'),

    -- "ALL" sentinel rows — used when no FY-specific row is found (EF query fallback)
    ('ALL', 'ASMT_10',  30, true, 'FY-agnostic fallback — Rule 99 CGST Rules'),
    ('ALL', 'DRC_01',   30, true, 'FY-agnostic fallback — Rule 142 CGST Rules'),
    ('ALL', 'DRC_01A',  30, true, 'FY-agnostic fallback — Rule 142(1a) CGST Rules'),
    ('ALL', 'DRC_01B',   7, true, 'FY-agnostic fallback — Rule 88C CGST Rules'),
    ('ALL', 'DRC_01C',   7, true, 'FY-agnostic fallback — Rule 88D CGST Rules'),
    ('ALL', 'ADT_01',   30, true, 'FY-agnostic fallback — Section 65 CGST Act'),
    ('ALL', 'OTHER',    30, true, 'FY-agnostic fallback — conservative default')
ON CONFLICT (financial_year, form_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. ALTER gst.notices — add new GAP-108 columns (idempotent guards)
-- ---------------------------------------------------------------------------

-- form_type: ASMT_10 | DRC_01 | DRC_01A | DRC_01B | DRC_01C | ADT_01 | OTHER
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS form_type varchar(20) NOT NULL DEFAULT 'OTHER';

-- statutory_deadline: computed from IssuedDate + form-type rule; nullable pre-084 rows
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS statutory_deadline date;

-- deadline_overridden: true when operator sets explicit DueDate from notice text
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS deadline_overridden boolean NOT NULL DEFAULT false;

-- appeal_stage: NONE | REPLY_FILED | ORDER_RECEIVED | APPEAL_FILED | GSTAT_PENDING | RESOLVED
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS appeal_stage varchar(20) NOT NULL DEFAULT 'NONE';

-- appeal_deadline: 90 days from order date (s.107 CGST Act)
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS appeal_deadline date;

-- is_gstat_backlog_flagged: pre-computed flag for backlog-appeal deadline (config: 2026-06-30)
ALTER TABLE gst.notices
    ADD COLUMN IF NOT EXISTS is_gstat_backlog_flagged boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. BACKFILL existing rows
-- ---------------------------------------------------------------------------

-- All pre-084 notices get form_type = 'OTHER' (already the column default, but explicit for clarity)
-- TRY to parse from notice_type if it matches a known token (best-effort, non-destructive).
UPDATE gst.notices SET form_type = 'ASMT_10'
WHERE form_type = 'OTHER'
  AND (
      notice_type ILIKE '%asmt-10%' OR notice_type ILIKE '%asmt_10%'
      OR notice_type ILIKE '%asmt10%'
  );

UPDATE gst.notices SET form_type = 'DRC_01'
WHERE form_type = 'OTHER'
  AND (
      -- DRC-01B and DRC-01C must be checked first (more specific); DRC-01A next; DRC-01 last
      notice_type ~ '^DRC[-_]?01$' OR notice_type ILIKE 'drc-01'
  );

UPDATE gst.notices SET form_type = 'DRC_01A'
WHERE form_type = 'OTHER'
  AND (notice_type ILIKE '%drc-01a%' OR notice_type ILIKE '%drc_01a%' OR notice_type ILIKE '%drc01a%');

UPDATE gst.notices SET form_type = 'DRC_01B'
WHERE form_type = 'OTHER'
  AND (notice_type ILIKE '%drc-01b%' OR notice_type ILIKE '%drc_01b%' OR notice_type ILIKE '%drc01b%');

UPDATE gst.notices SET form_type = 'DRC_01C'
WHERE form_type = 'OTHER'
  AND (notice_type ILIKE '%drc-01c%' OR notice_type ILIKE '%drc_01c%' OR notice_type ILIKE '%drc01c%');

UPDATE gst.notices SET form_type = 'ADT_01'
WHERE form_type = 'OTHER'
  AND (notice_type ILIKE '%adt-01%' OR notice_type ILIKE '%adt_01%' OR notice_type ILIKE '%adt01%');

-- appeal_stage backfill — default NONE already set by column default
-- is_gstat_backlog_flagged — default false already set by column default

-- ---------------------------------------------------------------------------
-- 5. INDEXES for new columns
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_gst_notices_form_type
    ON gst.notices (form_type);

CREATE INDEX IF NOT EXISTS idx_gst_notices_appeal_stage
    ON gst.notices (appeal_stage);

CREATE INDEX IF NOT EXISTS idx_gst_notices_gstat_backlog
    ON gst.notices (is_gstat_backlog_flagged)
    WHERE is_gstat_backlog_flagged = true;

CREATE INDEX IF NOT EXISTS idx_gst_notices_statutory_deadline
    ON gst.notices (statutory_deadline)
    WHERE statutory_deadline IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. CHECK CONSTRAINT for appeal_stage values (mirrors form_type approach)
--    Only add if not exists — PGDB doesn't have an idempotent ADD CONSTRAINT IF NOT EXISTS.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notices_appeal_stage_check'
          AND conrelid = 'gst.notices'::regclass
    ) THEN
        ALTER TABLE gst.notices
            ADD CONSTRAINT notices_appeal_stage_check
            CHECK (appeal_stage IN ('NONE','REPLY_FILED','ORDER_RECEIVED','APPEAL_FILED','GSTAT_PENDING','RESOLVED'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notices_form_type_check'
          AND conrelid = 'gst.notices'::regclass
    ) THEN
        ALTER TABLE gst.notices
            ADD CONSTRAINT notices_form_type_check
            CHECK (form_type IN ('ASMT_10','DRC_01','DRC_01A','DRC_01B','DRC_01C','ADT_01','OTHER'));
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS: notice_deadline_rules is read-only for regular users; no org isolation needed
--    (rules are global config, not org-owned data).
-- ---------------------------------------------------------------------------
-- No RLS policy added — table is accessed by service account only; no user-context rows.

COMMIT;

-- =============================================================================
-- DDL HANDOFF to db-engineer (for DDL changelog tracking):
--
-- New table:   gst.notice_deadline_rules  (7+7+7 seeded rows)
-- Altered:     gst.notices
--   + form_type            varchar(20) NOT NULL DEFAULT 'OTHER'
--   + statutory_deadline   date
--   + deadline_overridden  boolean NOT NULL DEFAULT false
--   + appeal_stage         varchar(20) NOT NULL DEFAULT 'NONE'
--   + appeal_deadline      date
--   + is_gstat_backlog_flagged boolean NOT NULL DEFAULT false
-- New indexes: idx_gst_notices_form_type, _appeal_stage, _gstat_backlog, _statutory_deadline
--              idx_notice_deadline_rules_active
-- New constraints: notices_appeal_stage_check, notices_form_type_check
-- =============================================================================
