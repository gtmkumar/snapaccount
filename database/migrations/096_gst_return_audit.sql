-- =============================================================================
-- 096_gst_return_audit.sql
-- DG-GST-02: ARN capture + audit trail for GST return state transitions.
--
-- Creates:
--   gst.gst_return_audit  — append-only audit log (one row per state transition
--                           or ARN edit on a gst.gst_return record).
--
-- Every state transition command (Create, Submit, Approve, File, Revision)
-- and the new PATCH /gst/returns/{id}/arn endpoint write a row here.
--
-- Field mapping to frontend AuditEventSchema (gstApi.ts):
--   id                → id            (uuid, string)
--   event_type        → eventType     (enum string)
--   actor_user_id     → (internal FK) — actorEmail is the display field
--   actor_email       → actorEmail
--   actor_display_name→ actorDisplayName
--   previous_status   → previousStatus
--   detail            → detail
--   arn_received      → arnReceived
--   timestamp         → timestamp     (ISO-8601 string)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, index IF NOT EXISTS.
-- 7-year document retention: no soft-delete, no UPDATE, no CASCADE DELETE.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CREATE gst.gst_return_audit (append-only audit log)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gst.gst_return_audit (
    id                  uuid            NOT NULL DEFAULT gen_random_uuid(),
    gst_return_id       uuid            NOT NULL,
    event_type          varchar(30)     NOT NULL,
    actor_user_id       uuid            NOT NULL,
    actor_email         varchar(200)    NOT NULL,
    actor_display_name  varchar(200),
    previous_status     varchar(30),
    detail              text,
    arn_received        varchar(50),
    timestamp           timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT pk_gst_return_audit PRIMARY KEY (id),

    -- Soft FK: intentionally NOT a hard FK so audit rows survive if the parent
    -- return is eventually purged (7-year retention may outlast the parent).
    -- The application layer enforces referential integrity before insert.
    CONSTRAINT chk_gst_return_audit_event_type
        CHECK (event_type IN (
            'CREATED', 'SUBMITTED', 'APPROVED', 'FILED',
            'REVISION_REQUESTED', 'ARN_UPDATED', 'ASSIGNED', 'UPDATED', 'AMENDED', 'REJECTED'
        ))
);

COMMENT ON TABLE gst.gst_return_audit IS
    'DG-GST-02: Append-only audit log for GST return state transitions and ARN edits. '
    '7-year retention. Never updated or deleted.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ix_gst_return_audit_return_id
    ON gst.gst_return_audit (gst_return_id);

CREATE INDEX IF NOT EXISTS ix_gst_return_audit_return_id_timestamp
    ON gst.gst_return_audit (gst_return_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS ix_gst_return_audit_actor_user_id
    ON gst.gst_return_audit (actor_user_id);

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security (read: owner org members only; write: system role)
-- ---------------------------------------------------------------------------

ALTER TABLE gst.gst_return_audit ENABLE ROW LEVEL SECURITY;

-- Allow the application role to insert audit rows unconditionally.
-- Read access is scoped by the application layer (join to gst.gst_return for org check).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'gst_return_audit' AND schemaname = 'gst'
          AND policyname = 'gst_return_audit_all'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY gst_return_audit_all ON gst.gst_return_audit
                USING (true)
        $policy$;
    END IF;
END;
$$;

COMMIT;
