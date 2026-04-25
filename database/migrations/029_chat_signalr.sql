-- =============================================================================
-- 029_chat_signalr.sql
-- Phase 6F Track F2 — ChatService canonical schema (SignalR-backed)
--
-- Adds the canonical Phase-6F-onwards chat tables (plural names):
--   - chat.threads             (one row per conversation)
--   - chat.messages            (individual messages; GCS-only attachments)
--   - chat.thread_participants (composite PK: thread_id, user_id)
--   - chat.read_receipts       (per-user last-read pointer)
--   - chat.categories          (org-customizable category dictionary; seeded defaults)
--   - chat.routing_rules       (keyword -> target_role mapping for auto-routing)
--
-- Distinct from legacy 007_chat_schema.sql tables (chat.conversation,
-- chat.message, chat.message_attachment, etc.). Those legacy tables are kept
-- untouched (additive migration). Phase 6F backend reads/writes only the
-- new canonical plural tables. Legacy data migration is an ops task.
--
-- Ephemeral state (typing indicators, presence/online status) is INTENTIONALLY
-- NOT stored in Postgres. ChatService keeps it in Redis (devops handoff).
--
-- Attachments contract:
--   chat.messages.attachments_jsonb is a JSONB array of GCS URI metadata only.
--   Same shape as gst.notices.attachments_jsonb — see 021_gst_notices.sql.
--   Raw bytes belong in GCS, never in Postgres.
--
-- DPDP cascade for chat (regulated communication — chat with CAs is retained
-- 7 years for compliance):
--   - chat.messages.sender_user_id is anonymize-only on user erasure: set to
--     NULL, stamp anonymized_at + anonymization_reason='DPDP_USER_ERASURE'.
--     Body content preserved (regulated record).
--   - chat.thread_participants entry for the erased user is soft-deleted
--     (deleted_at stamped). Composite PK preserved for audit.
--   - chat.threads is retained until retention_until (7 years from
--     last_message_at by default).
--   - DELETE on chat.messages and chat.threads is BLOCKED by trigger.
--
-- RLS: org_id-scoped via auth.organization_member; CA participants can read
-- threads they are a participant of (via chat.thread_participants).
--
-- Idempotent. Additive. Depends on: 000_init.sql, 001_auth_schema.sql,
-- 007_chat_schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- chat.categories — org-customizable category dictionary
-- Seeded with the 6 default categories (GST, ITR, DOC, LOAN, BILLING, GENERAL).
-- org_id IS NULL => SnapAccount-wide default; org-specific overrides allowed.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID,                                    -- NULL = platform default
    code            VARCHAR(20) NOT NULL
                        CHECK (code IN ('GST','ITR','DOC','LOAN','BILLING','GENERAL')),
    display_name    VARCHAR(200) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_chat_categories_org_id   ON chat.categories (org_id);
CREATE INDEX IF NOT EXISTS idx_chat_categories_code     ON chat.categories (code);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_categories_updated_at') THEN
        CREATE TRIGGER trg_chat_categories_updated_at
            BEFORE UPDATE ON chat.categories
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- Seed platform-wide default categories (org_id IS NULL).
INSERT INTO chat.categories (org_id, code, display_name, description, sort_order)
VALUES
    (NULL, 'GST',     'GST Filing & Compliance', 'GSTR returns, ITC, e-invoicing, notices', 10),
    (NULL, 'ITR',     'Income Tax (ITR)',        'ITR-1..ITR-7 filing, refunds, e-verification', 20),
    (NULL, 'DOC',     'Documents & OCR',         'Invoice scanning, receipts, document review', 30),
    (NULL, 'LOAN',    'Business Loans',          'Loan eligibility, applications, partner banks', 40),
    (NULL, 'BILLING', 'Billing & Subscription',  'Plan changes, invoices, payment issues', 50),
    (NULL, 'GENERAL', 'General Help',            'General product questions and unrouted queries', 99)
