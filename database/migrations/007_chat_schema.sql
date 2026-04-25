-- =============================================================================
-- 007_chat_schema.sql
-- Chat Service — Expert Chat, CA Consultation, Appointments
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS chat;

-- =============================================================================
-- chat.ca_profile
-- Chartered Accountant profile within the platform
-- =============================================================================
CREATE TABLE chat.ca_profile (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE,         -- auth.user.id
    display_name        VARCHAR(300) NOT NULL,
    icai_membership_number VARCHAR(50),
    specializations     TEXT[],                       -- ['GST','ITR','AUDIT','CORPORATE']
    languages           TEXT[],                       -- ['en','hi','ta']
    bio                 TEXT,
    profile_photo_url   TEXT,
    experience_years    SMALLINT,
    is_available        BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    average_rating      NUMERIC(3,2),
    total_ratings       INTEGER NOT NULL DEFAULT 0,
    total_sessions      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_ca_profile_user_id ON chat.ca_profile (user_id);
CREATE INDEX idx_ca_profile_is_available ON chat.ca_profile (is_available) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_ca_profile_updated_at
    BEFORE UPDATE ON chat.ca_profile
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.chat_query
-- Query category/routing information
-- =============================================================================
CREATE TABLE chat.chat_query (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(50) NOT NULL
                        CHECK (category IN ('GST','ITR','COMPLIANCE','LOANS','GENERAL','AI_CHAT')),
    display_name    VARCHAR(200) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_chat_query_category ON chat.chat_query (category);

CREATE TRIGGER trg_chat_query_updated_at
    BEFORE UPDATE ON chat.chat_query
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.conversation
-- A chat session between a user and a CA (or AI)
-- =============================================================================
CREATE TABLE chat.conversation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,               -- auth.user.id (the customer)
    ca_user_id          UUID,                        -- auth.user.id (CA assigned)
    organization_id     UUID,
    query_category      VARCHAR(50),
    title               VARCHAR(500),
    status              VARCHAR(30) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','AI_HANDLING','CA_ASSIGNED','RESOLVED','CLOSED','ARCHIVED')),
    is_ai_handled       BOOLEAN NOT NULL DEFAULT FALSE,
    ai_handoff_at       TIMESTAMPTZ,                 -- Time AI escalated to CA
    last_message_at     TIMESTAMPTZ,
    last_message_preview VARCHAR(500),
    unread_user_count   INTEGER NOT NULL DEFAULT 0,
    unread_ca_count     INTEGER NOT NULL DEFAULT 0,
    reference_type      VARCHAR(50),                 -- 'GST_RETURN', 'ITR_RETURN', etc.
    reference_id        UUID,
    is_pinned           BOOLEAN NOT NULL DEFAULT FALSE,
    is_bookmarked       BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_conversation_user_id ON chat.conversation (user_id);
CREATE INDEX idx_conversation_ca_user_id ON chat.conversation (ca_user_id) WHERE ca_user_id IS NOT NULL;
CREATE INDEX idx_conversation_status ON chat.conversation (status);
CREATE INDEX idx_conversation_last_message_at ON chat.conversation (last_message_at);

ALTER TABLE chat.conversation ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_conversation_updated_at
    BEFORE UPDATE ON chat.conversation
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.message
-- Individual messages within a conversation
-- =============================================================================
CREATE TABLE chat.message (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES chat.conversation (id) ON DELETE CASCADE,
    sender_user_id      UUID NOT NULL,               -- auth.user.id
    sender_type         VARCHAR(20) NOT NULL CHECK (sender_type IN ('USER','CA','AI','SYSTEM')),
    message_type        VARCHAR(30) NOT NULL DEFAULT 'TEXT'
                            CHECK (message_type IN ('TEXT','IMAGE','PDF','DOCUMENT','SYSTEM_NOTE')),
    content             TEXT,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    is_edited           BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at           TIMESTAMPTZ,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at_message  TIMESTAMPTZ,                 -- Soft-delete for message content only
    metadata            JSONB,                       -- Typing indicators, reactions etc.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_message_conversation_id ON chat.message (conversation_id, created_at);
CREATE INDEX idx_message_sender_user_id ON chat.message (sender_user_id);
CREATE INDEX idx_message_is_read ON chat.message (conversation_id, is_read) WHERE is_read = FALSE;

ALTER TABLE chat.message ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_message_updated_at
    BEFORE UPDATE ON chat.message
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.message_attachment
-- Files attached to chat messages
-- =============================================================================
CREATE TABLE chat.message_attachment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES chat.message (id) ON DELETE CASCADE,
    file_name       VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT,
    storage_path    TEXT NOT NULL,
    thumbnail_path  TEXT,
    is_encrypted    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_message_attachment_message_id ON chat.message_attachment (message_id);

CREATE TRIGGER trg_message_attachment_updated_at
    BEFORE UPDATE ON chat.message_attachment
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.appointment_slot
-- Available slots for CA consultations
-- =============================================================================
CREATE TABLE chat.appointment_slot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ca_profile_id   UUID NOT NULL REFERENCES chat.ca_profile (id) ON DELETE CASCADE,
    slot_date       DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    duration_minutes SMALLINT NOT NULL DEFAULT 30,
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    is_recurring    BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_appointment_slot_ca_id ON chat.appointment_slot (ca_profile_id);
CREATE INDEX idx_appointment_slot_date ON chat.appointment_slot (slot_date, is_available);

CREATE TRIGGER trg_appointment_slot_updated_at
    BEFORE UPDATE ON chat.appointment_slot
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.appointment
-- Booked video consultation appointments
-- =============================================================================
CREATE TABLE chat.appointment (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    ca_profile_id       UUID NOT NULL REFERENCES chat.ca_profile (id),
    slot_id             UUID REFERENCES chat.appointment_slot (id),
    conversation_id     UUID REFERENCES chat.conversation (id),
    appointment_date    DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    meeting_type        VARCHAR(20) NOT NULL DEFAULT 'VIDEO'
                            CHECK (meeting_type IN ('VIDEO','AUDIO','CHAT')),
    meeting_platform    VARCHAR(30) CHECK (meeting_platform IN ('GOOGLE_MEET','ZOOM','PLATFORM_CHAT')),
    meeting_link        TEXT,
    meeting_id          VARCHAR(200),
    topic               TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
                            CHECK (status IN (
                                'SCHEDULED','CONFIRMED','IN_PROGRESS',
                                'COMPLETED','CANCELLED','NO_SHOW'
                            )),
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancelled_by        UUID,
    actual_duration_minutes SMALLINT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_appointment_user_id ON chat.appointment (user_id);
CREATE INDEX idx_appointment_ca_profile_id ON chat.appointment (ca_profile_id);
CREATE INDEX idx_appointment_date ON chat.appointment (appointment_date);
CREATE INDEX idx_appointment_status ON chat.appointment (status);

ALTER TABLE chat.appointment ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_appointment_updated_at
    BEFORE UPDATE ON chat.appointment
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- chat.ca_rating
-- User ratings and reviews for CA consultations
-- =============================================================================
CREATE TABLE chat.ca_rating (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    ca_profile_id       UUID NOT NULL REFERENCES chat.ca_profile (id),
    appointment_id      UUID REFERENCES chat.appointment (id),
    conversation_id     UUID REFERENCES chat.conversation (id),
    rating              NUMERIC(3,2) NOT NULL CHECK (rating BETWEEN 1.0 AND 5.0),
    review_text         TEXT,
    is_published        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (user_id, appointment_id)
);

CREATE INDEX idx_ca_rating_ca_profile_id ON chat.ca_rating (ca_profile_id);
CREATE INDEX idx_ca_rating_user_id ON chat.ca_rating (user_id);

ALTER TABLE chat.ca_rating ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ca_rating_updated_at
    BEFORE UPDATE ON chat.ca_rating
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY conversation_isolation ON chat.conversation
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR ca_user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY message_isolation ON chat.message
    USING (conversation_id IN (
        SELECT id FROM chat.conversation
        WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR ca_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY appointment_isolation ON chat.appointment
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR ca_profile_id IN (
               SELECT id FROM chat.ca_profile
               WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
           ));

CREATE POLICY ca_rating_isolation ON chat.ca_rating
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR ca_profile_id IN (
               SELECT id FROM chat.ca_profile
               WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
           ));
