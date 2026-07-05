-- Migration 104: itr.computation_versions — versioned tax-computation history per filing.
-- DG-ITR-07: every ComputeTax call appends an immutable row here.
-- The filing entity already pins the LATEST snapshot in computation_jsonb;
-- this table preserves ALL prior versions for the admin CA panel (diff viewer + Restore).

BEGIN;

CREATE TABLE IF NOT EXISTS itr.computation_versions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id       UUID            NOT NULL REFERENCES itr.filings(id) ON DELETE CASCADE,
    version         INTEGER         NOT NULL,
    label           VARCHAR(200),
    actor_name      VARCHAR(200)    NOT NULL DEFAULT 'System',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    input_json      JSONB           NOT NULL DEFAULT '{}',
    result_json     JSONB           NOT NULL DEFAULT '{}',

    CONSTRAINT ux_computation_versions_filing_version UNIQUE (filing_id, version)
);

CREATE INDEX IF NOT EXISTS idx_computation_versions_filing_id
    ON itr.computation_versions (filing_id);

COMMENT ON TABLE itr.computation_versions IS
    'Immutable append-only history of every tax-computation run per filing. '
    'Supports the admin CA panel version diff viewer and Restore action (DG-ITR-07).';

COMMIT;
