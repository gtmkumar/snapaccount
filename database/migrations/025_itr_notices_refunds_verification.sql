-- =============================================================================
-- 025_itr_notices_refunds_verification.sql
-- Phase 6D — ITR Engine (additive)
-- Adds: itr.notices (DPDP-aware, parallel to gst.notices), itr.refund_status_log,
-- itr.verification_queue (CA review state on a filing).
-- Depends on: 000_init.sql, 006_itr_schema.sql, 024_itr_assessee_filings.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- itr.notices
-- Income-tax notices (parallel to gst.notices). The legacy itr.itr_notice
-- table is preserved; new code targets itr.notices for the Phase 6D unified
-- notice tracker.
-- DPDP cascade: notice attachments may contain PAN, TAN, AO codes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.notices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    filing_id           UUID REFERENCES itr.filings (id),
    ay                  TEXT NOT NULL,
    notice_section      VARCHAR(40) NOT NULL,                   -- '143(1)','139(9)','143(2)','156','148','245', etc.
    notice_type         VARCHAR(80),                            -- INTIMATION / DEFECTIVE / SCRUTINY / DEMAND / REASSESSMENT / ADJUSTMENT
    notice_number       VARCHAR(120),                           -- DIN
    issued_date         DATE NOT NULL,
    received_date       DATE,
    due_date            DATE,
    demand_amount       NUMERIC(20,2),
    description         TEXT,
    notice_document_id  UUID,                                   -- document.document.id of inbound notice PDF
    response_document_id UUID,                                  -- document.document.id of response submitted

    -- Workflow
    status              VARCHAR(40) NOT NULL DEFAULT 'RECEIVED'
                            CHECK (status IN (
                                'RECEIVED','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS',
                                'RESPONSE_DRAFTED','RESPONSE_FILED','RESOLVED','APPEALED','CLOSED'
                            )),
    assigned_to         UUID,                                   -- CA user_id
    priority            VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                            CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    responded_at        TIMESTAMPTZ,
    responded_by        UUID,
    resolution_notes    TEXT,

    -- DPDP / retention
    consent_given_at    TIMESTAMPTZ,
    consent_withdrawn_at TIMESTAMPTZ,
    anonymized_at       TIMESTAMPTZ,
    anonymization_reason TEXT,
    retention_until     DATE,                                   -- AY end + 7 yrs minimum

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_itr_notices_user_id      ON itr.notices (user_id);
CREATE INDEX IF NOT EXISTS idx_itr_notices_filing_id    ON itr.notices (filing_id) WHERE filing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itr_notices_status       ON itr.notices (status);
CREATE INDEX IF NOT EXISTS idx_itr_notices_assigned_to  ON itr.notices (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_itr_notices_due_date     ON itr.notices (due_date) WHERE status NOT IN ('RESOLVED','CLOSED','APPEALED');
CREATE INDEX IF NOT EXISTS idx_itr_notices_ay           ON itr.notices (ay);
CREATE INDEX IF NOT EXISTS idx_itr_notices_notice_no    ON itr.notices (notice_number) WHERE notice_number IS NOT NULL;

ALTER TABLE itr.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itr_notices_user_isolation ON itr.notices;
CREATE POLICY itr_notices_user_isolation ON itr.notices
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
        OR assigned_to = current_setting('app.current_user_id', TRUE)::UUID
    );

DROP TRIGGER IF EXISTS trg_itr_notices_updated_at ON itr.notices;
CREATE TRIGGER trg_itr_notices_updated_at
    BEFORE UPDATE ON itr.notices
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.notices IS
    'IT notices unified table (Phase 6D). DPDP cascade: anonymize on user erasure (set user_id=NULL, anonymized_at=NOW()).';

