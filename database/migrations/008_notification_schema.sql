-- =============================================================================
-- 008_notification_schema.sql
-- Notification Service — Push, SMS, Email, In-App, WhatsApp, Templates
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS notification;

-- =============================================================================
-- notification.notification_template
-- Templated messages for all notification events
-- =============================================================================
CREATE TABLE notification.notification_template (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(200) NOT NULL UNIQUE,    -- e.g. 'GST_RETURN_FILED', 'WELCOME_USER'
    name            VARCHAR(300) NOT NULL,
    event_type      VARCHAR(200) NOT NULL,
    channel         VARCHAR(30) NOT NULL
                        CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
    language        VARCHAR(20) NOT NULL DEFAULT 'en',
    subject         VARCHAR(500),                    -- For email
    body_template   TEXT NOT NULL,                   -- Handlebars/Mustache template
    push_title_template VARCHAR(300),
    push_body_template  TEXT,
    variables       JSONB,                           -- List of variable names used
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_notif_template_code ON notification.notification_template (code);
CREATE INDEX idx_notif_template_event_type ON notification.notification_template (event_type);
CREATE INDEX idx_notif_template_channel ON notification.notification_template (channel);

CREATE TRIGGER trg_notification_template_updated_at
    BEFORE UPDATE ON notification.notification_template
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- notification.notification_preference
-- Per-user preferences for each notification channel and event type
-- =============================================================================
CREATE TABLE notification.notification_preference (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,               -- auth.user.id
    event_type          VARCHAR(200) NOT NULL,
    push_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (user_id, event_type)
);

CREATE INDEX idx_notif_pref_user_id ON notification.notification_preference (user_id);
CREATE INDEX idx_notif_pref_event_type ON notification.notification_preference (event_type);

ALTER TABLE notification.notification_preference ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_notification_preference_updated_at
    BEFORE UPDATE ON notification.notification_preference
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- notification.device_push_token
-- FCM/APNs tokens per device — also stored in auth.user_device but kept here
-- for notification service autonomy
-- =============================================================================
CREATE TABLE notification.device_push_token (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    device_id       VARCHAR(256) NOT NULL,
    platform        VARCHAR(20) NOT NULL CHECK (platform IN ('ANDROID','IOS','WEB')),
    push_token      TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (user_id, device_id)
);

CREATE INDEX idx_device_push_token_user_id ON notification.device_push_token (user_id);
CREATE INDEX idx_device_push_token_is_active ON notification.device_push_token (is_active);

ALTER TABLE notification.device_push_token ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_device_push_token_updated_at
    BEFORE UPDATE ON notification.device_push_token
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- notification.notification  (PARTITIONED BY MONTH on created_at)
-- Actual notification records — high volume, partitioned for retention
-- =============================================================================
CREATE TABLE notification.notification (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    template_id     UUID REFERENCES notification.notification_template (id),
    event_type      VARCHAR(200) NOT NULL,
    channel         VARCHAR(30) NOT NULL
                        CHECK (channel IN ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP')),
    title           VARCHAR(500),
    body            TEXT NOT NULL,
    data_payload    JSONB,                           -- Extra data for deep linking
    reference_type  VARCHAR(100),                   -- 'GST_RETURN', 'LOAN_APPLICATION', etc.
    reference_id    UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SENT','DELIVERED','READ','FAILED')),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    failure_reason  TEXT,
    retry_count     SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial monthly partitions
CREATE TABLE notification.notification_2026_01 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE notification.notification_2026_02 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE notification.notification_2026_03 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE notification.notification_2026_04 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE notification.notification_2026_05 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE notification.notification_2026_06 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE notification.notification_2026_07 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE notification.notification_2026_08 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE notification.notification_2026_09 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE notification.notification_2026_10 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE notification.notification_2026_11 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE notification.notification_2026_12 PARTITION OF notification.notification
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE notification.notification_default PARTITION OF notification.notification DEFAULT;

CREATE INDEX idx_notification_user_id ON notification.notification (user_id, created_at);
CREATE INDEX idx_notification_is_read ON notification.notification (user_id, is_read, created_at) WHERE is_read = FALSE;
CREATE INDEX idx_notification_status ON notification.notification (status, created_at);
CREATE INDEX idx_notification_reference ON notification.notification (reference_type, reference_id, created_at) WHERE reference_id IS NOT NULL;

ALTER TABLE notification.notification ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- notification.notification_log
-- External delivery log (provider responses, tracking IDs)
-- =============================================================================
CREATE TABLE notification.notification_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id     UUID NOT NULL,               -- FK by value (partitioned table)
    notification_at     TIMESTAMPTZ NOT NULL,
    provider            VARCHAR(50) NOT NULL,         -- 'FCM','APNS','MSG91','SENDGRID','WHATSAPP_BUSINESS'
    provider_message_id VARCHAR(300),
    provider_status     VARCHAR(100),
    provider_response   JSONB,
    cost_units          NUMERIC(10,4),               -- For cost tracking (SMS units, email sends)
    is_delivered        BOOLEAN,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_notification_log_notification_id ON notification.notification_log (notification_id);
CREATE INDEX idx_notification_log_provider ON notification.notification_log (provider);
CREATE INDEX idx_notification_log_provider_msg_id ON notification.notification_log (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TRIGGER trg_notification_log_updated_at
    BEFORE UPDATE ON notification.notification_log
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY notification_pref_isolation ON notification.notification_preference
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY device_push_token_isolation ON notification.device_push_token
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY notification_user_isolation ON notification.notification
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
