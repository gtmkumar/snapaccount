-- =============================================================================
-- 010_subscription_schema.sql
-- Subscription Service — Plans, Billing, Razorpay, Usage Metering
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS subscription;

-- =============================================================================
-- subscription.subscription_plan
-- Plans configured by admin (FREE, BASIC, PRO, ENTERPRISE)
-- =============================================================================
CREATE TABLE subscription.subscription_plan (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(50) NOT NULL UNIQUE,
    name                    VARCHAR(200) NOT NULL,
    description             TEXT,
    billing_cycle           VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
                                CHECK (billing_cycle IN ('MONTHLY','YEARLY','LIFETIME')),
    price_inr               NUMERIC(12,2) NOT NULL DEFAULT 0,
    original_price_inr      NUMERIC(12,2),           -- For showing discount
    trial_days              SMALLINT NOT NULL DEFAULT 0,
    -- Feature limits (NULL = unlimited)
    max_organizations       SMALLINT,
    max_documents_per_month INTEGER,
    max_users               SMALLINT,
    max_gst_returns_per_year SMALLINT,
    max_itr_returns_per_year SMALLINT,
    max_loan_applications_per_year SMALLINT,
    ai_queries_per_month    INTEGER,
    -- Feature flags
    has_advanced_reports    BOOLEAN NOT NULL DEFAULT FALSE,
    has_ca_consultation     BOOLEAN NOT NULL DEFAULT FALSE,
    has_priority_support    BOOLEAN NOT NULL DEFAULT FALSE,
    has_tally_export        BOOLEAN NOT NULL DEFAULT FALSE,
    has_api_access          BOOLEAN NOT NULL DEFAULT FALSE,
    has_whatsapp_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    -- Razorpay plan ID (populated after plan is created in Razorpay)
    razorpay_plan_id        VARCHAR(100),
    sort_order              SMALLINT NOT NULL DEFAULT 0,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    is_publicly_visible     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_sub_plan_code ON subscription.subscription_plan (code);
CREATE INDEX idx_sub_plan_is_active ON subscription.subscription_plan (is_active);

CREATE TRIGGER trg_subscription_plan_updated_at
    BEFORE UPDATE ON subscription.subscription_plan
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- subscription.subscription
-- Active subscriptions per organization
-- =============================================================================
CREATE TABLE subscription.subscription (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,               -- auth.organization.id
    user_id             UUID NOT NULL,               -- Owner who purchased
    plan_id             UUID NOT NULL REFERENCES subscription.subscription_plan (id),
    status              VARCHAR(30) NOT NULL DEFAULT 'TRIAL'
                            CHECK (status IN (
                                'TRIAL','ACTIVE','PAST_DUE','CANCELLED',
                                'EXPIRED','PAUSED','PENDING'
                            )),
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
                            CHECK (billing_cycle IN ('MONTHLY','YEARLY','LIFETIME')),
    current_period_start DATE NOT NULL,
    current_period_end  DATE NOT NULL,
    trial_start         DATE,
    trial_end           DATE,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    -- Razorpay subscription reference
    razorpay_subscription_id VARCHAR(100) UNIQUE,
    razorpay_customer_id    VARCHAR(100),
    -- Auto-renewal
    auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id)                         -- One active subscription per org
);

CREATE INDEX idx_subscription_org_id ON subscription.subscription (organization_id);
CREATE INDEX idx_subscription_user_id ON subscription.subscription (user_id);
CREATE INDEX idx_subscription_plan_id ON subscription.subscription (plan_id);
CREATE INDEX idx_subscription_status ON subscription.subscription (status);
CREATE INDEX idx_subscription_period_end ON subscription.subscription (current_period_end) WHERE status = 'ACTIVE';

