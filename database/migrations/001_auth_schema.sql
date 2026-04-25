-- =============================================================================
-- 001_auth_schema.sql
-- Auth Service — Authentication, Authorization, User Management, Device Binding
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- =============================================================================
-- auth.role
-- System roles (seeded via 999_seed_reference_data.sql)
-- =============================================================================
CREATE TABLE auth.role (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    display_name    VARCHAR(200) NOT NULL,
    description     TEXT,
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_role_name ON auth.role (name);
CREATE INDEX idx_role_is_active ON auth.role (is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_role_updated_at
    BEFORE UPDATE ON auth.role
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.permission
-- Fine-grained permissions (e.g. 'document:read', 'gst:file', etc.)
-- =============================================================================
CREATE TABLE auth.permission (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL UNIQUE,   -- e.g. 'gst:return:file'
    resource        VARCHAR(100) NOT NULL,           -- e.g. 'gst'
    action          VARCHAR(100) NOT NULL,           -- e.g. 'return:file'
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_permission_resource ON auth.permission (resource);
CREATE INDEX idx_permission_name ON auth.permission (name);

CREATE TRIGGER trg_permission_updated_at
    BEFORE UPDATE ON auth.permission
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.role_permission
-- Many-to-many: roles <-> permissions
-- =============================================================================
CREATE TABLE auth.role_permission (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES auth.role (id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES auth.permission (id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permission_role_id ON auth.role_permission (role_id);
CREATE INDEX idx_role_permission_permission_id ON auth.role_permission (permission_id);

CREATE TRIGGER trg_role_permission_updated_at
    BEFORE UPDATE ON auth.role_permission
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.user
-- Core user record — linked to Firebase Auth UID
-- =============================================================================
CREATE TABLE auth.user (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid        VARCHAR(128) UNIQUE,            -- Firebase Auth UID
    phone_number        VARCHAR(15) UNIQUE,             -- E.164 format, e.g. +919876543210
    email               VARCHAR(320),
    full_name           VARCHAR(300),
    is_phone_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE, -- DPDP right-to-erasure flag
    preferred_language  VARCHAR(20) NOT NULL DEFAULT 'en', -- BCP-47
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_user_firebase_uid ON auth.user (firebase_uid);
CREATE INDEX idx_user_phone_number ON auth.user (phone_number);
CREATE INDEX idx_user_email ON auth.user (email) WHERE email IS NOT NULL;
CREATE INDEX idx_user_is_active ON auth.user (is_active) WHERE deleted_at IS NULL;

ALTER TABLE auth.user ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_updated_at
    BEFORE UPDATE ON auth.user
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.user_profile
-- Extended profile info (business owner or employee variant)
-- =============================================================================
CREATE TABLE auth.user_profile (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    user_type           VARCHAR(50) NOT NULL CHECK (user_type IN ('BUSINESS_OWNER','EMPLOYEE','STAFF')),
    pan_number          VARCHAR(10),                    -- XXXXX9999X format
    aadhaar_last4       VARCHAR(4),                     -- Last 4 digits only — UIDAI compliance
    date_of_birth       DATE,
    gender              VARCHAR(20),
    address_line1       VARCHAR(500),
    address_line2       VARCHAR(500),
    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(10),
    country             VARCHAR(100) NOT NULL DEFAULT 'India',
    profile_photo_url   TEXT,
    kyc_status          VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (kyc_status IN ('PENDING','IN_PROGRESS','VERIFIED','REJECTED')),
    kyc_verified_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (user_id)
);

CREATE INDEX idx_user_profile_user_id ON auth.user_profile (user_id);
CREATE INDEX idx_user_profile_pan_number ON auth.user_profile (pan_number) WHERE pan_number IS NOT NULL;
CREATE INDEX idx_user_profile_kyc_status ON auth.user_profile (kyc_status);

ALTER TABLE auth.user_profile ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_profile_updated_at
    BEFORE UPDATE ON auth.user_profile
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.organization
-- Represents a business entity (SME). A user can own/belong to multiple orgs.
-- =============================================================================
CREATE TABLE auth.organization (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id       UUID NOT NULL REFERENCES auth.user (id),
    business_name       VARCHAR(500) NOT NULL,
    gstin               VARCHAR(15),                    -- 15-char GSTIN format
    pan_number          VARCHAR(10),
    business_type       VARCHAR(100),                   -- Proprietorship, Partnership, Pvt Ltd, etc.
    industry_type       VARCHAR(200),
    annual_turnover_inr NUMERIC(20,2),
    registration_date   DATE,
    address_line1       VARCHAR(500),
    address_line2       VARCHAR(500),
    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(10),
    country             VARCHAR(100) NOT NULL DEFAULT 'India',
    is_gst_registered   BOOLEAN NOT NULL DEFAULT FALSE,
    is_msme_registered  BOOLEAN NOT NULL DEFAULT FALSE,
    msme_udyam_number   VARCHAR(50),
    logo_url            TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

CREATE INDEX idx_organization_owner_user_id ON auth.organization (owner_user_id);
CREATE INDEX idx_organization_gstin ON auth.organization (gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_organization_pan_number ON auth.organization (pan_number) WHERE pan_number IS NOT NULL;
CREATE INDEX idx_organization_is_active ON auth.organization (is_active) WHERE deleted_at IS NULL;

ALTER TABLE auth.organization ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_organization_updated_at
    BEFORE UPDATE ON auth.organization
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.organization_member
-- Members of an organization (many users <-> many orgs)
-- =============================================================================
CREATE TABLE auth.organization_member (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES auth.organization (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES auth.role (id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_member_org_id ON auth.organization_member (organization_id);
CREATE INDEX idx_org_member_user_id ON auth.organization_member (user_id);
CREATE INDEX idx_org_member_role_id ON auth.organization_member (role_id);

ALTER TABLE auth.organization_member ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_org_member_updated_at
    BEFORE UPDATE ON auth.organization_member
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.user_role
-- Platform-level (non-org) role assignments (e.g. SYSTEM_ADMIN, SUPPORT_EXECUTIVE)
-- =============================================================================
CREATE TABLE auth.user_role (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES auth.role (id) ON DELETE CASCADE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID,
    UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_role_user_id ON auth.user_role (user_id);
CREATE INDEX idx_user_role_role_id ON auth.user_role (role_id);

ALTER TABLE auth.user_role ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_role_updated_at
    BEFORE UPDATE ON auth.user_role
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.user_device
-- Device binding — max 2 active devices per user (enforced at application layer)
-- =============================================================================
CREATE TABLE auth.user_device (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    device_id       VARCHAR(256) NOT NULL,          -- Firebase installation ID or device fingerprint
    device_name     VARCHAR(200),
    platform        VARCHAR(20) NOT NULL CHECK (platform IN ('ANDROID','IOS','WEB')),
    os_version      VARCHAR(50),
    app_version     VARCHAR(50),
    fcm_token       TEXT,                           -- For push notifications
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_active_at  TIMESTAMPTZ,
    bound_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (user_id, device_id)
);

CREATE INDEX idx_user_device_user_id ON auth.user_device (user_id);
CREATE INDEX idx_user_device_device_id ON auth.user_device (device_id);
CREATE INDEX idx_user_device_fcm_token ON auth.user_device (fcm_token) WHERE fcm_token IS NOT NULL;

ALTER TABLE auth.user_device ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_device_updated_at
    BEFORE UPDATE ON auth.user_device
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.otp_request
-- OTP lifecycle tracking — phone OTP for auth, Aadhaar OTP for KYC
-- =============================================================================
CREATE TABLE auth.otp_request (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(15) NOT NULL,
    otp_type        VARCHAR(50) NOT NULL DEFAULT 'AUTH'
                        CHECK (otp_type IN ('AUTH','KYC_AADHAAR','PASSWORD_RESET')),
    otp_hash        VARCHAR(256) NOT NULL,           -- bcrypt hash of OTP — never store plain
    attempts        SMALLINT NOT NULL DEFAULT 0,
    max_attempts    SMALLINT NOT NULL DEFAULT 3,
    is_used         BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,            -- 5 minutes from creation
    cooldown_until  TIMESTAMPTZ,                     -- 30-min cooldown after max attempts
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_otp_request_phone_number ON auth.otp_request (phone_number);
CREATE INDEX idx_otp_request_expires_at ON auth.otp_request (expires_at);
CREATE INDEX idx_otp_request_phone_type ON auth.otp_request (phone_number, otp_type, is_used);

CREATE TRIGGER trg_otp_request_updated_at
    BEFORE UPDATE ON auth.otp_request
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.refresh_token
-- JWT refresh token storage — rotation on use, revocable
-- =============================================================================
CREATE TABLE auth.refresh_token (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    device_id       UUID REFERENCES auth.user_device (id),
    token_hash      VARCHAR(256) NOT NULL UNIQUE,   -- SHA-256 hash of refresh token
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  VARCHAR(200),
    expires_at      TIMESTAMPTZ NOT NULL,            -- 30 days
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_refresh_token_user_id ON auth.refresh_token (user_id);
CREATE INDEX idx_refresh_token_token_hash ON auth.refresh_token (token_hash);
CREATE INDEX idx_refresh_token_expires_at ON auth.refresh_token (expires_at);

ALTER TABLE auth.refresh_token ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_refresh_token_updated_at
    BEFORE UPDATE ON auth.refresh_token
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- auth.user_preference
-- Per-user preferences: language, notifications, theme
-- =============================================================================
CREATE TABLE auth.user_preference (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES auth.user (id) ON DELETE CASCADE,
    preferred_language          VARCHAR(20) NOT NULL DEFAULT 'en',
    theme                       VARCHAR(20) NOT NULL DEFAULT 'LIGHT' CHECK (theme IN ('LIGHT','DARK','SYSTEM')),
    push_notifications_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    sms_notifications_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID,
    UNIQUE (user_id)
);

CREATE INDEX idx_user_preference_user_id ON auth.user_preference (user_id);

ALTER TABLE auth.user_preference ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_user_preference_updated_at
    BEFORE UPDATE ON auth.user_preference
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies for auth schema
-- =============================================================================

-- auth.user — users can only see/modify their own record
CREATE POLICY user_isolation ON auth.user
    USING (id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY user_profile_isolation ON auth.user_profile
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY organization_isolation ON auth.organization
    USING (owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR id IN (
               SELECT organization_id FROM auth.organization_member
               WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
                 AND is_active = TRUE
           ));

CREATE POLICY org_member_isolation ON auth.organization_member
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID
           OR organization_id IN (
               SELECT id FROM auth.organization
               WHERE owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
           ));

CREATE POLICY user_role_isolation ON auth.user_role
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY user_device_isolation ON auth.user_device
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY refresh_token_isolation ON auth.refresh_token
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY user_preference_isolation ON auth.user_preference
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