ON CONFLICT (org_id, code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- chat.threads — one row per conversation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.threads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,                       -- auth.organization.id
    user_id             UUID NOT NULL,                       -- auth.user.id (the customer)
    category            VARCHAR(20) NOT NULL
                            CHECK (category IN ('GST','ITR','DOC','LOAN','BILLING','GENERAL')),
    subject             VARCHAR(500),
    assigned_ca_id      UUID,                                -- auth.user.id of assigned CA
    assigned_at         TIMESTAMPTZ,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','ASSIGNED','RESOLVED','CLOSED')),
    priority            VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
                            CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at     TIMESTAMPTZ,
    last_message_preview VARCHAR(500),
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID,
    closed_at           TIMESTAMPTZ,
    -- Reference linkage (optional): thread tied to a domain entity
    reference_type      VARCHAR(50),                         -- 'GST_RETURN','ITR_RETURN','LOAN_APPLICATION','DOCUMENT'
    reference_id        UUID,
    -- DPDP retention: 7 years from last_message_at (regulated CA communication)
    retention_until     DATE,
    -- DPDP anonymization scaffolding (anonymize-only; never hard-delete)
    anonymized_at       TIMESTAMPTZ,
    anonymized_by       UUID,
    anonymization_reason VARCHAR(200),
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

ALTER TABLE chat.threads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='chat' AND tablename='threads' AND policyname='chat_threads_org_isolation') THEN
        CREATE POLICY chat_threads_org_isolation ON chat.threads
            USING (
                org_id IN (
                    SELECT om.organization_id FROM auth.organization_member om
                    WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
                    UNION
                    SELECT o.id FROM auth.organization o
                    WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
                )
                OR user_id        = current_setting('app.current_user_id', TRUE)::UUID
                OR assigned_ca_id = current_setting('app.current_user_id', TRUE)::UUID
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_threads_updated_at') THEN
        CREATE TRIGGER trg_chat_threads_updated_at
            BEFORE UPDATE ON chat.threads
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- Block hard-deletes — DPDP/regulatory: anonymize-only.
CREATE OR REPLACE FUNCTION chat.threads_block_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'chat.threads cannot be hard-deleted (DPDP/regulated communication retention). Use soft-delete + anonymization instead.';
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_threads_block_delete') THEN
        CREATE TRIGGER trg_chat_threads_block_delete
            BEFORE DELETE ON chat.threads
            FOR EACH ROW EXECUTE FUNCTION chat.threads_block_delete();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- chat.messages — individual messages
-- attachments_jsonb: JSONB array of GCS URI metadata ONLY (no raw bytes).
-- Same shape as gst.notices.attachments_jsonb (P6-HANDOFF-14 contract):
--   { gcs_uri, filename, content_type, size_bytes, uploaded_at, uploaded_by }
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id           UUID NOT NULL REFERENCES chat.threads (id),
    sender_user_id      UUID,                                -- NULL after DPDP anonymization
    sender_role         VARCHAR(20) NOT NULL
                            CHECK (sender_role IN ('USER','CA','ADMIN','SYSTEM','AI')),
    body                TEXT,                                -- TEXT body; nullable when only attachments
    attachments_jsonb   JSONB NOT NULL DEFAULT '[]'::jsonb
                            CHECK (jsonb_typeof(attachments_jsonb) = 'array'),
    is_read_by_recipient BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at           TIMESTAMPTZ,
    -- Idempotency: client-generated key (mobile offline support; backend agent contract)
    client_message_id   UUID,
    -- DPDP anonymization scaffolding (anonymize-only; messages retained 7yr)
    anonymized_at       TIMESTAMPTZ,
    anonymized_by       UUID,
    anonymization_reason VARCHAR(200),
    -- Generated tsvector for full-text history search (English config; chat is mixed-language
    -- but English stemming is acceptable baseline; mobile/admin search uses ILIKE fallback for
    -- non-English chunks).
    body_tsvector       TSVECTOR GENERATED ALWAYS AS (
                            to_tsvector('english', COALESCE(body, ''))
                        ) STORED,
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (thread_id, client_message_id)
);

ALTER TABLE chat.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='chat' AND tablename='messages' AND policyname='chat_messages_isolation') THEN
        CREATE POLICY chat_messages_isolation ON chat.messages
            USING (thread_id IN (
                SELECT t.id FROM chat.threads t
                WHERE t.user_id        = current_setting('app.current_user_id', TRUE)::UUID
                   OR t.assigned_ca_id = current_setting('app.current_user_id', TRUE)::UUID
                   OR t.org_id IN (
                        SELECT om.organization_id FROM auth.organization_member om
                        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
                   )
            ));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_messages_updated_at') THEN
        CREATE TRIGGER trg_chat_messages_updated_at
            BEFORE UPDATE ON chat.messages
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION chat.messages_block_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'chat.messages cannot be hard-deleted (DPDP/regulated communication 7yr retention). Use anonymization instead.';
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_messages_block_delete') THEN
        CREATE TRIGGER trg_chat_messages_block_delete
            BEFORE DELETE ON chat.messages
            FOR EACH ROW EXECUTE FUNCTION chat.messages_block_delete();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- chat.thread_participants — composite PK (thread_id, user_id)
