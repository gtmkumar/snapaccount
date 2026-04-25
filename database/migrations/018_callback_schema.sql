-- =============================================================================
-- 018_callback_schema.sql
-- Phase 6E — NEW `callback` schema (the 12th microservice: CallbackService).
--
-- Human-service callback system: users on mobile tap "Request Callback" and
-- a CA/Ops agent on admin picks it up, schedules, takes notes, completes.
--
-- Tables:
--   - callback.callbacks              (the request + state machine)
--   - callback.call_notes             (CA-authored notes per callback)
--   - callback.assignments_log        (audit of who was assigned when / by whom)
--   - callback.kpi_daily_snapshot     (MATERIALIZED VIEW — org-level KPIs)
--
-- RLS: every callback visible to its org + assigned CA only.
-- DPDP cascade: right-to-erasure must soft-delete call_notes and anonymize
--              callbacks.user_id after org erasure (same pattern as SEC-008).
--              Enforced at application layer; this migration provides the
--              soft-delete scaffolding (deleted_at) + anonymization_* columns.
--
-- Depends on: 000_init.sql (shared.set_updated_at), 001_auth_schema.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS callback;

-- -----------------------------------------------------------------------------
-- Enums — implemented as CHECK constraints + VARCHAR (consistent with the rest
-- of the codebase; avoids PG ENUM migration pain).
-- Categories:  GST | ITR | DOC | LOAN | BILLING | OTHER
-- Priority:    LOW | NORMAL | HIGH | URGENT
-- Status:      PENDING | SCHEDULED | IN_PROGRESS | COMPLETED
--              | FOLLOW_UP_NEEDED | ESCALATED_TO_CA | CANCELLED
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- callback.callbacks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS callback.callbacks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL,                    -- auth.organization.id
    user_id                 UUID,                             -- auth.user.id (nullable once DPDP-anonymized)
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    preferred_window        TSTZRANGE,                        -- user-suggested window
    category                VARCHAR(20) NOT NULL
                                CHECK (category IN ('GST','ITR','DOC','LOAN','BILLING','OTHER')),
    priority                VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
                                CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','SCHEDULED','IN_PROGRESS','COMPLETED',
                                    'FOLLOW_UP_NEEDED','ESCALATED_TO_CA','CANCELLED'
                                )),
    assigned_to             UUID,                             -- auth.user.id of CA/ops agent
    assigned_at             TIMESTAMPTZ,
    scheduled_at            TSTZRANGE,                        -- confirmed slot
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    cancellation_reason     TEXT,
    reason_text             TEXT,                             -- user's free-text reason
    linked_entity_type      VARCHAR(50),                      -- e.g. 'GST_RETURN','LOAN_APPLICATION','DOCUMENT'
    linked_entity_id        UUID,                             -- cross-schema reference by value
    sla_due_at              TIMESTAMPTZ,                      -- per-priority SLA target
    sla_breached            BOOLEAN NOT NULL DEFAULT FALSE,
    csat_score              SMALLINT CHECK (csat_score IS NULL OR csat_score BETWEEN 1 AND 5),
    csat_collected_at       TIMESTAMPTZ,
    -- DPDP anonymization
    anonymized_at           TIMESTAMPTZ,
    anonymization_reason    VARCHAR(100),
    -- Audit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_callbacks_org_id
    ON callback.callbacks (org_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_callbacks_user_id
    ON callback.callbacks (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callbacks_assigned_to
    ON callback.callbacks (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callbacks_status
    ON callback.callbacks (status, org_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_priority
    ON callback.callbacks (priority, status) WHERE status IN ('PENDING','SCHEDULED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_callbacks_sla_breach
    ON callback.callbacks (sla_due_at) WHERE sla_breached = FALSE AND status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_callbacks_category
    ON callback.callbacks (category, org_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_linked_entity
    ON callback.callbacks (linked_entity_type, linked_entity_id)
    WHERE linked_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callbacks_scheduled_at_gist
    ON callback.callbacks USING gist (scheduled_at) WHERE scheduled_at IS NOT NULL;

ALTER TABLE callback.callbacks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_callbacks_updated_at'
    ) THEN
        CREATE TRIGGER trg_callbacks_updated_at
            BEFORE UPDATE ON callback.callbacks
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- RLS: org-member visibility OR assigned CA visibility.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'callback' AND tablename = 'callbacks'
          AND policyname = 'callbacks_org_or_assignee_isolation'
    ) THEN
        CREATE POLICY callbacks_org_or_assignee_isolation ON callback.callbacks
            USING (
                -- Assigned CA/ops agent can always see the row
                assigned_to = current_setting('app.current_user_id', TRUE)::UUID
                OR
                -- Owner of the requesting org or active member can see
                org_id IN (
                    SELECT om.organization_id FROM auth.organization_member om
                    WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                      AND om.is_active = TRUE
                    UNION
                    SELECT o.id FROM auth.organization o
                    WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
                )
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- callback.call_notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS callback.call_notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    callback_id         UUID NOT NULL REFERENCES callback.callbacks (id) ON DELETE CASCADE,
    author_id           UUID NOT NULL,                        -- auth.user.id
    body                TEXT NOT NULL,
    outcome             VARCHAR(50),                          -- e.g. 'RESOLVED','NEEDS_FOLLOW_UP','NO_ANSWER'
    duration_minutes    SMALLINT CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visibility          VARCHAR(20) NOT NULL DEFAULT 'INTERNAL'
                            CHECK (visibility IN ('INTERNAL','USER_VISIBLE')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_call_notes_callback_id
    ON callback.call_notes (callback_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_notes_author_id
    ON callback.call_notes (author_id);

ALTER TABLE callback.call_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_call_notes_updated_at'
    ) THEN
        CREATE TRIGGER trg_call_notes_updated_at
            BEFORE UPDATE ON callback.call_notes
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- Inherit RLS from parent callback: visible if the parent callback is visible.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'callback' AND tablename = 'call_notes'
          AND policyname = 'call_notes_parent_isolation'
    ) THEN
        CREATE POLICY call_notes_parent_isolation ON callback.call_notes
            USING (
                callback_id IN (
                    SELECT c.id FROM callback.callbacks c
                    WHERE c.assigned_to = current_setting('app.current_user_id', TRUE)::UUID
                       OR c.org_id IN (
                           SELECT om.organization_id FROM auth.organization_member om
                           WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                             AND om.is_active = TRUE
                           UNION
                           SELECT o.id FROM auth.organization o
                           WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
                       )
                )
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- callback.assignments_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS callback.assignments_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    callback_id         UUID NOT NULL REFERENCES callback.callbacks (id) ON DELETE CASCADE,
    from_user_id        UUID,                                 -- previous assignee (null on first assignment)
    to_user_id          UUID NOT NULL,
    assigned_by         UUID NOT NULL,                        -- who performed the assignment
    reason              TEXT,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_assignments_log_callback_id
    ON callback.assignments_log (callback_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_log_to_user_id
    ON callback.assignments_log (to_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_log_assigned_by
    ON callback.assignments_log (assigned_by);

ALTER TABLE callback.assignments_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assignments_log_updated_at'
    ) THEN
        CREATE TRIGGER trg_assignments_log_updated_at
            BEFORE UPDATE ON callback.assignments_log
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'callback' AND tablename = 'assignments_log'
          AND policyname = 'assignments_log_parent_isolation'
    ) THEN
        CREATE POLICY assignments_log_parent_isolation ON callback.assignments_log
            USING (
                callback_id IN (
                    SELECT c.id FROM callback.callbacks c
                    WHERE c.assigned_to = current_setting('app.current_user_id', TRUE)::UUID
                       OR c.org_id IN (
                           SELECT om.organization_id FROM auth.organization_member om
                           WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                             AND om.is_active = TRUE
                           UNION
                           SELECT o.id FROM auth.organization o
                           WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
                       )
                )
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- callback.kpi_daily_snapshot  (MATERIALIZED VIEW)
-- -----------------------------------------------------------------------------
-- Per-org daily rollup: count by status, avg time-to-resolution,
-- SLA-breach count, avg CSAT. Refreshed by a scheduled Hangfire /
-- Cloud Scheduler job (ownership: NotificationService / CallbackService
-- deploy — coordinated with devops-engineer). CONCURRENTLY requires a
-- unique index — (org_id, snapshot_date) is the natural key.
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS callback.kpi_daily_snapshot AS
SELECT
    c.org_id,
    date_trunc('day', c.requested_at AT TIME ZONE 'Asia/Kolkata')::date AS snapshot_date,
    COUNT(*) FILTER (WHERE c.status = 'PENDING')           AS count_pending,
    COUNT(*) FILTER (WHERE c.status = 'SCHEDULED')         AS count_scheduled,
    COUNT(*) FILTER (WHERE c.status = 'IN_PROGRESS')       AS count_in_progress,
    COUNT(*) FILTER (WHERE c.status = 'COMPLETED')         AS count_completed,
    COUNT(*) FILTER (WHERE c.status = 'CANCELLED')         AS count_cancelled,
    COUNT(*) FILTER (WHERE c.status = 'ESCALATED_TO_CA')   AS count_escalated,
    COUNT(*) FILTER (WHERE c.sla_breached = TRUE)          AS count_sla_breached,
    AVG(EXTRACT(EPOCH FROM (c.completed_at - c.requested_at)) / 60.0)
        FILTER (WHERE c.status = 'COMPLETED')              AS avg_ttr_minutes,
    AVG(c.csat_score) FILTER (WHERE c.csat_score IS NOT NULL) AS avg_csat,
    COUNT(*) AS total_requested
FROM callback.callbacks c
WHERE c.deleted_at IS NULL
GROUP BY c.org_id, date_trunc('day', c.requested_at AT TIME ZONE 'Asia/Kolkata');

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_daily_snapshot_org_date
    ON callback.kpi_daily_snapshot (org_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_kpi_daily_snapshot_date
    ON callback.kpi_daily_snapshot (snapshot_date);

-- Note: Materialized views in Postgres do NOT support RLS directly. The
-- backing table (callback.callbacks) enforces RLS. Reads of the MV should
-- be proxied through an API that filters by org_id using the caller's
-- identity, OR consumers should query a SECURITY INVOKER function wrapper.
-- (Security-reviewer: please confirm the chosen pattern in 6E security review.)

-- =============================================================================
-- End 018_callback_schema.sql
-- =============================================================================
