-- =============================================================================
-- 031_itr_grievances.sql
-- P6-HANDOFF-23 — itr.grievances table backing POST /itr/grievances and
-- GET /itr/grievances?filingId. Mobile already calls these endpoints; backend
-- did not previously have storage.
--
-- Status enum modeled as VARCHAR + CHECK (matches notice/filing convention).
-- Idempotent. Additive. Follows project conventions: snake_case columns, UUID
-- PKs, created_at/updated_at/deleted_at, FK indexes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS itr.grievances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id           UUID NOT NULL REFERENCES itr.filings(id),
    assessee_id         UUID NOT NULL REFERENCES itr.assessee_profiles(id),
    raised_by_user_id   UUID NOT NULL,
    subject             VARCHAR(200) NOT NULL,
    body                VARCHAR(5000) NOT NULL,
    category            VARCHAR(60) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    assigned_to         UUID NULL,
    response            VARCHAR(5000) NULL,
    resolved_at         TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ NULL,
    created_by          UUID NULL,
    last_modified_by    UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_itr_grievances_filing_id
    ON itr.grievances (filing_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_itr_grievances_assessee_id
    ON itr.grievances (assessee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_itr_grievances_status
    ON itr.grievances (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_itr_grievances_assigned_to
    ON itr.grievances (assigned_to) WHERE assigned_to IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE itr.grievances IS
    'P6-HANDOFF-23: Assessee-raised grievances against an ITR filing. Backs POST/GET /itr/grievances.';
