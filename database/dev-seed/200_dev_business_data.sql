-- =============================================================================
-- 200_dev_business_data.sql — Dev-only business data across services
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
--   subscription.* → cxxxxxxx-…
--
-- Rewritten 2026-05-17 to match real schemas. The previous version drifted —
-- referenced non-existent tables (gst.gst_invoices/itc_records,
-- subscription.subscriptions) and wrong columns (loan.partner_banks.bank_name
-- when the real column is `name`, missing required NOT NULL `adapter_type`).
-- =============================================================================

\set ON_ERROR_STOP on

-- Anchor IDs from 100_dev_users.sql
-- org_id  = '44444444-4444-4444-4444-444444444444'  (Acme Trading Co.)
-- user_id = '33333333-3333-3333-3333-333333333333'  (Acme owner)
-- ca_id   = '22222222-2222-2222-2222-222222222222'  (Test CA)

-- ──────────────────────────────────────────────────────────────────────────
-- LOANS — partner banks, products, and an application
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO loan.partner_banks (id, bank_code, name, adapter_type, contact_email,
                                is_active, created_at, updated_at)
VALUES
    ('51111111-1111-1111-1111-111111111111', 'HDFC',  'HDFC Bank',  'EMAIL', 'partners@hdfc.dev',
     TRUE, NOW(), NOW()),
    ('51111111-1111-1111-1111-111111111112', 'ICICI', 'ICICI Bank', 'REST',  'partners@icici.dev',
     TRUE, NOW(), NOW())
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
     'ICICI-BIZ-LOAN', 'ICICI Business Loan',
     'Unsecured business loan up to ₹50L for established MSMEs.',
     200000, 5000000, 12.0, 16.0, 12, 60, 2.00, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan.applications (id, org_id, user_id, loan_product_id,
                               requested_amount, tenure_months, purpose, status,
                               submitted_at, created_at, updated_at)
