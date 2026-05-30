-- =============================================================================
-- 039_reference_data.sql
-- Auth/RBAC Module 1, Increment 1.4 Phase A — global reference / master data.
-- ADDITIVE, idempotent. Safe against a running AuthService (new table + seed).
--
-- Scope ref: .claude/orchestrator/auth-rbac-module-scope.md (§5f Phase A)
--
-- Global reference data (LANGUAGE, USER_TYPE, GENDER, STATE, COUNTRY) readable by
-- all authenticated users. NO RLS (not tenant-scoped). Managed by SUPER_ADMIN via
-- the new platform.refdata.manage permission.
-- =============================================================================

CREATE TABLE IF NOT EXISTS auth.reference_data (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category      VARCHAR(50)  NOT NULL,  -- LANGUAGE, USER_TYPE, GENDER, STATE, COUNTRY
    code          VARCHAR(50)  NOT NULL,
    name          VARCHAR(200) NOT NULL,
    parent_code   VARCHAR(50),            -- e.g. STATE.parent_code = COUNTRY code 'IN'
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    created_by    UUID,
    updated_by    UUID
);

-- One active (category, code) entry. Expression note: bare partial unique index;
-- an ON CONFLICT upsert must restate the predicate:
--   ON CONFLICT (category, code) WHERE deleted_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_reference_data_category_code
    ON auth.reference_data (category, code)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reference_data_category_active
    ON auth.reference_data (category, is_active);

CREATE INDEX IF NOT EXISTS idx_reference_data_parent_code
    ON auth.reference_data (parent_code) WHERE parent_code IS NOT NULL;

DROP TRIGGER IF EXISTS trg_reference_data_updated_at ON auth.reference_data;
CREATE TRIGGER trg_reference_data_updated_at
    BEFORE UPDATE ON auth.reference_data
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- No RLS: global reference data, readable by all authenticated users.

-- -----------------------------------------------------------------------------
-- Seed reference data (idempotent — arbiter matches the partial unique index)
-- -----------------------------------------------------------------------------

-- LANGUAGE
INSERT INTO auth.reference_data (id, category, code, name, parent_code, sort_order)
VALUES
    (gen_random_uuid(), 'LANGUAGE', 'en', 'English',           NULL, 1),
    (gen_random_uuid(), 'LANGUAGE', 'hi', 'हिन्दी (Hindi)',     NULL, 2),
    (gen_random_uuid(), 'LANGUAGE', 'bn', 'বাংলা (Bengali)',    NULL, 3)
ON CONFLICT (category, code) WHERE deleted_at IS NULL DO NOTHING;

-- USER_TYPE
INSERT INTO auth.reference_data (id, category, code, name, parent_code, sort_order)
VALUES
    (gen_random_uuid(), 'USER_TYPE', 'BUSINESS_OWNER',      'Business Owner',       NULL, 1),
    (gen_random_uuid(), 'USER_TYPE', 'EMPLOYEE',            'Employee',             NULL, 2),
    (gen_random_uuid(), 'USER_TYPE', 'STAFF',               'Staff',                NULL, 3),
    (gen_random_uuid(), 'USER_TYPE', 'DATA_ENTRY_OPERATOR', 'Data Entry Operator',  NULL, 4)
ON CONFLICT (category, code) WHERE deleted_at IS NULL DO NOTHING;

-- GENDER
INSERT INTO auth.reference_data (id, category, code, name, parent_code, sort_order)
VALUES
    (gen_random_uuid(), 'GENDER', 'MALE',              'Male',               NULL, 1),
    (gen_random_uuid(), 'GENDER', 'FEMALE',            'Female',             NULL, 2),
    (gen_random_uuid(), 'GENDER', 'OTHER',             'Other',              NULL, 3),
    (gen_random_uuid(), 'GENDER', 'PREFER_NOT_TO_SAY', 'Prefer not to say',  NULL, 4)
ON CONFLICT (category, code) WHERE deleted_at IS NULL DO NOTHING;

-- COUNTRY (ISO alpha-2). IN is the default.
INSERT INTO auth.reference_data (id, category, code, name, parent_code, sort_order)
VALUES
    (gen_random_uuid(), 'COUNTRY', 'IN', 'India',                          NULL, 1),
    (gen_random_uuid(), 'COUNTRY', 'US', 'United States',                  NULL, 2),
    (gen_random_uuid(), 'COUNTRY', 'GB', 'United Kingdom',                 NULL, 3),
    (gen_random_uuid(), 'COUNTRY', 'AE', 'United Arab Emirates',           NULL, 4),
    (gen_random_uuid(), 'COUNTRY', 'SG', 'Singapore',                      NULL, 5),
    (gen_random_uuid(), 'COUNTRY', 'AU', 'Australia',                      NULL, 6),
    (gen_random_uuid(), 'COUNTRY', 'CA', 'Canada',                         NULL, 7)
