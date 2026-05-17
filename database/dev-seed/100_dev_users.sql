-- =============================================================================
-- 100_dev_users.sql — Dev-only canonical users + organization
-- =============================================================================
-- Idempotent — safe to re-run.
-- NEVER apply to staging/production.
--
-- Anchor IDs referenced by 200_dev_business_data.sql:
--   user_id = '33333333-3333-3333-3333-333333333333'  (Acme owner)
--   org_id  = '44444444-4444-4444-4444-444444444444'  (Acme Trading Co.)
--   admin   = '11111111-1111-1111-1111-111111111111'  (platform admin)
--   ca user = '22222222-2222-2222-2222-222222222222'  (chartered accountant)
-- =============================================================================

\set ON_ERROR_STOP on

-- ── Users ─────────────────────────────────────────────────────────────────
INSERT INTO auth."user"
    (id, firebase_uid, phone_number, email, full_name,
     is_phone_verified, is_email_verified, is_active, preferred_language,
     created_at, updated_at)
VALUES
    ('11111111-1111-1111-1111-111111111111',
     'dev-admin-uid', '+919999900001', 'admin@snapaccount.dev', 'Platform Admin',
     TRUE, TRUE, TRUE, 'en', NOW(), NOW()),
    ('22222222-2222-2222-2222-222222222222',
     'dev-ca-uid', '+919999900002', 'ca@snapaccount.dev', 'Test Chartered Accountant',
     TRUE, TRUE, TRUE, 'en', NOW(), NOW()),
    ('33333333-3333-3333-3333-333333333333',
     'dev-owner-uid', '+919999900003', 'owner@acme.dev', 'Acme Owner',
     TRUE, TRUE, TRUE, 'en', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── Organization (Acme Trading Co.) ───────────────────────────────────────
INSERT INTO auth.organization
    (id, owner_user_id, business_name, gstin, pan_number,
     business_type, industry_type, annual_turnover_inr,
     address_line1, city, state, pincode, country,
     is_gst_registered, is_msme_registered, is_active,
     created_at, updated_at)
VALUES
    ('44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     'Acme Trading Co.', '27AABCU9603R1ZX', 'AABCU9603R',
     'Private Limited', 'Retail Trade', 25000000,
     '123 MG Road', 'Mumbai', 'Maharashtra', '400001', 'India',
     TRUE, TRUE, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── Organization membership (owner) ───────────────────────────────────────
INSERT INTO auth.organization_member
    (id, organization_id, user_id, role_id, is_active, created_at, updated_at)
SELECT
    '45555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333',
    (SELECT id FROM auth.role WHERE name = 'BUSINESS_OWNER' LIMIT 1),
    TRUE, NOW(), NOW()
ON CONFLICT (id) DO NOTHING;

SELECT 'Dev users seeded' AS status,
       (SELECT COUNT(*) FROM auth."user")          AS users,
       (SELECT COUNT(*) FROM auth.organization)    AS orgs;
