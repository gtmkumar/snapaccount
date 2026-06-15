-- =============================================================================
-- 088_report_status_check_realign_and_fy_widen.sql
-- Wave 7 live retest — report.report EF↔DB write-path divergence (write-path fix)
--
-- Changes:
--   1. report.report  report_status_check CHECK
--        FROM ('PENDING','GENERATING','COMPLETED','FAILED')
--        TO   ('QUEUED','PROCESSING','COMPLETED','FAILED')
--   2. report.report.status  DEFAULT  'PENDING' → 'QUEUED'
--   3. report.report.financial_year  varchar(10) → varchar(40)
--
-- Why (1) + (2) — status vocabulary realignment:
--   The C# ReportJobStatus enum (ReportService.Domain/Entities/ReportType.cs) has
--   members Queued / Processing / Completed / Failed. The DB CHECK created by the
--   original report schema instead allowed PENDING / GENERATING / COMPLETED / FAILED,
--   so the EF write path (GenerateReportCommand sets Status = Processing on insert,
--   then Completed / Failed) violated the CHECK and every report INSERT failed.
--   Orchestrator decision: align the DB to the C# enum under the house UPPER_SNAKE
--   serialization convention (cf. auth.user_profile.kyc_status, document.document.status,
--   etc. — all UPPER_SNAKE). Single-word members → QUEUED / PROCESSING / COMPLETED /
--   FAILED. The status column DEFAULT also referenced the now-removed 'PENDING' value
--   and is realigned to 'QUEUED' (the enum's initial/idle state, ReportJobStatus.Queued).
--
-- Why (3) — financial_year widening:
--   The GAP-043 chat-thread-PDF flow (ReportService.Api/Endpoints/Reports.cs +
--   Infrastructure/Reports/ChatThreadPdfGenerator.cs) intentionally encodes a 36-char
--   UUID thread id into the financial_year column to reuse the existing report job
--   schema without bespoke DDL. A 36-char value does not fit varchar(10) and the INSERT
--   fails with 22001 (value too long). Widening to varchar(40) accommodates the UUID
--   (36 chars) plus headroom while still bounding the column.
--
-- ⚠️ BACKEND DEPENDENCY (flagged to orchestrator → backend-agent):
--   ReportJobConfiguration maps Status with `.HasConversion<string>()`, which persists
--   the PascalCase enum member name verbatim ("Queued","Processing","Completed","Failed")
--   — NOT the UPPER_SNAKE values this CHECK now requires. After this migration, EF
--   writes will still violate the CHECK (e.g. "Processing" ∉ allowed set) UNLESS the EF
--   converter is changed to emit UPPER_SNAKE, e.g.:
--       .HasConversion(v => v.ToString().ToUpperInvariant(),
--                       v => Enum.Parse<ReportJobStatus>(v, ignoreCase: true))
--   This DB migration is the orchestrator-decided half; the EF converter change is the
--   matching backend half and must land together for the write path to be fixed.
--
-- House rules:
--   • report.report has 0 rows (confirmed at authoring time) — NO data migration needed.
--     Were rows present, a remap (PENDING→QUEUED, GENERATING→PROCESSING) would be required
--     before swapping the CHECK; this migration deliberately omits it as unnecessary.
--   • snake_case, replay-safe (DO-block guards keyed on current constraint def / column
--     length / default), additive-safe widening (varchar(10)→varchar(40) never truncates).
--   • idx_report_status (btree on status) is unaffected by a CHECK / DEFAULT change.
--
-- Depends on: the original report schema migration that creates report.report,
--   report_status_check, and financial_year varchar(10).
-- Replay-safe on top of 000–087.
-- =============================================================================

-- ── (1) Realign report_status_check to the C# enum (UPPER_SNAKE) ─────────────
DO $$
BEGIN
    -- Drop only if the constraint still permits the OLD vocabulary (PENDING/GENERATING).
    -- Once recreated with the new vocabulary, this guard is false and the block is skipped.
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'report_status_check'
          AND conrelid = 'report.report'::regclass
          AND pg_get_constraintdef(oid) LIKE '%PENDING%'
    ) THEN
        ALTER TABLE report.report DROP CONSTRAINT report_status_check;
    END IF;

    -- (Re)create the constraint if it is absent (covers both the post-drop state above
    -- and any environment where it was never present).
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'report_status_check'
          AND conrelid = 'report.report'::regclass
    ) THEN
        ALTER TABLE report.report
            ADD CONSTRAINT report_status_check
            CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'));
    END IF;
END $$;

-- ── (2) Realign the status column DEFAULT from 'PENDING' to 'QUEUED' ─────────
DO $$
DECLARE
    v_default text;
BEGIN
    SELECT column_default
    INTO v_default
    FROM information_schema.columns
    WHERE table_schema = 'report'
      AND table_name   = 'report'
      AND column_name  = 'status';

    -- Only act if the current default still references the removed 'PENDING' value.
    IF v_default IS NOT NULL AND v_default LIKE '%PENDING%' THEN
        ALTER TABLE report.report
            ALTER COLUMN status SET DEFAULT 'QUEUED';
    END IF;
END $$;

-- ── (3) Widen financial_year varchar(10) → varchar(40) ──────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema             = 'report'
          AND table_name               = 'report'
          AND column_name              = 'financial_year'
          AND character_maximum_length = 10
    ) THEN
        ALTER TABLE report.report
            ALTER COLUMN financial_year TYPE varchar(40);
    END IF;
END $$;

-- ── Documentation comments ──────────────────────────────────────────────────
COMMENT ON CONSTRAINT report_status_check ON report.report IS
    'Allowed report job statuses, aligned to C# ReportJobStatus enum under house '
    'UPPER_SNAKE convention (migration 088): QUEUED / PROCESSING / COMPLETED / FAILED. '
    'Replaces the original PENDING / GENERATING / COMPLETED / FAILED set, which did not '
    'match the EF write path. NB: requires the EF converter to emit UPPER_SNAKE.';

COMMENT ON COLUMN report.report.financial_year IS
    'Financial year label (e.g. "2025-26"). Widened to varchar(40) in migration 088: the '
    'GAP-043 chat-thread-PDF flow encodes a 36-char UUID thread id in this column by design '
    '(ChatThreadPdfGenerator / Reports.cs) to reuse the report job schema without bespoke DDL.';

-- =============================================================================
-- End 088_report_status_check_realign_and_fy_widen.sql
-- =============================================================================