ON CONFLICT (category, code) WHERE deleted_at IS NULL DO NOTHING;

-- STATE — 28 Indian states + 8 union territories (ISO 3166-2:IN), parent_code='IN'
INSERT INTO auth.reference_data (id, category, code, name, parent_code, sort_order)
VALUES
    -- 28 States
    (gen_random_uuid(), 'STATE', 'AP', 'Andhra Pradesh',                   'IN', 1),
    (gen_random_uuid(), 'STATE', 'AR', 'Arunachal Pradesh',                'IN', 2),
    (gen_random_uuid(), 'STATE', 'AS', 'Assam',                            'IN', 3),
    (gen_random_uuid(), 'STATE', 'BR', 'Bihar',                            'IN', 4),
    (gen_random_uuid(), 'STATE', 'CT', 'Chhattisgarh',                     'IN', 5),
    (gen_random_uuid(), 'STATE', 'GA', 'Goa',                              'IN', 6),
    (gen_random_uuid(), 'STATE', 'GJ', 'Gujarat',                          'IN', 7),
    (gen_random_uuid(), 'STATE', 'HR', 'Haryana',                          'IN', 8),
    (gen_random_uuid(), 'STATE', 'HP', 'Himachal Pradesh',                 'IN', 9),
    (gen_random_uuid(), 'STATE', 'JH', 'Jharkhand',                        'IN', 10),
    (gen_random_uuid(), 'STATE', 'KA', 'Karnataka',                        'IN', 11),
    (gen_random_uuid(), 'STATE', 'KL', 'Kerala',                           'IN', 12),
    (gen_random_uuid(), 'STATE', 'MP', 'Madhya Pradesh',                   'IN', 13),
    (gen_random_uuid(), 'STATE', 'MH', 'Maharashtra',                      'IN', 14),
    (gen_random_uuid(), 'STATE', 'MN', 'Manipur',                          'IN', 15),
    (gen_random_uuid(), 'STATE', 'ML', 'Meghalaya',                        'IN', 16),
    (gen_random_uuid(), 'STATE', 'MZ', 'Mizoram',                          'IN', 17),
    (gen_random_uuid(), 'STATE', 'NL', 'Nagaland',                         'IN', 18),
    (gen_random_uuid(), 'STATE', 'OR', 'Odisha',                           'IN', 19),
    (gen_random_uuid(), 'STATE', 'PB', 'Punjab',                           'IN', 20),
    (gen_random_uuid(), 'STATE', 'RJ', 'Rajasthan',                        'IN', 21),
    (gen_random_uuid(), 'STATE', 'SK', 'Sikkim',                           'IN', 22),
    (gen_random_uuid(), 'STATE', 'TN', 'Tamil Nadu',                       'IN', 23),
    (gen_random_uuid(), 'STATE', 'TG', 'Telangana',                        'IN', 24),
    (gen_random_uuid(), 'STATE', 'TR', 'Tripura',                          'IN', 25),
    (gen_random_uuid(), 'STATE', 'UP', 'Uttar Pradesh',                    'IN', 26),
    (gen_random_uuid(), 'STATE', 'UT', 'Uttarakhand',                      'IN', 27),
    (gen_random_uuid(), 'STATE', 'WB', 'West Bengal',                      'IN', 28),
    -- 8 Union Territories
    (gen_random_uuid(), 'STATE', 'AN', 'Andaman and Nicobar Islands',      'IN', 29),
    (gen_random_uuid(), 'STATE', 'CH', 'Chandigarh',                       'IN', 30),
    (gen_random_uuid(), 'STATE', 'DH', 'Dadra and Nagar Haveli and Daman and Diu', 'IN', 31),
    (gen_random_uuid(), 'STATE', 'DL', 'Delhi',                            'IN', 32),
    (gen_random_uuid(), 'STATE', 'JK', 'Jammu and Kashmir',                'IN', 33),
    (gen_random_uuid(), 'STATE', 'LA', 'Ladakh',                           'IN', 34),
    (gen_random_uuid(), 'STATE', 'LD', 'Lakshadweep',                      'IN', 35),
    (gen_random_uuid(), 'STATE', 'PY', 'Puducherry',                       'IN', 36)
ON CONFLICT (category, code) WHERE deleted_at IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- New permission: platform.refdata.manage + grant to SUPER_ADMIN
-- (dot-notation resource.action, consistent with 036)
-- -----------------------------------------------------------------------------
INSERT INTO auth.permission (id, name, resource, action, description)
VALUES (gen_random_uuid(), 'platform.refdata.manage', 'platform', 'refdata.manage', 'Manage reference/master data')
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'SUPER_ADMIN'
  AND p.name = 'platform.refdata.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 039
-- =============================================================================