VALUES
    ('53333333-3333-3333-3333-333333333331',
     '44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     '52222222-2222-2222-2222-222222222221',
     1500000, 24, 'Working capital for Q2 inventory expansion',
     'UNDER_REVIEW', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- GST — return + invoices (real tables are singular: gst_invoice / gst_return)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO gst.gst_return (id, organization_id, return_type, financial_year,
                            period_month, gstin, status, total_taxable_value,
                            total_igst, total_cgst, total_sgst,
                            filing_deadline, created_at, updated_at)
VALUES
    ('61111111-1111-1111-1111-111111111111',
     '44444444-4444-4444-4444-444444444444',
     'GSTR-3B', '2026-27', 5,
     '27AABCU9603R1ZX', 'DRAFT',
     500000, 0, 45000, 45000,
     DATE '2026-06-20', NOW() - INTERVAL '5 days', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO gst.gst_invoice (id, organization_id, gst_return_id, invoice_type,
                             invoice_number, invoice_date, supplier_gstin, supplier_name,
                             buyer_gstin, buyer_name, buyer_state_code,
                             taxable_value, igst_amount, cgst_amount, sgst_amount,
                             total_invoice_value, created_at, updated_at)
VALUES
    ('62222222-2222-2222-2222-222222222221',
     '44444444-4444-4444-4444-444444444444',
     '61111111-1111-1111-1111-111111111111',
     'B2B', 'INV/2026/0042', DATE '2026-05-10',
     '27AABCU9603R1ZX', 'Acme Trading Co.',
     '07AABCS1234Z1ZP', 'Delhi Distributors Pvt Ltd', '07',
     300000, 54000, 0, 0,
     354000, NOW() - INTERVAL '7 days', NOW()),
    ('62222222-2222-2222-2222-222222222222',
     '44444444-4444-4444-4444-444444444444',
     '61111111-1111-1111-1111-111111111111',
     'B2B', 'PUR/2026/0017', DATE '2026-05-08',
     '24AAACS9876R1ZA', 'Gujarat Supplies LLP',
     '27AABCU9603R1ZX', 'Acme Trading Co.', '27',
     200000, 36000, 0, 0,
     236000, NOW() - INTERVAL '9 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- ITR — assessee profile + filing
-- (assessee_profiles keyed by user_id + ay, not organization_id)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO itr.assessee_profiles (id, user_id, ay, pan_last4, residential_status,
                                   occupation, created_at, updated_at)
VALUES
    ('71111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     '2026-27', '603R', 'RESIDENT', 'BUSINESS_OWNER',
     NOW() - INTERVAL '14 days', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO itr.filings (id, user_id, assessee_profile_id, ay, itr_form, regime_chosen,
                         status, gross_total_income, total_deductions, total_income,
                         total_tax, tax_paid, payable,
                         created_at, updated_at)
VALUES
    ('72222222-2222-2222-2222-222222222222',
     '33333333-3333-3333-3333-333333333333',
     '71111111-1111-1111-1111-111111111111',
     '2026-27', 'ITR-3', 'NEW',
     'DRAFT', 1800000, 250000, 1550000,
     232500, 200000, 32500,
     NOW() - INTERVAL '10 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- CALLBACK — one pending request
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO callback.callbacks (id, org_id, user_id, category, priority, status,
                                reason_text, sla_due_at,
                                created_at, updated_at)
VALUES
    ('81111111-1111-1111-1111-111111111111',
     '44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     'GST', 'NORMAL', 'PENDING',
     'Need help understanding ITC mismatch in May 2026 return.',
     NOW() + INTERVAL '24 hours',
     NOW() - INTERVAL '2 hours', NOW())
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTION — a plan + the Acme org's active subscription
-- (real tables are singular: subscription / subscription_plan)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO subscription.subscription_plan (id, code, name, description, billing_cycle,
                                             price_inr, trial_days,
                                             max_organizations, max_documents_per_month,
                                             max_users, max_gst_returns_per_year,
                                             max_itr_returns_per_year, max_loan_applications_per_year,
                                             has_advanced_reports, has_ca_consultation,
                                             has_priority_support,
                                             sort_order, is_active, is_publicly_visible,
                                             created_at, updated_at)
VALUES
    ('c1111111-1111-1111-1111-111111111111',
     'BUSINESS_PLUS', 'Business Plus', 'For growing MSMEs with multi-state GST', 'MONTHLY',
     2499, 14,
     3, 200,
     5, 24,
     5, 4,
     TRUE, TRUE, TRUE,
     10, TRUE, TRUE,
     NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscription.subscription (id, organization_id, user_id, plan_id, status,
                                        billing_cycle, current_period_start, current_period_end,
                                        auto_renew, created_at, updated_at)
VALUES
    ('c2222222-2222-2222-2222-222222222222',
     '44444444-4444-4444-4444-444444444444',
     '33333333-3333-3333-3333-333333333333',
     'c1111111-1111-1111-1111-111111111111',
     'ACTIVE', 'MONTHLY',
     DATE '2026-05-01', DATE '2026-06-01',
     TRUE, NOW() - INTERVAL '17 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Status summary
-- =============================================================================
SELECT 'Dev business data seeded' AS status,
       (SELECT COUNT(*) FROM loan.partner_banks)            AS partner_banks,
       (SELECT COUNT(*) FROM loan.loan_products)            AS loan_products,
       (SELECT COUNT(*) FROM loan.applications)             AS loan_applications,
       (SELECT COUNT(*) FROM gst.gst_return)                AS gst_returns,
       (SELECT COUNT(*) FROM gst.gst_invoice)               AS gst_invoices,
       (SELECT COUNT(*) FROM itr.assessee_profiles)         AS itr_profiles,
       (SELECT COUNT(*) FROM itr.filings)                   AS itr_filings,
       (SELECT COUNT(*) FROM callback.callbacks)            AS callbacks,
       (SELECT COUNT(*) FROM subscription.subscription_plan) AS sub_plans,
       (SELECT COUNT(*) FROM subscription.subscription)     AS subscriptions;