-- Roles: USER, CA, ADMIN, OBSERVER
-- Soft-delete (deleted_at) on DPDP user erasure; record kept for audit.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.thread_participants (
    thread_id       UUID NOT NULL REFERENCES chat.threads (id),
    user_id         UUID NOT NULL,
    role            VARCHAR(20) NOT NULL
                        CHECK (role IN ('USER','CA','ADMIN','OBSERVER')),
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by        UUID,
    -- Soft-delete + DPDP cascade
    deleted_at      TIMESTAMPTZ,
    anonymized_at   TIMESTAMPTZ,
    anonymization_reason VARCHAR(200),
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_participants_user_id ON chat.thread_participants (user_id) WHERE deleted_at IS NULL;

ALTER TABLE chat.thread_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='chat' AND tablename='thread_participants' AND policyname='chat_thread_participants_isolation') THEN
        CREATE POLICY chat_thread_participants_isolation ON chat.thread_participants
            USING (
                user_id = current_setting('app.current_user_id', TRUE)::UUID
                OR thread_id IN (
                    SELECT t.id FROM chat.threads t
                    WHERE t.user_id        = current_setting('app.current_user_id', TRUE)::UUID
                       OR t.assigned_ca_id = current_setting('app.current_user_id', TRUE)::UUID
                )
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- chat.read_receipts — per-user last-read pointer for unread-count math
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.read_receipts (
    thread_id           UUID NOT NULL REFERENCES chat.threads (id),
    user_id             UUID NOT NULL,
    last_read_message_id UUID REFERENCES chat.messages (id),
    last_read_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_read_receipts_user_id ON chat.read_receipts (user_id);

ALTER TABLE chat.read_receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='chat' AND tablename='read_receipts' AND policyname='chat_read_receipts_owner') THEN
        CREATE POLICY chat_read_receipts_owner ON chat.read_receipts
            USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_read_receipts_updated_at') THEN
        CREATE TRIGGER trg_chat_read_receipts_updated_at
            BEFORE UPDATE ON chat.read_receipts
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- chat.routing_rules — keyword pattern -> target_role mapping
-- ChatService caches this in memory at startup; refreshes on rule update event.
-- keyword_pattern is a Postgres POSIX regex (case-insensitive evaluated by app).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.routing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID,                                -- NULL = platform default
    category            VARCHAR(20) NOT NULL
                            CHECK (category IN ('GST','ITR','DOC','LOAN','BILLING','GENERAL')),
    keyword_pattern     TEXT NOT NULL,                       -- POSIX regex
    priority            SMALLINT NOT NULL DEFAULT 100,       -- lower = higher priority
    target_role         VARCHAR(20) NOT NULL
                            CHECK (target_role IN ('CA','ADMIN','OPS')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_chat_routing_rules_category ON chat.routing_rules (category, priority) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_routing_rules_org_id   ON chat.routing_rules (org_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_routing_rules_updated_at') THEN
        CREATE TRIGGER trg_chat_routing_rules_updated_at
            BEFORE UPDATE ON chat.routing_rules
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

-- Seed platform-wide default routing rules (org_id IS NULL).
INSERT INTO chat.routing_rules (org_id, category, keyword_pattern, priority, target_role, description)
VALUES
    (NULL, 'GST',     '(?i)(gstr|itc|e-invoice|gstin|notice|asmt|drc-01)', 10, 'CA',    'GST domain keywords -> CA'),
    (NULL, 'ITR',     '(?i)(itr|tax|refund|tds|26as|deduction|80c|80d)',  10, 'CA',    'ITR domain keywords -> CA'),
    (NULL, 'LOAN',    '(?i)(loan|emi|disburse|eligibility|partner bank)', 10, 'OPS',   'Loan keywords -> OPS'),
    (NULL, 'BILLING', '(?i)(invoice|payment|subscription|plan|refund)',   20, 'ADMIN', 'Billing keywords -> ADMIN'),
    (NULL, 'DOC',     '(?i)(scan|ocr|upload|invoice image|receipt)',      30, 'OPS',   'Document keywords -> OPS'),
    (NULL, 'GENERAL', '.*',                                               99, 'ADMIN', 'Catch-all -> ADMIN')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- End of 029_chat_signalr.sql
-- =============================================================================
