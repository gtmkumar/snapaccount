-- =============================================================================
-- 071_accounting_mca_edit_log.sql
-- Phase 7 / GAP-100 (HIGH) — MCA statutory edit-log for books of account.
--
-- STATUTORY BASIS
--   Companies (Accounts) Rules, 2014 — Rule 3(5)/(6) (as amended by the
--   Companies (Accounts) Amendment Rules, 2021/2023): where books of account
--   are maintained in electronic mode, the software MUST record an edit log of
--   every CREATE / ALTER / DELETE to each transaction, the date such change was
--   made, and ensure the edit-log feature CANNOT be disabled. This is auditor-
--   reportable (CARO / audit-trail clause) and must be RETAINED for ≥ 8 years.
--
-- DESIGN GOALS
--   1. Append-only, per-transaction edit log (who / what / when / before / after).
--   2. NON-DISABLEABLE capture: row-level AFTER triggers live in the DB so the
--      log is written even if application code is bypassed (raw SQL, EF, psql).
--   3. IMMUTABLE at the DB level: BEFORE UPDATE/DELETE triggers RAISE for ALL
--      roles — including the table owner and any SUPER_ADMIN — because a Postgres
--      trigger is not skipped by table ownership (only a superuser deliberately
--      flipping session_replication_role='replica' could bypass it, which no app
--      role ever does). UPDATE/DELETE/TRUNCATE are additionally REVOKEd.
--   4. 8-year retention = KEEP. There is intentionally NO TTL / purge job; the
--      retention_until column documents the minimum keep-until date.
--
-- Capture is attached to the authoritative books-of-account tables:
--   accounting.journal_entry        (manual / batch double-entry header)
--   accounting.journal_entry_line   (debit/credit legs)
--   accounting.account              (chart of accounts)
--   accounting.ledger_entries       (OCR / posting-pipeline single-pair entries)
--
-- NOTE on "ledger" naming: the task names a `ledger_entry` table. The real
-- transaction tables are accounting.ledger_entries (above). accounting.ledger
-- holds DERIVED running balances (GENERATED closing_balance, period rollups),
-- not source transactions, so it is deliberately NOT captured — its rows are a
-- recomputable projection of the journal/ledger_entries, and logging them would
-- duplicate the authoritative entries. If a future posting path writes ledger
-- balances directly as source-of-truth, add it to the trigger list below.
--
-- Conventions: snake_case, UUID PK, idempotent (IF NOT EXISTS / guarded DO
-- blocks). Fully additive. No existing column is altered.
--
-- Depends on: 003_accounting_schema.sql, 016_accounting_posting_pipeline.sql,
--             000_init.sql (shared schema)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- accounting.edit_log  — append-only statutory audit trail
-- -----------------------------------------------------------------------------
-- Append-only by statute: there is NO updated_at and NO deleted_at column. A row,
-- once written, is frozen. created_at mirrors changed_at for audit-column
-- convention completeness. retention_until = changed_at + 8 years (KEEP-until).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.edit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID,                                   -- auth.organization.id (by value; NULL only if a row had no org column)
    entity_type     VARCHAR(50) NOT NULL
                        CHECK (entity_type IN (
                            'journal_entry','journal_entry_line',
                            'ledger_entry','account','ledger'
                        )),
    entity_id       UUID NOT NULL,                          -- PK of the changed row
    operation       VARCHAR(10) NOT NULL
                        CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    changed_by      UUID,                                   -- auth.user.id from app.current_user_id GUC; NULL when unset
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    before_state    JSONB,                                  -- to_jsonb(OLD); NULL on INSERT
    after_state     JSONB,                                  -- to_jsonb(NEW); NULL on DELETE
    change_reason   TEXT,                                   -- app.change_reason GUC, if supplied
    request_id      VARCHAR(128),                           -- app.request_id GUC
    correlation_id  VARCHAR(128),                           -- app.correlation_id GUC
    fy_year         VARCHAR(10),                            -- e.g. '2026-27'; best-effort from the row
    retention_until DATE,                                   -- changed_at::date + 8 years (statutory minimum KEEP)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_log_org_changed_at
    ON accounting.edit_log (org_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_edit_log_entity
    ON accounting.edit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_edit_log_org_fy
    ON accounting.edit_log (org_id, fy_year);
CREATE INDEX IF NOT EXISTS idx_edit_log_changed_by
    ON accounting.edit_log (changed_by) WHERE changed_by IS NOT NULL;

COMMENT ON TABLE accounting.edit_log IS
    'MCA Companies (Accounts) Rules statutory edit log for books of account. '
    'APPEND-ONLY + IMMUTABLE (enforced by triggers + REVOKE). Non-disableable: '
    'rows are written by DB-level AFTER triggers on the source tables. '
    'Retention: minimum 8 years (retention_until) — KEEP, never purge.';
COMMENT ON COLUMN accounting.edit_log.retention_until IS
    'Statutory KEEP-until date (changed_at + 8 years). No purge job exists; this '
    'documents the minimum retention, not an expiry.';

-- Defence-in-depth org isolation (consistent with the rest of accounting.*).
-- The app connects as schema owner (bypasses RLS); this is belt-and-braces only.
ALTER TABLE accounting.edit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'accounting' AND tablename = 'edit_log'
          AND policyname = 'edit_log_org_isolation'
    ) THEN
        CREATE POLICY edit_log_org_isolation ON accounting.edit_log
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

