-- =============================================================================
-- 082_loan_fraud_checks.sql
-- GAP-110: Fraud pre-submission stage for LoanService
--
-- Creates:
--   loan.fraud_checks  — decision-log table, append-only
--   auth.permission   — inserts loan.fraud.view permission (operator tier)
--   auth.role_permission — grants to Operator role (live-join pattern)
--
-- ADDITIVE / IDEMPOTENT — safe to re-run.
-- UUID audit columns (id, created_by, updated_by) — never varchar (past bug class).
-- Depends on: 066_phase7_ef_reconciliation_additive.sql (loan schema exists)
-- =============================================================================

-- ── 1. loan.fraud_checks ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loan.fraud_checks (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    application_id UUID        NOT NULL
                               REFERENCES loan.applications(id) ON DELETE CASCADE,
    check_type     VARCHAR(50) NOT NULL,
    verdict        VARCHAR(20) NOT NULL,           -- PASS | FLAG | FAIL
    details        JSONB,                           -- aggregate counts only, no cross-org PII
    decision_note  VARCHAR(2000) NOT NULL DEFAULT '',
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- BaseAuditableEntity columns (uuid, not varchar — bug class from SEC-AI-02)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    created_by     UUID,
    updated_by     UUID
);

COMMENT ON TABLE loan.fraud_checks IS
    'GAP-110: Append-only fraud pre-submission decision log. '
    'Rows are immutable after creation. Verdict values: PASS, FLAG, FAIL. '
    'Details JSONB stores aggregate counts only — never raw PII from other orgs.';

COMMENT ON COLUMN loan.fraud_checks.check_type IS
    'Enum: DuplicatePan | DuplicatePhone | DuplicateDevice | VelocityPan | VelocityPhone | PennyDrop';

COMMENT ON COLUMN loan.fraud_checks.verdict IS
    'PASS = no signal. FLAG = soft signal (operator review note, submission allowed). '
    'FAIL = hard signal (submission blocked, HTTP 422).';

COMMENT ON COLUMN loan.fraud_checks.details IS
    'Structured details in JSONB. Aggregate counts only — e.g. { "other_org_count": 3 }. '
    'NEVER stores raw PAN/phone from other orgs.';

-- Indexes for fraud query patterns
CREATE INDEX IF NOT EXISTS ix_fraud_checks_application_id
    ON loan.fraud_checks (application_id);

CREATE INDEX IF NOT EXISTS ix_fraud_checks_check_type_verdict
    ON loan.fraud_checks (check_type, verdict);

CREATE INDEX IF NOT EXISTS ix_fraud_checks_checked_at
    ON loan.fraud_checks (checked_at);

-- GIN index for JSONB details (cross-org count queries via JsonContains)
CREATE INDEX IF NOT EXISTS ix_fraud_checks_details_gin
    ON loan.fraud_checks USING GIN (details);

-- ── 2. RLS: operator reads their own org's fraud checks via application FK ────
-- Fraud checks are org-scoped via loan.applications.org_id (JOIN path).
-- The RLS policy on loan.applications already protects cross-org leaks.
-- No additional RLS policy needed here — the IDOR check in the query handler
-- verifies application ownership before projecting fraud check rows.

-- ── 3. Permission: loan.fraud.view (operator tier) ───────────────────────────

INSERT INTO auth.permission (name, resource, action, description, created_at, updated_at)
SELECT
    'loan.fraud.view',
    'loan',
    'fraud.view',
    'View fraud pre-submission check results for loan applications',
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM auth.permission WHERE name = 'loan.fraud.view'
);

-- ── 4. Grant loan.fraud.view to the Operator role (live-join pattern) ─────────
-- Live-join pattern: INSERT … SELECT from role/permission tables.
-- No hardcoded UUIDs — always resolved at migration time.
-- Roles are system roles (organization_id IS NULL for system-level roles).

INSERT INTO auth.role_permission (role_id, permission_id, created_at, updated_at)
SELECT
    r.id,
    p.id,
    NOW(), NOW()
FROM auth.role r
CROSS JOIN auth.permission p
WHERE r.name IN ('ORG_ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER')
  AND r.organization_id IS NULL
  AND p.name = 'loan.fraud.view'
  AND NOT EXISTS (
    SELECT 1
    FROM auth.role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
