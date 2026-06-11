-- =============================================================================
-- 200_dev_business_data.sql — Dev-only business data across all 12 services
-- =============================================================================
-- Apply AFTER 100_dev_users.sql (depends on org 44444444-… and user 33333333-…).
-- Idempotent — safe to re-run; uses ON CONFLICT DO NOTHING throughout.
-- NEVER apply to staging/production.
--
-- Seeds realistic business data so admin and mobile UIs have something to
-- render against the real API. Uses deterministic UUID prefixes per domain
-- so the data is greppable:
--   loan.*         → 5xxxxxxx-…
--   gst.*          → 6xxxxxxx-…
--   itr.*          → 7xxxxxxx-…
--   callback.*     → 8xxxxxxx-…
--   document.*     → 9xxxxxxx-…
--   chat.*         → axxxxxxx-…
--   notification.* → bxxxxxxx-…
--   subscription.* → cxxxxxxx-…
--   accounting.*   → dxxxxxxx-…
-- =============================================================================

\set ON_ERROR_STOP on

-- Anchor IDs from 100_dev_users.sql
-- org_id  = '44444444-4444-4444-4444-444444444444'  (Acme Trading Co.)
-- user_id = '33333333-3333-3333-3333-333333333333'  (Acme owner)

-- ──────────────────────────────────────────────────────────────────────────
-- SELF-SUFFICIENCY GUARD (GAP-072 reconciliation)
-- ──────────────────────────────────────────────────────────────────────────
-- The cross-service business tables below reference auth.organization /
-- auth."user" BY VALUE (schema-per-service isolation → no FK constraint), so a
-- missing anchor would silently insert ORPHANED rows that no API can resolve.
-- 100_dev_users.sql is the canonical anchor seed, but this file must also work
-- standalone (CI's migration-replay applies the dev seed on its own). We
-- therefore ensure the org + owner + membership anchors exist here too, exactly
-- mirroring 100_dev_users.sql. Idempotent (ON CONFLICT DO NOTHING) — re-running
-- 100 then 200, or 200 alone, both converge to the same state.
INSERT INTO auth."user"
    (id, firebase_uid, phone_number, email, full_name,
     is_phone_verified, is_email_verified, is_active, preferred_language,
     created_at, updated_at)
VALUES
    ('33333333-3333-3333-3333-333333333333',
     'dev-owner-uid', '+919999900003', 'owner@acme.dev', 'Acme Owner',
     TRUE, TRUE, TRUE, 'en', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

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

INSERT INTO auth.organization_member
    (id, organization_id, user_id, role_id, is_active, created_at, updated_at)
SELECT
    '45555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444',
    '33333333-3333-3333-3333-333333333333',
    (SELECT id FROM auth.role WHERE name = 'ORG_ADMIN' AND organization_id IS NULL LIMIT 1),
    TRUE, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM auth.role WHERE name = 'ORG_ADMIN' AND organization_id IS NULL)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- LOANS — partner banks, products, and an application
-- ──────────────────────────────────────────────────────────────────────────
-- Schema (migration 028): column is `name` (not bank_name); `adapter_type` (enum
-- loan.partner_bank_adapter_type) is required; contact_phone/api_endpoint/
-- hmac_key_secret_id columns do not exist — credentials live in api_config_*/webhook_secret_ref.
INSERT INTO loan.partner_banks (id, bank_code, name, contact_email,
                                adapter_type, webhook_secret_ref, is_active,
                                created_at, updated_at)
VALUES
    ('51111111-1111-1111-1111-111111111111', 'HDFC',  'HDFC Bank',   'partners@hdfc.dev',
     'REST'::loan.partner_bank_adapter_type,  'hdfc-hmac',  TRUE, NOW(), NOW()),
    ('51111111-1111-1111-1111-111111111112', 'ICICI', 'ICICI Bank',  'partners@icici.dev',
     'REST'::loan.partner_bank_adapter_type, 'icici-hmac', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan.loan_products (id, bank_id, product_code, product_name, description,
                                min_amount, max_amount, interest_rate_min_pct, interest_rate_max_pct,
                                tenure_min_months, tenure_max_months, processing_fee_pct,
                                is_active, created_at, updated_at)
VALUES
    ('52222222-2222-2222-2222-222222222221', '51111111-1111-1111-1111-111111111111',
     'HDFC-MSME-WC', 'HDFC MSME Working Capital',
     'Short-tenure working capital loan for MSMEs.',
     100000, 5000000, 11.5, 14.0, 12, 36, 1.50, TRUE, NOW(), NOW()),
    ('52222222-2222-2222-2222-222222222222', '51111111-1111-1111-1111-111111111112',
     'ICICI-EQUIP', 'ICICI Equipment Finance',
     'Term loan for plant and equipment purchase.',
     500000, 20000000, 12.0, 15.5, 24, 84, 2.00, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan.applications (id, org_id, user_id, loan_product_id,
                               requested_amount, tenure_months, purpose, status,
                               submitted_at, created_at, updated_at)
VALUES
    ('53333333-3333-3333-3333-333333333331',
     '44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     '52222222-2222-2222-2222-222222222221',
     1500000, 24, 'Inventory expansion for FY26 festive season', 'SUBMITTED',
     NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- GST — invoices and ITC records (the page that shows "ITC Mismatch" needs both)
-- ──────────────────────────────────────────────────────────────────────────
-- Schema (migration 019): table is gst.gst_invoice (singular). Total column is
-- total_invoice_value (not total_amount); there is no place_of_supply column here.
INSERT INTO gst.gst_invoice (id, organization_id, invoice_number, invoice_date,
                             supplier_gstin, supplier_name, buyer_gstin,
                             taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount,
                             total_invoice_value, invoice_type,
                             created_at, updated_at)
VALUES
    ('61111111-1111-1111-1111-111111111111',
     '44444444-4444-4444-4444-444444444444',
     'INV-2025-001', DATE '2025-04-15',
     '27ABCDE1234F1Z5', 'Mumbai Steel Suppliers',
     '29AAAAA0000A1Z5',
     100000.00, 0.00, 9000.00, 9000.00, 0.00, 118000.00,
     'B2B',
     NOW(), NOW()),
    ('61111111-1111-1111-1111-111111111112',
     '44444444-4444-4444-4444-444444444444',
     'INV-2025-002', DATE '2025-04-22',
     '27ABCDE1234F1Z5', 'Mumbai Steel Suppliers',
     '29AAAAA0000A1Z5',
      50000.00, 9000.00, 0.00, 0.00, 0.00,  59000.00,
     'B2B',
     NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Schema (migration 019): table is gst.itc_record (singular).
INSERT INTO gst.itc_record (id, organization_id, supplier_gstin, supplier_name,
                            invoice_number, invoice_date,
                            igst_credit, cgst_credit, sgst_credit, cess_credit,
                            is_eligible, source, created_at, updated_at)
VALUES
    ('62222222-2222-2222-2222-222222222221',
     '44444444-4444-4444-4444-444444444444',
     '27ABCDE1234F1Z5', 'Mumbai Steel Suppliers',
     'INV-2025-001', DATE '2025-04-15',
     0.00, 9000.00, 9000.00, 0.00, TRUE, 'GSTR_2B', NOW(), NOW()),
    -- Intentional discrepancy on INV-2025-002 to make ITC reconciliation produce a mismatch.
    ('62222222-2222-2222-2222-222222222222',
     '44444444-4444-4444-4444-444444444444',
     '27ABCDE1234F1Z5', 'Mumbai Steel Suppliers',
     'INV-2025-002', DATE '2025-04-22',
     8500.00, 0.00, 0.00, 0.00, TRUE, 'GSTR_2B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- ITR — assessee, filing, grievance
-- ──────────────────────────────────────────────────────────────────────────
-- Schema (migration 024): assessee_profiles is keyed per assessment year (`ay`
-- NOT NULL) and is user-scoped (no organization_id). PAN stored in `pan` (no
-- pan_cipher); no full_name/assessee_type columns.
INSERT INTO itr.assessee_profiles (id, user_id, ay, pan, pan_last4,
                                   residential_status,
                                   created_at, updated_at)
VALUES
    ('71111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'AY2025-26',
     'AABCU9603R', '7890',
     'RESIDENT',
     NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO itr.filings (id, user_id, assessee_profile_id, ay, itr_form, regime_chosen,
                         gross_total_income, total_deductions, total_income, total_tax, tax_paid,
                         refund_due, status, created_at, updated_at)
VALUES
    ('72222222-2222-2222-2222-222222222221',
     '33333333-3333-3333-3333-333333333333',
     '71111111-1111-1111-1111-111111111111',
     'AY2025-26', 'ITR-3', 'NEW',
     1200000, 150000, 1050000, 78000, 65000,
     -- filings_status_check (migration 024) has no 'COMPUTED'; computed-and-awaiting-review maps to UNDER_CA_REVIEW.
     0, 'UNDER_CA_REVIEW', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO itr.grievances (id, filing_id, assessee_id, raised_by_user_id,
                            subject, body, category, status, created_at, updated_at)
VALUES
    ('73333333-3333-3333-3333-333333333331',
     '72222222-2222-2222-2222-222222222221',
     '71111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'Refund mismatch on AY2025-26',
     'The refund_due computed by SnapAccount is ₹0 but my Form 26AS shows ₹3,200 of TDS not yet credited. Please review.',
     'REFUND', 'OPEN', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- CALLBACKS — a pending callback so /callbacks page shows something
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO callback.callbacks (id, org_id, user_id, requested_at,
                                category, priority, status,
                                created_at, updated_at)
VALUES
    ('81111111-1111-1111-1111-111111111111',
     '44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     NOW() - INTERVAL '4 hours',
     'GST', 'NORMAL', 'PENDING',
     NOW() - INTERVAL '4 hours', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- LOAN consent catalog already seeded by migration 032 (PR #1)
-- ──────────────────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS — an active subscription so the billing UI has data
-- (assumes plans seeded by 999_seed_reference_data.sql)
-- ──────────────────────────────────────────────────────────────────────────
-- Schema (migration 010): table is subscription.subscription (singular); user_id
-- is required; current_period_start/end are DATE. Plan code column is `code`.
INSERT INTO subscription.subscription (id, organization_id, user_id, plan_id, status,
                                       current_period_start, current_period_end,
                                       razorpay_customer_id, created_at, updated_at)
SELECT 'c1111111-1111-1111-1111-111111111111',
       '44444444-4444-4444-4444-444444444444',
       '33333333-3333-3333-3333-333333333333',
       p.id, 'ACTIVE',
       date_trunc('month', NOW())::date,
       (date_trunc('month', NOW()) + INTERVAL '1 month')::date,
       'cust_dev_acme', NOW(), NOW()
FROM subscription.subscription_plan p
WHERE p.code IS NOT NULL
ORDER BY p.created_at LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- VERIFY — quick row counts so re-running shows what's seeded
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    RAISE NOTICE '✓ loan.partner_banks   : % rows', (SELECT COUNT(*) FROM loan.partner_banks);
    RAISE NOTICE '✓ loan.loan_products   : % rows', (SELECT COUNT(*) FROM loan.loan_products);
    RAISE NOTICE '✓ loan.applications    : % rows', (SELECT COUNT(*) FROM loan.applications);
    RAISE NOTICE '✓ gst.gst_invoice      : % rows', (SELECT COUNT(*) FROM gst.gst_invoice);
    RAISE NOTICE '✓ gst.itc_record       : % rows', (SELECT COUNT(*) FROM gst.itc_record);
    RAISE NOTICE '✓ itr.assessee_profiles: % rows', (SELECT COUNT(*) FROM itr.assessee_profiles);
    RAISE NOTICE '✓ itr.filings          : % rows', (SELECT COUNT(*) FROM itr.filings);
    RAISE NOTICE '✓ itr.grievances       : % rows', (SELECT COUNT(*) FROM itr.grievances);
    RAISE NOTICE '✓ callback.callbacks   : % rows', (SELECT COUNT(*) FROM callback.callbacks);
    RAISE NOTICE '✓ subscription.subscription : % rows', (SELECT COUNT(*) FROM subscription.subscription);
END $$;