ALTER TABLE subscription.subscription ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_subscription_updated_at
    BEFORE UPDATE ON subscription.subscription
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- subscription.subscription_invoice
-- Auto-generated invoices for subscription payments
-- =============================================================================
CREATE TABLE subscription.subscription_invoice (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id         UUID NOT NULL REFERENCES subscription.subscription (id),
    organization_id         UUID NOT NULL,
    invoice_number          VARCHAR(100) NOT NULL UNIQUE,
    billing_period_start    DATE NOT NULL,
    billing_period_end      DATE NOT NULL,
    subtotal_inr            NUMERIC(12,2) NOT NULL,
    gst_rate_pct            NUMERIC(5,2) NOT NULL DEFAULT 18,   -- Platform charges 18% GST
    gst_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_inr               NUMERIC(12,2) NOT NULL,
    status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','SENT','PAID','VOID','UNCOLLECTIBLE')),
    due_date                DATE,
    paid_at                 TIMESTAMPTZ,
    razorpay_invoice_id     VARCHAR(100),
    storage_path            TEXT,                    -- GCS path to invoice PDF
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_sub_invoice_subscription_id ON subscription.subscription_invoice (subscription_id);
CREATE INDEX idx_sub_invoice_org_id ON subscription.subscription_invoice (organization_id);
CREATE INDEX idx_sub_invoice_status ON subscription.subscription_invoice (status);

ALTER TABLE subscription.subscription_invoice ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_subscription_invoice_updated_at
    BEFORE UPDATE ON subscription.subscription_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- subscription.payment
-- Payment records (Razorpay transactions)
-- =============================================================================
CREATE TABLE subscription.payment (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id         UUID REFERENCES subscription.subscription (id),
    invoice_id              UUID REFERENCES subscription.subscription_invoice (id),
    organization_id         UUID NOT NULL,
    user_id                 UUID NOT NULL,
    amount_inr              NUMERIC(12,2) NOT NULL,
    currency                VARCHAR(10) NOT NULL DEFAULT 'INR',
    payment_method          VARCHAR(50),             -- CARD, UPI, NETBANKING, WALLET
    payment_gateway         VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    gateway_order_id        VARCHAR(200),
    gateway_payment_id      VARCHAR(200) UNIQUE,
    gateway_signature       VARCHAR(500),
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN (
                                    'PENDING','PROCESSING','CAPTURED',
                                    'FAILED','REFUNDED','PARTIALLY_REFUNDED'
                                )),
    failure_reason          TEXT,
    paid_at                 TIMESTAMPTZ,
    refunded_amount         NUMERIC(12,2),
    refunded_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    created_by              UUID,
    updated_by              UUID
);

CREATE INDEX idx_payment_subscription_id ON subscription.payment (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_payment_invoice_id ON subscription.payment (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payment_org_id ON subscription.payment (organization_id);
CREATE INDEX idx_payment_gateway_payment_id ON subscription.payment (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX idx_payment_status ON subscription.payment (status);

ALTER TABLE subscription.payment ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_payment_updated_at
    BEFORE UPDATE ON subscription.payment
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- subscription.usage_record
-- Track API calls, document uploads, chat sessions per org per month
-- =============================================================================
CREATE TABLE subscription.usage_record (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscription.subscription (id),
    organization_id     UUID NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end  DATE NOT NULL,
    documents_uploaded  INTEGER NOT NULL DEFAULT 0,
    gst_returns_filed   INTEGER NOT NULL DEFAULT 0,
    itr_returns_filed   INTEGER NOT NULL DEFAULT 0,
    loan_applications   INTEGER NOT NULL DEFAULT 0,
    ai_queries_used     INTEGER NOT NULL DEFAULT 0,
    api_calls           INTEGER NOT NULL DEFAULT 0,
    chat_sessions       INTEGER NOT NULL DEFAULT 0,
    storage_used_mb     NUMERIC(15,2) NOT NULL DEFAULT 0,
    last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, billing_period_start)
);

CREATE INDEX idx_usage_record_subscription_id ON subscription.usage_record (subscription_id);
CREATE INDEX idx_usage_record_org_id ON subscription.usage_record (organization_id);
CREATE INDEX idx_usage_record_period ON subscription.usage_record (billing_period_start);

ALTER TABLE subscription.usage_record ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_usage_record_updated_at
    BEFORE UPDATE ON subscription.usage_record
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY subscription_org_isolation ON subscription.subscription
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY sub_invoice_org_isolation ON subscription.subscription_invoice
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY payment_org_isolation ON subscription.payment
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY usage_record_org_isolation ON subscription.usage_record
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