-- =============================================================================
-- IMMUTABILITY — reject any UPDATE or DELETE, for every role incl. owner.
-- =============================================================================
CREATE OR REPLACE FUNCTION accounting.reject_edit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'accounting.edit_log is append-only and immutable by statute (MCA '
        'Companies (Accounts) Rules audit trail). % is not permitted.', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_edit_log_no_update ON accounting.edit_log;
CREATE TRIGGER trg_edit_log_no_update
    BEFORE UPDATE ON accounting.edit_log
    FOR EACH ROW EXECUTE FUNCTION accounting.reject_edit_log_mutation();

DROP TRIGGER IF EXISTS trg_edit_log_no_delete ON accounting.edit_log;
CREATE TRIGGER trg_edit_log_no_delete
    BEFORE DELETE ON accounting.edit_log
    FOR EACH ROW EXECUTE FUNCTION accounting.reject_edit_log_mutation();

-- TRUNCATE bypasses row-level BEFORE DELETE triggers, so guard it separately.
DROP TRIGGER IF EXISTS trg_edit_log_no_truncate ON accounting.edit_log;
CREATE TRIGGER trg_edit_log_no_truncate
    BEFORE TRUNCATE ON accounting.edit_log
    FOR EACH STATEMENT EXECUTE FUNCTION accounting.reject_edit_log_mutation();

-- Hard-revoke mutation rights as defence-in-depth (the triggers are the real
-- guarantee; this stops accidental grants). PUBLIC + the app role.
REVOKE UPDATE, DELETE, TRUNCATE ON accounting.edit_log FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snapaccount_app') THEN
        -- App may INSERT (via triggers it never inserts directly, but keep SELECT/INSERT) + SELECT.
        REVOKE UPDATE, DELETE, TRUNCATE ON accounting.edit_log FROM snapaccount_app;
        GRANT  SELECT, INSERT ON accounting.edit_log TO snapaccount_app;
    END IF;
END $$;