-- -----------------------------------------------------------------------------
-- itr.refund_status_log
-- Append-only log of refund status transitions per filing.
-- Polled by background job (Cloud Scheduler) or manually updated by CA.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.refund_status_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id           UUID NOT NULL REFERENCES itr.filings (id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    status_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    status              VARCHAR(40) NOT NULL CHECK (status IN (
                            'NOT_DETERMINED',
                            'DETERMINED',
                            'DISPATCHED',
                            'CREDITED',
                            'FAILED',
                            'ADJUSTED',
                            'RETURNED',
                            'PENDING_BANK_VALIDATION'
                        )),
    amount              NUMERIC(20,2),
    reference_no        VARCHAR(120),                           -- Refund sequence / RBI ref / bank UTR
    bank_account_masked VARCHAR(40),                             -- Last-4 masked
    failure_reason      TEXT,
    source              VARCHAR(40) NOT NULL DEFAULT 'MANUAL'
                            CHECK (source IN ('MANUAL','POLL_API','WEBHOOK','CA_ENTRY')),
    raw_payload_jsonb   JSONB,                                   -- Original API/webhook payload for replay
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_refund_status_log_filing_id  ON itr.refund_status_log (filing_id);
CREATE INDEX IF NOT EXISTS idx_refund_status_log_user_id    ON itr.refund_status_log (user_id);
CREATE INDEX IF NOT EXISTS idx_refund_status_log_status     ON itr.refund_status_log (status);
CREATE INDEX IF NOT EXISTS idx_refund_status_log_filing_date ON itr.refund_status_log (filing_id, status_date DESC);

ALTER TABLE itr.refund_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_status_log_user_isolation ON itr.refund_status_log;
CREATE POLICY refund_status_log_user_isolation ON itr.refund_status_log
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

DROP TRIGGER IF EXISTS trg_refund_status_log_updated_at ON itr.refund_status_log;
CREATE TRIGGER trg_refund_status_log_updated_at
    BEFORE UPDATE ON itr.refund_status_log
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.refund_status_log IS
    'Append-only refund status transitions per filing. Latest row by (filing_id, status_date) is current.';

-- -----------------------------------------------------------------------------
-- itr.verification_queue
-- CA review state per filing — drives the admin Verification Queue page.
-- One row per (filing_id, queue_round). New rounds inserted on rejection/resubmit.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itr.verification_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id           UUID NOT NULL REFERENCES itr.filings (id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    queue_round         SMALLINT NOT NULL DEFAULT 1,            -- Increments on resubmit
    queue_status        VARCHAR(40) NOT NULL DEFAULT 'PENDING'
                            CHECK (queue_status IN (
                                'PENDING','ASSIGNED','IN_REVIEW','APPROVED','REJECTED','ESCALATED','CANCELLED'
                            )),
    priority            VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                            CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    sla_due_at          TIMESTAMPTZ,
    sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to         UUID,                                   -- CA user_id
    assigned_at         TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    decision            VARCHAR(20) CHECK (decision IN ('APPROVE','REJECT','ESCALATE')),
    decision_notes      TEXT,
    adjustments_jsonb   JSONB,                                   -- Inline edits CA proposed (deductions, regime, etc.)
    escalated_to        UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    CONSTRAINT uq_verification_queue_filing_round UNIQUE (filing_id, queue_round)
);

CREATE INDEX IF NOT EXISTS idx_verification_queue_filing_id   ON itr.verification_queue (filing_id);
CREATE INDEX IF NOT EXISTS idx_verification_queue_user_id     ON itr.verification_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_verification_queue_status      ON itr.verification_queue (queue_status);
CREATE INDEX IF NOT EXISTS idx_verification_queue_assigned_to ON itr.verification_queue (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_queue_sla         ON itr.verification_queue (sla_due_at)
    WHERE sla_breached = FALSE AND queue_status NOT IN ('APPROVED','REJECTED','CANCELLED');

ALTER TABLE itr.verification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verification_queue_isolation ON itr.verification_queue;
CREATE POLICY verification_queue_isolation ON itr.verification_queue
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
        OR assigned_to = current_setting('app.current_user_id', TRUE)::UUID
        OR escalated_to = current_setting('app.current_user_id', TRUE)::UUID
    );

DROP TRIGGER IF EXISTS trg_verification_queue_updated_at ON itr.verification_queue;
CREATE TRIGGER trg_verification_queue_updated_at
    BEFORE UPDATE ON itr.verification_queue
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

COMMENT ON TABLE itr.verification_queue IS
    'CA review queue for ITR filings. New (filing_id, queue_round) row inserted on each resubmit.';

-- =============================================================================
-- End 025_itr_notices_refunds_verification.sql
-- =============================================================================
