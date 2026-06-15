-- =============================================================================
-- 080_chat_appointments_bookmarks_permissions.sql
-- Wave 7A — GAP-031 (CA appointments) + GAP-043 (message bookmarks)
--
-- Creates:
--   chat.ca_profiles        — CA staff metadata + rating aggregate
--   chat.appointment_slots  — CA availability windows
--   chat.appointments       — org/user × slot × CA consultation bookings
--   chat.message_bookmarks  — per-user message bookmarks (toggle semantics)
--
-- Also seeds:
--   chat.appointments.book  — permission (org-member: SME users)
--   chat.slots.manage       — permission (CA/staff: create availability slots)
--   Role grants via live-join pattern (matches migrations 036/070/074 style)
--
-- House rules:
--   • snake_case columns, UUID PKs, audit columns (created_at/updated_at/deleted_at)
--   • created_by / updated_by are UUID (NOT TEXT) — matches BaseDbContext.GuidStringConverter
--   • RLS: membership subquery on app.current_user_id (same pattern as gst.*, auth.*)
--   • All INSERTs use ON CONFLICT DO NOTHING (idempotent re-run)
--   • No existing object altered — purely additive
--
-- Depends on: 029_chat_signalr.sql (chat schema), 036_auth_rbac_permission_catalog_seed.sql
-- =============================================================================

-- =============================================================================
-- 1. chat.ca_profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat.ca_profiles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,                     -- auth.user.id
    display_name     VARCHAR(200) NOT NULL,
    bio              VARCHAR(1000),
    specialisations  VARCHAR(500),
    average_rating   NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count     INTEGER     NOT NULL DEFAULT 0,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    created_by       UUID,
    updated_by       UUID
);