-- =============================================================================
-- CAPTURE — generic AFTER INSERT/UPDATE/DELETE trigger function.
-- =============================================================================
-- Reads identity/context from app GUCs (set per-request by the backend via
-- set_config('app.current_user_id', ...)). All GUC reads use the missing_ok=TRUE
-- form so capture never fails when a context value is absent (e.g. a raw psql
-- session). org_id / entity_id / fy_year are resolved generically from the row's
-- jsonb so one function serves tables with differing column names
-- (organization_id vs org_id, financial_year vs fy_year).
-- =============================================================================
CREATE OR REPLACE FUNCTION accounting.capture_edit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity_type  VARCHAR(50) := TG_ARGV[0];
    v_row          JSONB;
    v_before       JSONB;
    v_after        JSONB;
    v_entity_id    UUID;
    v_org_id       UUID;
    v_changed_by   UUID;
    v_fy           VARCHAR(10);
    v_guc          TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_before := to_jsonb(OLD);
        v_after  := NULL;
        v_row    := v_before;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_before := to_jsonb(OLD);
        v_after  := to_jsonb(NEW);
        v_row    := v_after;
    ELSE  -- INSERT
        v_before := NULL;
        v_after  := to_jsonb(NEW);
        v_row    := v_after;
    END IF;

    -- entity id (PK)
    v_entity_id := (v_row ->> 'id')::UUID;

    -- org id: handle both column spellings
    v_org_id := NULLIF(COALESCE(v_row ->> 'organization_id', v_row ->> 'org_id'), '')::UUID;

    -- changed_by: prefer the request GUC, else fall back to the row's audit cols.
    v_guc := current_setting('app.current_user_id', TRUE);
    IF v_guc IS NOT NULL AND v_guc <> '' THEN
        BEGIN
            v_changed_by := v_guc::UUID;
        EXCEPTION WHEN others THEN
            v_changed_by := NULL;
        END;
    END IF;
    IF v_changed_by IS NULL THEN
        v_changed_by := NULLIF(COALESCE(
            v_row ->> 'updated_by', v_row ->> 'created_by',
            v_row ->> 'posted_by', v_row ->> 'reviewer_user_id'
        ), '')::UUID;
    END IF;

    -- fy_year: best-effort. financial_year is already 'YYYY-YY'. fy_year is an INT
    -- (e.g. 2026 => '2026-27'). Else derive from an entry_date / balance_date.
    IF (v_row ? 'financial_year') AND NULLIF(v_row ->> 'financial_year','') IS NOT NULL THEN
        v_fy := v_row ->> 'financial_year';                  -- already 'YYYY-YY'
    ELSIF (v_row ? 'fy_year') AND NULLIF(v_row ->> 'fy_year','') IS NOT NULL THEN
        -- fy_year is an INT start-year (e.g. 2026) -> '2026-27'
        v_fy := (v_row ->> 'fy_year') || '-' ||
                right((((v_row ->> 'fy_year')::INT + 1))::TEXT, 2);
    END IF;

    INSERT INTO accounting.edit_log (
        org_id, entity_type, entity_id, operation, changed_by, changed_at,
        before_state, after_state, change_reason, request_id, correlation_id,
        fy_year, retention_until
    ) VALUES (
        v_org_id,
        v_entity_type,
        v_entity_id,
        TG_OP,
        v_changed_by,
        clock_timestamp(),
        v_before,
        v_after,
        NULLIF(current_setting('app.change_reason',   TRUE), ''),
        NULLIF(current_setting('app.request_id',      TRUE), ''),
        NULLIF(current_setting('app.correlation_id',  TRUE), ''),
        v_fy,
        (clock_timestamp()::date + INTERVAL '8 years')::date
    );

    RETURN NULL;  -- AFTER trigger; return value ignored
END;
$$;

-- -----------------------------------------------------------------------------
-- Attach capture to the authoritative books-of-account tables.
-- One trigger per table; entity_type passed as a trigger argument.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_capture_edit_log ON accounting.journal_entry;
CREATE TRIGGER trg_capture_edit_log
    AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry
    FOR EACH ROW EXECUTE FUNCTION accounting.capture_edit_log('journal_entry');

DROP TRIGGER IF EXISTS trg_capture_edit_log ON accounting.journal_entry_line;
CREATE TRIGGER trg_capture_edit_log
    AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_line
    FOR EACH ROW EXECUTE FUNCTION accounting.capture_edit_log('journal_entry_line');

DROP TRIGGER IF EXISTS trg_capture_edit_log ON accounting.account;
CREATE TRIGGER trg_capture_edit_log
    AFTER INSERT OR UPDATE OR DELETE ON accounting.account
    FOR EACH ROW EXECUTE FUNCTION accounting.capture_edit_log('account');

DROP TRIGGER IF EXISTS trg_capture_edit_log ON accounting.ledger_entries;
CREATE TRIGGER trg_capture_edit_log
    AFTER INSERT OR UPDATE OR DELETE ON accounting.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION accounting.capture_edit_log('ledger_entry');

-- =============================================================================
-- End 071_accounting_mca_edit_log.sql
-- =============================================================================
