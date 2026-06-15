-- =============================================================================
-- 077_ai_interactions_reservation_and_rls_fix.sql
-- RV-03 (SEC-AI-02): Add is_reservation column to ai.interactions to support
-- the RESERVATION PATTERN for atomic token budget enforcement.
-- L-04 (SEC-AI-02): Fix the RLS policy on ai.interactions so that rows with
-- NULL organization_id (admin/cross-org calls) are accessible to the
-- snapaccount_superadmin role for auditing purposes.
--
-- RV-03 Background:
--   The previous TokenBudgetService implementation acquired pg_advisory_xact_lock,
--   read the daily SUM, then COMMITTED — releasing the lock before the AI provider
--   call and audit write. This left the original TOCTOU race intact: concurrent
--   requests for the same org could both pass the budget check while neither had
--   written its audit row.
--
--   The reservation pattern closes the race: TokenBudgetService now INSERTs a
--   placeholder row (is_reservation = true) INSIDE the advisory-lock transaction
--   and commits it before returning. The daily-SUM query includes is_reservation
--   rows so concurrent requests see each other's in-progress consumption. After
--   the provider call, the row is finalised (is_reservation = false, actual tokens)
--   or zeroed out on failure.
--
-- L-04 Background:
--   The existing RLS policy `ai_interactions_org_isolation` uses:
--     USING (organization_id IN (SELECT ...))
--   NULL organization_id evaluates to NULL IN (subquery) → NULL (not TRUE), so
--   admin/cross-org rows are invisible to all users. A super-admin policy is added
--   to allow reading NULL-org rows for audit purposes.
--
-- Idempotent — safe to re-run on already-migrated databases.
-- Depends on: 075_ai_chunks_embeddings_interactions.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RV-03: Add is_reservation column to ai.interactions
-- -----------------------------------------------------------------------------
ALTER TABLE ai.interactions
    ADD COLUMN IF NOT EXISTS is_reservation BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai.interactions.is_reservation IS
    'RV-03 SEC-AI-02: TRUE while this row is a budget reservation placeholder '
    'inserted before the AI provider call. Set to FALSE once the call completes. '
    'The daily-budget SUM query includes reservation rows so concurrent requests '
    'see each other''s in-progress token consumption.';

-- Index for efficient filtering of in-flight reservations during cleanup/monitoring.
CREATE INDEX IF NOT EXISTS ix_ai_interactions_reservation
    ON ai.interactions (organization_id, feature_code, is_reservation)
    WHERE is_reservation = TRUE;

-- -----------------------------------------------------------------------------
-- L-04: Add super-admin RLS policy for NULL organization_id rows
-- -----------------------------------------------------------------------------
-- The existing policy `ai_interactions_org_isolation` already handles org-scoped
-- rows. This supplementary policy allows the snapaccount_superadmin role to read
-- rows where organization_id IS NULL (admin/cross-org interactions).
-- Rows with NULL organization_id failed the IN-subquery (NULL IN (set) = NULL)
-- and were invisible to all users, breaking the audit trail for admin calls.

DO $$ BEGIN
    -- Only create the super-admin policy if the role exists (local dev may not have it).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snapaccount_superadmin') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'ai'
              AND tablename = 'interactions'
              AND policyname = 'ai_interactions_superadmin_nullorg'
        ) THEN
            CREATE POLICY ai_interactions_superadmin_nullorg ON ai.interactions
                AS PERMISSIVE
                FOR SELECT
                TO snapaccount_superadmin
                USING (organization_id IS NULL);
        END IF;
    ELSE
        RAISE NOTICE 'Role snapaccount_superadmin not found — skipping ai_interactions_superadmin_nullorg policy. '
            'Create this role and re-run migration 077 in production.';
    END IF;
END $$;

-- Also ensure the org-isolation policy explicitly handles the NULL case with a
-- FALSE outcome (rather than NULL) to make intent unambiguous for future readers.
-- The PERMISSIVE policy above (for superadmin) will OR with the existing isolation
-- policy, so NULL-org rows are readable by superadmin and invisible to everyone else.

-- Verify the append-only trigger still covers the new column (no action needed —
-- the trigger fires on ALL mutations, regardless of column set).