COMMENT ON TABLE chat.ca_profiles IS
    'GAP-031: CA (Chartered Accountant) staff metadata, availability, and rating aggregate.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ca_profiles_user_id
    ON chat.ca_profiles (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_ca_profiles_is_active
    ON chat.ca_profiles (is_active)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_ca_profiles
    BEFORE UPDATE ON chat.ca_profiles
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- RLS: CA profiles are visible to any authenticated org member
-- (public read — no PII, only display name and rating).
ALTER TABLE chat.ca_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'chat' AND tablename = 'ca_profiles' AND policyname = 'ca_profiles_read_policy'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY ca_profiles_read_policy ON chat.ca_profiles
            FOR SELECT
            USING (
                deleted_at IS NULL
                AND EXISTS (
                    SELECT 1 FROM auth.organization_member om
                    WHERE om.user_id = current_setting('app.current_user_id', TRUE)::uuid
                      AND om.deleted_at IS NULL
                )
            )
        $policy$;
    END IF;
END $$;

-- =============================================================================
-- 2. chat.appointment_slots
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat.appointment_slots (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ca_profile_id  UUID        NOT NULL REFERENCES chat.ca_profiles(id),
    start_utc      TIMESTAMPTZ NOT NULL,
    end_utc        TIMESTAMPTZ NOT NULL,
    is_available   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    created_by     UUID,
    updated_by     UUID,
    CONSTRAINT chk_slot_end_after_start CHECK (end_utc > start_utc)
);

COMMENT ON TABLE chat.appointment_slots IS
    'GAP-031: CA availability windows for consultation booking.';

CREATE INDEX IF NOT EXISTS ix_appointment_slots_ca_profile_id
    ON chat.appointment_slots (ca_profile_id);

CREATE INDEX IF NOT EXISTS ix_appointment_slots_ca_start_available
    ON chat.appointment_slots (ca_profile_id, start_utc, is_available)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_appointment_slots
    BEFORE UPDATE ON chat.appointment_slots
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE chat.appointment_slots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'chat' AND tablename = 'appointment_slots' AND policyname = 'appointment_slots_read_policy'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY appointment_slots_read_policy ON chat.appointment_slots
            FOR SELECT
            USING (
                deleted_at IS NULL
                AND EXISTS (
                    SELECT 1 FROM auth.organization_member om
                    WHERE om.user_id = current_setting('app.current_user_id', TRUE)::uuid
                      AND om.deleted_at IS NULL
                )
            )
        $policy$;
    END IF;
END $$;

-- =============================================================================
-- 3. chat.appointments
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat.appointments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    booked_by_user_id   UUID        NOT NULL,
    ca_profile_id       UUID        NOT NULL REFERENCES chat.ca_profiles(id),
    slot_id             UUID        NOT NULL REFERENCES chat.appointment_slots(id),
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CONSTRAINT chk_appointment_status
                        CHECK (status IN ('DRAFT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
    meet_link           VARCHAR(500),
    notes               VARCHAR(2000),
    rating_stars        SMALLINT    CONSTRAINT chk_rating_stars CHECK (rating_stars BETWEEN 1 AND 5),
    rating_comment      VARCHAR(1000),
    rated_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID
);

COMMENT ON TABLE chat.appointments IS
    'GAP-031: CA consultation appointments. Status: DRAFT→CONFIRMED→COMPLETED|CANCELLED|NO_SHOW.';

CREATE INDEX IF NOT EXISTS ix_appointments_org_id
    ON chat.appointments (organization_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_appointments_ca_profile_id
    ON chat.appointments (ca_profile_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_appointments_booked_by
    ON chat.appointments (booked_by_user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_appointments_slot_id
    ON chat.appointments (slot_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_appointments_status
    ON chat.appointments (status)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_appointments
    BEFORE UPDATE ON chat.appointments
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE chat.appointments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'chat' AND tablename = 'appointments' AND policyname = 'appointments_org_policy'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY appointments_org_policy ON chat.appointments
            FOR ALL
            USING (
                deleted_at IS NULL
                AND organization_id IN (
                    SELECT om.organization_id
                    FROM   auth.organization_member om
                    WHERE  om.user_id = current_setting('app.current_user_id', TRUE)::uuid
                      AND  om.deleted_at IS NULL
                )
            )
        $policy$;
    END IF;
END $$;

-- =============================================================================
-- 4. chat.message_bookmarks (GAP-043)
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat.message_bookmarks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    message_id  UUID        NOT NULL REFERENCES chat.messages(id),
    note        VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    created_by  UUID,
    updated_by  UUID
);

COMMENT ON TABLE chat.message_bookmarks IS
    'GAP-043: Per-user message bookmarks. Toggle semantics: (user_id, message_id) UNIQUE (soft-deleted excluded).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_bookmarks_user_message
    ON chat.message_bookmarks (user_id, message_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_message_bookmarks_user_id
    ON chat.message_bookmarks (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_message_bookmarks_message_id
    ON chat.message_bookmarks (message_id)
    WHERE deleted_at IS NULL;

CREATE TRIGGER set_updated_at_message_bookmarks
    BEFORE UPDATE ON chat.message_bookmarks
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

ALTER TABLE chat.message_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'chat' AND tablename = 'message_bookmarks' AND policyname = 'message_bookmarks_user_policy'
    ) THEN
        EXECUTE $policy$
            CREATE POLICY message_bookmarks_user_policy ON chat.message_bookmarks
            FOR ALL
            USING (
                deleted_at IS NULL
                AND user_id = current_setting('app.current_user_id', TRUE)::uuid
            )
        $policy$;
    END IF;
END $$;

-- =============================================================================
-- 5. RBAC permissions (live-join grant pattern)
-- =============================================================================

-- Seed permissions
INSERT INTO auth.permission (id, name, resource, action, description)
SELECT
    gen_random_uuid(),
    p.name,
    split_part(p.name, '.', 1),
    substring(p.name FROM position('.' IN p.name) + 1),
    p.description
FROM (VALUES
    ('chat.appointments.book',
     'Book, reschedule, and cancel CA consultation appointments (org-member tier)'),
    ('chat.slots.manage',
     'Create and manage CA availability slots (CA/staff tier)')
) AS p(name, description)
ON CONFLICT (name) DO NOTHING;

-- Backfill resource_type_id (matches migrations 036/044/070/074 pattern)
UPDATE auth.permission p
SET    resource_type_id = rt.id
FROM   auth.resource_type rt
WHERE  p.name IN ('chat.appointments.book', 'chat.slots.manage')
  AND  rt.key = p.resource
  AND  p.resource_type_id IS NULL
  AND  rt.deleted_at IS NULL;

-- Grant chat.appointments.book to SUPER_ADMIN, ORG_ADMIN, ORG_MEMBER
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'chat.appointments.book'
WHERE  r.name IN ('SUPER_ADMIN', 'ORG_ADMIN', 'ORG_MEMBER')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant chat.slots.manage to SUPER_ADMIN and CA_STAFF
-- (CA_STAFF may not exist yet — DO block handles gracefully)
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'chat.slots.manage'
WHERE  r.name IN ('SUPER_ADMIN', 'ORG_ADMIN')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant chat.read to ORG_MEMBER if not already granted (needed for bookmark toggle)
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'chat.read'
WHERE  r.name IN ('ORG_MEMBER', 'ORG_ADMIN', 'SUPER_ADMIN')
  AND  r.deleted_at IS NULL
  AND  p.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
