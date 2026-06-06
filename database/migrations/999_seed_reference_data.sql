-- =============================================================================
-- 999_seed_reference_data.sql
-- Reference / Seed Data for SnapAccount
-- Run AFTER all schema migrations (000 through 012).
-- =============================================================================

-- =============================================================================
-- 1. System Roles
-- =============================================================================
INSERT INTO auth.role (id, name, display_name, description, is_system_role, is_active)
VALUES
    (gen_random_uuid(), 'BUSINESS_OWNER',       'Business Owner',           'SME owner managing their business finances', TRUE, TRUE),
    (gen_random_uuid(), 'EMPLOYEE',             'Employee',                 'Salaried employee filing ITR', TRUE, TRUE),
    (gen_random_uuid(), 'DATA_ENTRY_OPERATOR',  'Data Entry Operator',      'Verifies OCR data and creates accounting entries', TRUE, TRUE),
    (gen_random_uuid(), 'SUPPORT_EXECUTIVE',    'Support Executive',        'Calls users, provides support, files GST/ITR', TRUE, TRUE),
    (gen_random_uuid(), 'CA',                   'Chartered Accountant',     'Reviews financials, expert chat, tax computations', TRUE, TRUE),
    (gen_random_uuid(), 'OPERATIONS_MANAGER',   'Operations Manager',       'Manages team, monitors KPIs, handles escalations', TRUE, TRUE),
    -- Platform super-admin is seeded canonically as SUPER_ADMIN by migration 036
    -- (legacy SYSTEM_ADMIN retired in migration 041 — see two-families role decision).
    (gen_random_uuid(), 'PARTNER_BANK_REP',     'Partner Bank Representative', 'Views loan applications, updates status', TRUE, TRUE)
-- Migration 035 replaced auth.role's plain UNIQUE(name) with partial unique indexes;
-- a bare ON CONFLICT (name) no longer matches any constraint (fails under
-- ON_ERROR_STOP on a clean full-sequence apply). These are system roles
-- (organization_id IS NULL), so target the system-role partial index — matching
-- the form used by migrations 036 and 059.
ON CONFLICT (name) WHERE organization_id IS NULL AND deleted_at IS NULL DO NOTHING;

-- =============================================================================
-- 2. GST Tax Rates (Temporal — valid_from = 2017-07-01, the date GST launched in India)
-- =============================================================================
INSERT INTO gst.gst_tax_rate (id, rate_name, rate_pct, cgst_pct, sgst_pct, igst_pct, cess_pct, valid_from, valid_to, is_active, notes)
VALUES
    (gen_random_uuid(), 'GST 0%',   0.00,  0.00, 0.00,  0.00, 0.00, '2017-07-01', NULL, TRUE, 'Nil rated goods and services'),
    (gen_random_uuid(), 'GST 5%',   5.00,  2.50, 2.50,  5.00, 0.00, '2017-07-01', NULL, TRUE, 'Essential items, basic food, small restaurants'),
    (gen_random_uuid(), 'GST 12%',  12.00, 6.00, 6.00, 12.00, 0.00, '2017-07-01', NULL, TRUE, 'Processed food, some services'),
    (gen_random_uuid(), 'GST 18%',  18.00, 9.00, 9.00, 18.00, 0.00, '2017-07-01', NULL, TRUE, 'Standard rate — most goods and services'),
    (gen_random_uuid(), 'GST 28%',  28.00, 14.00, 14.00, 28.00, 0.00, '2017-07-01', NULL, TRUE, 'Luxury goods, demerit goods, automobiles'),
    -- Special composite scheme rates
    (gen_random_uuid(), 'GST 0.25%', 0.25, 0.125, 0.125, 0.25, 0.00, '2017-07-01', NULL, TRUE, 'Rough/semi-polished diamonds'),
    (gen_random_uuid(), 'GST 1.5%', 1.50,  0.75, 0.75,  1.50, 0.00, '2017-07-01', NULL, TRUE, 'Composition scheme — manufacturers'),
    (gen_random_uuid(), 'GST 3%',   3.00,  1.50, 1.50,  3.00, 0.00, '2017-07-01', NULL, TRUE, 'Gold, silver, precious metals'),
    (gen_random_uuid(), 'GST 6%',   6.00,  3.00, 3.00,  6.00, 0.00, '2017-07-01', NULL, TRUE, 'Composition scheme — services'),
    -- Cess rates (luxury/sin goods)
    (gen_random_uuid(), 'GST 28% + Cess 12%', 28.00, 14.00, 14.00, 28.00, 12.00, '2017-07-01', NULL, TRUE, 'Aerated drinks with cess'),
    (gen_random_uuid(), 'GST 28% + Cess 15%', 28.00, 14.00, 14.00, 28.00, 15.00, '2017-07-01', NULL, TRUE, 'Cigarettes with cess')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Tax Regimes
-- =============================================================================
INSERT INTO itr.tax_regime (id, code, name, description, is_default, is_active)
VALUES
    (gen_random_uuid(), 'OLD_REGIME', 'Old Tax Regime', 'Pre-2020 tax regime with deductions (80C, 80D, HRA, etc.)', FALSE, TRUE),
    (gen_random_uuid(), 'NEW_REGIME', 'New Tax Regime', 'Post-2020 concessional regime with lower rates but fewer deductions. Default from FY 2023-24.', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 4. Tax Slabs — FY 2024-25 (Assessment Year 2025-26)
-- Source: Union Budget 2024 (Interim + Full Budget July 2024)
-- =============================================================================

-- New Regime FY 2024-25 (post July 2024 Budget revision)
-- Up to 3L: Nil, 3-7L: 5%, 7-10L: 10%, 10-12L: 15%, 12-15L: 20%, 15L+: 30%
-- 87A rebate: Full rebate if income <= 7L (tax becomes 0)
WITH new_regime AS (SELECT id FROM itr.tax_regime WHERE code = 'NEW_REGIME')
INSERT INTO itr.tax_slab (id, tax_regime_id, financial_year, slab_order, income_from, income_to, tax_rate_pct, cess_pct, rebate_u87a, valid_from, valid_to, notes)
SELECT
    gen_random_uuid(),
    new_regime.id,
    '2024-25',
    slab.slab_order,
    slab.income_from,
    slab.income_to,
    slab.tax_rate_pct,
    4.00,
    slab.rebate_u87a,
    '2024-04-01',
    NULL,
    'FY 2024-25 New Regime — Union Budget 2024'
FROM new_regime, (VALUES
    (1, 0,        300000,    0.00,  25000),
    (2, 300000,   700000,    5.00,  25000),
    (3, 700000,   1000000,  10.00,      0),
    (4, 1000000,  1200000,  15.00,      0),
    (5, 1200000,  1500000,  20.00,      0),
    (6, 1500000,  NULL,     30.00,      0)
) AS slab(slab_order, income_from, income_to, tax_rate_pct, rebate_u87a)
ON CONFLICT DO NOTHING;

-- Old Regime FY 2024-25
-- Up to 2.5L: Nil, 2.5-5L: 5%, 5-10L: 20%, 10L+: 30%
-- 87A rebate: Full rebate if income <= 5L (tax becomes 0)
WITH old_regime AS (SELECT id FROM itr.tax_regime WHERE code = 'OLD_REGIME')
INSERT INTO itr.tax_slab (id, tax_regime_id, financial_year, slab_order, income_from, income_to, tax_rate_pct, cess_pct, rebate_u87a, valid_from, valid_to, notes)
SELECT
    gen_random_uuid(),
    old_regime.id,
    '2024-25',
    slab.slab_order,
    slab.income_from,
    slab.income_to,
    slab.tax_rate_pct,
    4.00,
    slab.rebate_u87a,
    '2024-04-01',
    NULL,
    'FY 2024-25 Old Regime'
FROM old_regime, (VALUES
    (1, 0,         250000,   0.00,  12500),
    (2, 250000,    500000,   5.00,  12500),
    (3, 500000,   1000000,  20.00,      0),
    (4, 1000000,  NULL,     30.00,      0)
) AS slab(slab_order, income_from, income_to, tax_rate_pct, rebate_u87a)
ON CONFLICT DO NOTHING;

-- Senior Citizen Old Regime FY 2024-25 (60–80 years: basic exemption 3L)
-- Note: Senior citizen slabs would typically be separate tax_regime entries
-- Kept simple here; application logic handles age-based slab selection

-- =============================================================================
-- 5. HSN/SAC Common Codes (20+ common codes used by Indian SMEs)
-- =============================================================================
INSERT INTO gst.hsn_sac_code (id, code, code_type, description, gst_rate_pct, is_active)
VALUES
    -- SAC Codes (Services)
    (gen_random_uuid(), '998311', 'SAC', 'Management consulting and management services', 18.00, TRUE),
    (gen_random_uuid(), '998314', 'SAC', 'IT consulting and support services', 18.00, TRUE),
    (gen_random_uuid(), '998315', 'SAC', 'Computer programming and software development', 18.00, TRUE),
    (gen_random_uuid(), '996111', 'SAC', 'Freight transport by road', 5.00, TRUE),
    (gen_random_uuid(), '996211', 'SAC', 'Restaurant services', 5.00, TRUE),
    (gen_random_uuid(), '997212', 'SAC', 'Rental or leasing services involving own or leased non-residential property', 18.00, TRUE),
    (gen_random_uuid(), '998211', 'SAC', 'Legal advisory and representation services', 18.00, TRUE),
    (gen_random_uuid(), '998221', 'SAC', 'Accounting, auditing and bookkeeping services', 18.00, TRUE),
    (gen_random_uuid(), '997331', 'SAC', 'Licensing services for the right to use computer software', 18.00, TRUE),
    (gen_random_uuid(), '999721', 'SAC', 'Education services — higher education', 0.00, TRUE),
    -- HSN Codes (Goods)
    (gen_random_uuid(), '8471',   'HSN', 'Computers, laptops, printers and peripherals', 18.00, TRUE),
    (gen_random_uuid(), '8517',   'HSN', 'Mobile phones and telephone equipment', 18.00, TRUE),
    (gen_random_uuid(), '8516',   'HSN', 'Electric water heaters, hair dryers, domestic appliances', 28.00, TRUE),
    (gen_random_uuid(), '8703',   'HSN', 'Motor cars and other motor vehicles', 28.00, TRUE),
    (gen_random_uuid(), '1001',   'HSN', 'Wheat and meslin', 0.00, TRUE),
    (gen_random_uuid(), '1006',   'HSN', 'Rice (milled)', 5.00, TRUE),
    (gen_random_uuid(), '2106',   'HSN', 'Food preparations not elsewhere specified', 18.00, TRUE),
    (gen_random_uuid(), '3004',   'HSN', 'Pharmaceutical products — medicaments', 12.00, TRUE),
    (gen_random_uuid(), '4901',   'HSN', 'Printed books, newspapers, pictures', 0.00, TRUE),
    (gen_random_uuid(), '6101',   'HSN', 'Mens overcoats, jackets and similar articles of apparel', 5.00, TRUE),
    (gen_random_uuid(), '7108',   'HSN', 'Gold (including gold plated with platinum)', 3.00, TRUE),
    (gen_random_uuid(), '7113',   'HSN', 'Articles of jewellery and parts thereof, of precious metal', 3.00, TRUE),
    (gen_random_uuid(), '9403',   'HSN', 'Other furniture and parts thereof', 18.00, TRUE),
    (gen_random_uuid(), '6302',   'HSN', 'Bed linen, table linen, toilet linen and kitchen linen', 5.00, TRUE),
    (gen_random_uuid(), '8528',   'HSN', 'Monitors, projectors, television sets', 18.00, TRUE)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 6. Document Categories
-- =============================================================================
INSERT INTO document.document_category (id, code, name, description, is_active, sort_order)
VALUES
    (gen_random_uuid(), 'SALES_BILL',         'Sales Bill',          'Invoice issued to customers for goods/services sold', TRUE, 1),
    (gen_random_uuid(), 'PURCHASE_BILL',      'Purchase Bill',       'Invoice received from suppliers for goods/services purchased', TRUE, 2),
    (gen_random_uuid(), 'EXPENSE_RECEIPT',    'Expense Receipt',     'Receipts for business expenses (travel, utilities, etc.)', TRUE, 3),
    (gen_random_uuid(), 'BANK_STATEMENT',     'Bank Statement',      'Monthly bank account statements', TRUE, 4),
    (gen_random_uuid(), 'SALARY_SLIP',        'Salary Slip',         'Employee salary slips', TRUE, 5),
    (gen_random_uuid(), 'FORM_16',            'Form 16',             'TDS certificate from employer (Form 16 A+B)', TRUE, 6),
    (gen_random_uuid(), 'FORM_26AS',          'Form 26AS / AIS',     'Annual Information Statement from Income Tax portal', TRUE, 7),
    (gen_random_uuid(), 'GST_INVOICE',        'GST Invoice',         'GST-compliant tax invoices', TRUE, 8),
    (gen_random_uuid(), 'KYC_DOCUMENT',       'KYC Document',        'Identity proof — PAN card, Aadhaar, Passport, etc.', TRUE, 9),
    (gen_random_uuid(), 'CREDIT_NOTE',        'Credit Note',         'Credit note issued or received', TRUE, 10),
    (gen_random_uuid(), 'DEBIT_NOTE',         'Debit Note',          'Debit note issued or received', TRUE, 11),
    (gen_random_uuid(), 'MSME_CERTIFICATE',   'MSME Certificate',    'Udyam registration certificate', TRUE, 12),
    (gen_random_uuid(), 'INCORPORATION_DOC',  'Incorporation Document', 'Company registration, MOA, AOA, partnership deed', TRUE, 13),
    (gen_random_uuid(), 'OTHER',              'Other',               'Miscellaneous documents', TRUE, 99)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 7. Subscription Plans
-- =============================================================================
INSERT INTO subscription.subscription_plan (
    id, code, name, description, billing_cycle,
    price_inr, original_price_inr, trial_days,
    max_organizations, max_documents_per_month, max_users,
    max_gst_returns_per_year, max_itr_returns_per_year, max_loan_applications_per_year,
    ai_queries_per_month,
    has_advanced_reports, has_ca_consultation, has_priority_support,
    has_tally_export, has_api_access, has_whatsapp_notifications,
    sort_order, is_active, is_publicly_visible
)
VALUES
    (
        gen_random_uuid(), 'FREE', 'Free', 'Get started with basic features at no cost',
        'MONTHLY', 0.00, NULL, 0,
        1, 50, 1,
        6, 1, 1,
        10,
        FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
        1, TRUE, TRUE
    ),
    (
        gen_random_uuid(), 'BASIC', 'Basic', 'Essential tools for small businesses',
        'MONTHLY', 499.00, NULL, 14,
        1, 200, 3,
        12, 5, 3,
        50,
        TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
        2, TRUE, TRUE
    ),
    (
        gen_random_uuid(), 'PRO', 'Pro', 'Complete accounting and filing solution for growing businesses',
        'MONTHLY', 999.00, 1499.00, 14,
        3, 1000, 10,
        NULL, NULL, NULL,
        200,
        TRUE, TRUE, TRUE, TRUE, FALSE, TRUE,
        3, TRUE, TRUE
    ),
    (
        gen_random_uuid(), 'ENTERPRISE', 'Enterprise', 'Unlimited access with API and dedicated support',
        'MONTHLY', 2499.00, 3499.00, 30,
        NULL, NULL, NULL,
        NULL, NULL, NULL,
        NULL,
        TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
        4, TRUE, TRUE
    )
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 8. Default Notification Templates
-- =============================================================================
INSERT INTO notification.notification_template (id, code, name, event_type, channel, language, subject, body_template, push_title_template, push_body_template, variables, is_active)
VALUES

-- Welcome notification (multi-channel)
(gen_random_uuid(), 'WELCOME_USER_PUSH', 'Welcome User — Push', 'USER_REGISTERED', 'PUSH', 'en',
 NULL, 'Welcome to SnapAccount, {{user_name}}! Your financial journey starts here.', 'Welcome to SnapAccount!',
 'Hi {{user_name}}, we''re glad to have you. Start by uploading your first document.',
 '["user_name"]', TRUE),

(gen_random_uuid(), 'WELCOME_USER_SMS', 'Welcome User — SMS', 'USER_REGISTERED', 'SMS', 'en',
 NULL, 'Welcome to SnapAccount, {{user_name}}! Download our app and snap your first bill today. -SnapAccount',
 NULL, NULL, '["user_name"]', TRUE),

(gen_random_uuid(), 'WELCOME_USER_EMAIL', 'Welcome User — Email', 'USER_REGISTERED', 'EMAIL', 'en',
 'Welcome to SnapAccount — Your Smart Financial Assistant',
 'Dear {{user_name}},\n\nWelcome to SnapAccount! We are delighted to have you on board.\n\nGet started by uploading your first document using the mobile app.\n\nBest regards,\nTeam SnapAccount',
 NULL, NULL, '["user_name"]', TRUE),

-- OTP notification
(gen_random_uuid(), 'OTP_AUTH_SMS', 'OTP Authentication — SMS', 'OTP_REQUESTED', 'SMS', 'en',
 NULL, '{{otp}} is your SnapAccount OTP. Valid for 5 minutes. Do not share this OTP with anyone. -SnapAccount',
 NULL, NULL, '["otp"]', TRUE),

-- Document processed
(gen_random_uuid(), 'DOCUMENT_PROCESSED_PUSH', 'Document Processed — Push', 'DOCUMENT_PROCESSED', 'PUSH', 'en',
 NULL, 'Your document "{{document_name}}" has been processed successfully.', 'Document Processed',
 '"{{document_name}}" is ready for review.',
 '["document_name"]', TRUE),

-- GST return filed
(gen_random_uuid(), 'GST_RETURN_FILED_PUSH', 'GST Return Filed — Push', 'GST_RETURN_FILED', 'PUSH', 'en',
 NULL, 'Your {{return_type}} for {{period}} has been successfully filed. ARN: {{arn_number}}', 'GST Return Filed',
 '{{return_type}} filed for {{period}}. ARN: {{arn_number}}',
 '["return_type", "period", "arn_number"]', TRUE),

(gen_random_uuid(), 'GST_RETURN_FILED_SMS', 'GST Return Filed — SMS', 'GST_RETURN_FILED', 'SMS', 'en',
 NULL, 'SnapAccount: Your {{return_type}} for {{period}} is filed. ARN: {{arn_number}}. -SnapAccount',
 NULL, NULL, '["return_type", "period", "arn_number"]', TRUE),

-- GST filing reminder (7 days)
(gen_random_uuid(), 'GST_FILING_REMINDER_7D_PUSH', 'GST Filing Reminder 7 Days — Push', 'GST_FILING_REMINDER', 'PUSH', 'en',
 NULL, 'Reminder: Your {{return_type}} for {{period}} is due on {{due_date}}. 7 days remaining.', 'GST Filing Reminder',
 '{{return_type}} due on {{due_date}}. File now to avoid late fees.',
 '["return_type", "period", "due_date"]', TRUE),

-- GST filing reminder (3 days)
(gen_random_uuid(), 'GST_FILING_REMINDER_3D_PUSH', 'GST Filing Reminder 3 Days — Push', 'GST_FILING_REMINDER_3D', 'PUSH', 'en',
 NULL, 'Urgent: Your {{return_type}} for {{period}} is due in 3 days on {{due_date}}.', 'GST Filing Due Soon',
 '3 days left to file {{return_type}}. Tap to review and file now.',
 '["return_type", "period", "due_date"]', TRUE),

-- ITR filed
(gen_random_uuid(), 'ITR_FILED_PUSH', 'ITR Filed — Push', 'ITR_FILED', 'PUSH', 'en',
 NULL, 'Your ITR for FY {{financial_year}} has been filed. Acknowledgement: {{ack_number}}', 'ITR Filed Successfully',
 'ITR FY {{financial_year}} filed. Ack: {{ack_number}}. Please e-verify within 30 days.',
 '["financial_year", "ack_number"]', TRUE),

-- E-verification reminder
(gen_random_uuid(), 'ITR_EVERIFY_REMINDER_PUSH', 'ITR E-Verify Reminder — Push', 'ITR_EVERIFY_REMINDER', 'PUSH', 'en',
 NULL, 'Please e-verify your ITR for FY {{financial_year}}. {{days_remaining}} days remaining.', 'E-Verify Your ITR',
 'E-verify ITR FY {{financial_year}} — {{days_remaining}} days left.',
 '["financial_year", "days_remaining"]', TRUE),

-- Loan status update
(gen_random_uuid(), 'LOAN_STATUS_PUSH', 'Loan Status Update — Push', 'LOAN_STATUS_CHANGED', 'PUSH', 'en',
 NULL, 'Your loan application {{application_number}} status has been updated to {{status}}.', 'Loan Update',
 'Application {{application_number}}: {{status}}',
 '["application_number", "status"]', TRUE),

-- Subscription renewal reminder
(gen_random_uuid(), 'SUBSCRIPTION_RENEWAL_PUSH', 'Subscription Renewal Reminder — Push', 'SUBSCRIPTION_EXPIRING', 'PUSH', 'en',
 NULL, 'Your {{plan_name}} subscription expires on {{expiry_date}}. Renew now to continue using all features.', 'Subscription Expiring',
 '{{plan_name}} plan expires on {{expiry_date}}.',
 '["plan_name", "expiry_date"]', TRUE),

-- New chat message
(gen_random_uuid(), 'CHAT_MESSAGE_PUSH', 'New Chat Message — Push', 'CHAT_MESSAGE_RECEIVED', 'PUSH', 'en',
 NULL, 'New message from {{sender_name}}: {{message_preview}}', 'New Message',
 '{{sender_name}}: {{message_preview}}',
 '["sender_name", "message_preview"]', TRUE),

-- ITC mismatch alert
(gen_random_uuid(), 'ITC_MISMATCH_PUSH', 'ITC Mismatch Alert — Push', 'ITC_MISMATCH_DETECTED', 'PUSH', 'en',
 NULL, 'ITC mismatch detected in {{period}}. Claimed: ₹{{claimed_amount}}, Available: ₹{{available_amount}}. Please review.', 'ITC Mismatch Detected',
 'ITC mismatch in {{period}}. Tap to resolve.',
 '["period", "claimed_amount", "available_amount"]', TRUE),

-- Appointment confirmed
(gen_random_uuid(), 'APPOINTMENT_CONFIRMED_PUSH', 'Appointment Confirmed — Push', 'APPOINTMENT_CONFIRMED', 'PUSH', 'en',
 NULL, 'Your consultation with {{ca_name}} is confirmed for {{appointment_date}} at {{appointment_time}}.', 'Appointment Confirmed',
 'Meeting with {{ca_name}} on {{appointment_date}} at {{appointment_time}}.',
 '["ca_name", "appointment_date", "appointment_time"]', TRUE),

-- Password reset (web admin)
(gen_random_uuid(), 'PASSWORD_RESET_EMAIL', 'Password Reset — Email', 'PASSWORD_RESET_REQUESTED', 'EMAIL', 'en',
 'Reset your SnapAccount password',
 'Dear {{user_name}},\n\nClick the link below to reset your password. This link is valid for 1 hour.\n\n{{reset_link}}\n\nIf you did not request this, ignore this email.\n\nRegards,\nTeam SnapAccount',
 NULL, NULL, '["user_name", "reset_link"]', TRUE)

ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 9. Feature Flags (default state)
-- =============================================================================
INSERT INTO shared.feature_flag (id, flag_key, name, description, is_enabled, rollout_percentage)
VALUES
    (gen_random_uuid(), 'WHATSAPP_NOTIFICATIONS',    'WhatsApp Notifications',    'Enable WhatsApp Business API for notifications. Requires credentials in system config.', FALSE, 0),
    (gen_random_uuid(), 'TALLY_EXPORT',              'Tally XML Export',           'Enable export of financial data in Tally-compatible XML format.', FALSE, 0),
    (gen_random_uuid(), 'AI_CHATBOT',                'AI Chatbot',                 'Enable AI-powered first response before routing to CA.', TRUE, 100),
    (gen_random_uuid(), 'E_INVOICING',               'E-Invoicing (IRN)',          'Enable e-invoice generation via NIC portal. Required for turnover > 5 Crore.', FALSE, 0),
    (gen_random_uuid(), 'E_WAY_BILL',                'E-Way Bill',                 'Enable e-way bill generation for goods movement > 50,000 INR.', FALSE, 0),
    (gen_random_uuid(), 'LOAN_MODULE',               'Loan Hub',                   'Enable the loan application and partner bank integration module.', TRUE, 100),
    (gen_random_uuid(), 'VIDEO_CONSULTATION',        'Video Consultation',         'Enable video call booking with CAs via Google Meet / Zoom.', TRUE, 100),
    (gen_random_uuid(), 'CASH_FLOW_FORECASTING',     'Cash Flow Forecasting',      'Enable AI-powered cash flow forecasting (requires AI service).', FALSE, 0),
    (gen_random_uuid(), 'ANOMALY_DETECTION',         'Anomaly Detection',          'Enable AI-powered anomaly detection for transactions and filings.', FALSE, 0),
    (gen_random_uuid(), 'MULTI_ORG',                 'Multi-Organization Support', 'Allow users to manage multiple business organizations.', TRUE, 100),
    (gen_random_uuid(), 'SARVAM_AI',                 'Sarvam AI Indian Languages', 'Enable Sarvam AI for Indian language NLP support.', FALSE, 0),
    (gen_random_uuid(), 'RAZORPAY_SUBSCRIPTIONS',    'Razorpay Subscriptions',     'Enable Razorpay recurring subscription billing.', FALSE, 0)
ON CONFLICT (flag_key) DO NOTHING;

-- =============================================================================
-- 10. System Configuration Defaults
-- =============================================================================
INSERT INTO shared.system_configuration (id, category, key, value, value_type, description, is_sensitive)
VALUES
    -- AI Model Configuration
    (gen_random_uuid(), 'AI_MODEL',      'default_chat_model',       'gemini-pro',             'STRING',  'Default LLM model for AI chatbot', FALSE),
    (gen_random_uuid(), 'AI_MODEL',      'default_embedding_model',  'text-embedding-004',     'STRING',  'Default embedding model for RAG', FALSE),
    (gen_random_uuid(), 'AI_MODEL',      'vertex_ai_project_id',     '',                       'STRING',  'GCP project ID for Vertex AI (set via admin)', FALSE),
    (gen_random_uuid(), 'AI_MODEL',      'vertex_ai_region',         'asia-south1',            'STRING',  'GCP region for Vertex AI', FALSE),
    -- Payment Gateway
    (gen_random_uuid(), 'PAYMENT',       'gateway',                  'RAZORPAY',               'STRING',  'Active payment gateway', FALSE),
    (gen_random_uuid(), 'PAYMENT',       'razorpay_key_id_secret',   '',                       'SECRET_REF', 'GCP Secret Manager ref for Razorpay key_id', TRUE),
    (gen_random_uuid(), 'PAYMENT',       'razorpay_secret_secret',   '',                       'SECRET_REF', 'GCP Secret Manager ref for Razorpay secret', TRUE),
    (gen_random_uuid(), 'PAYMENT',       'gst_on_subscription_pct',  '18',                     'INTEGER', 'GST percentage applied on subscription charges', FALSE),
    -- Notification Providers
    (gen_random_uuid(), 'NOTIFICATION',  'sms_provider',             'MSG91',                  'STRING',  'Active SMS provider', FALSE),
    (gen_random_uuid(), 'NOTIFICATION',  'email_provider',           'SENDGRID',               'STRING',  'Active email provider', FALSE),
    (gen_random_uuid(), 'NOTIFICATION',  'push_provider',            'FCM',                    'STRING',  'Active push notification provider', FALSE),
    -- Compliance
    (gen_random_uuid(), 'COMPLIANCE',    'einvoice_turnover_threshold_cr', '5',                'INTEGER', 'Annual turnover (Crore INR) above which e-invoicing is mandatory', FALSE),
    (gen_random_uuid(), 'COMPLIANCE',    'eway_bill_threshold_inr',  '50000',                  'INTEGER', 'Transaction value above which e-way bill is mandatory', FALSE),
    (gen_random_uuid(), 'COMPLIANCE',    'document_retention_years', '7',                      'INTEGER', 'Minimum document retention in years (as per tax law)', FALSE),
    -- Platform
    (gen_random_uuid(), 'PLATFORM',      'max_devices_per_user',     '2',                      'INTEGER', 'Maximum active devices per user account', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'otp_validity_minutes',     '5',                      'INTEGER', 'OTP validity window in minutes', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'otp_max_attempts',         '3',                      'INTEGER', 'Maximum OTP attempts before cooldown', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'otp_cooldown_minutes',     '30',                     'INTEGER', 'Cooldown period in minutes after max OTP attempts', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'access_token_minutes',     '60',                     'INTEGER', 'JWT access token validity in minutes', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'refresh_token_days',       '30',                     'INTEGER', 'JWT refresh token validity in days', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'support_email',            'support@snapaccount.in', 'STRING',  'Platform support email address', FALSE),
    (gen_random_uuid(), 'PLATFORM',      'default_language',         'en',                     'STRING',  'Platform default language (BCP-47)', FALSE),
    -- Storage
    (gen_random_uuid(), 'STORAGE',       'gcs_bucket_documents',     '',                       'STRING',  'GCS bucket name for document storage', FALSE),
    (gen_random_uuid(), 'STORAGE',       'gcs_bucket_reports',       '',                       'STRING',  'GCS bucket name for generated reports', FALSE),
    (gen_random_uuid(), 'STORAGE',       'signed_url_expiry_minutes', '60',                    'INTEGER', 'GCS signed URL expiry in minutes', FALSE)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- 11. API Rate Limits (defaults)
-- =============================================================================
INSERT INTO shared.api_rate_limit (id, scope, identifier, max_requests, window_seconds, burst_limit, is_active)
VALUES
    (gen_random_uuid(), 'PER_IP',       'otp_request',          5,    300,  5,    TRUE),  -- 5 OTPs per 5 min per IP
    (gen_random_uuid(), 'PER_USER',     'otp_request',          3,    300,  3,    TRUE),  -- 3 OTPs per 5 min per user
    (gen_random_uuid(), 'PER_USER',     'document_upload',      100,  3600, 20,   TRUE),  -- 100 uploads per hour
    (gen_random_uuid(), 'PER_USER',     'ai_query',             60,   3600, 10,   TRUE),  -- 60 AI queries per hour
    (gen_random_uuid(), 'GLOBAL',       'api_gateway',          10000, 60,  500,  TRUE),  -- 10K req/min globally
    (gen_random_uuid(), 'PER_USER',     'chat_message',         200,  3600, 30,   TRUE),  -- 200 chat messages per hour
    (gen_random_uuid(), 'PER_IP',       'login_attempt',        10,   300,  10,   TRUE),  -- 10 login attempts per 5 min per IP
    (gen_random_uuid(), 'PER_USER',     'report_generation',    20,   3600, 5,    TRUE)   -- 20 report generations per hour
ON CONFLICT (scope, identifier) DO NOTHING;

-- =============================================================================
-- 12. Chat Query Categories
-- =============================================================================
INSERT INTO chat.chat_query (id, category, display_name, description, is_active, sort_order)
VALUES
    (gen_random_uuid(), 'GST',        'GST Queries',              'Questions about GST filing, ITC, e-invoicing, and compliance', TRUE, 1),
    (gen_random_uuid(), 'ITR',        'Income Tax / ITR',         'Questions about ITR filing, TDS, tax computation, and refunds', TRUE, 2),
    (gen_random_uuid(), 'COMPLIANCE', 'Legal & Compliance',       'Questions about DPDP Act, RBI guidelines, corporate law', TRUE, 3),
    (gen_random_uuid(), 'LOANS',      'Business Loans',           'Questions about loan eligibility, applications, and EMIs', TRUE, 5),
    (gen_random_uuid(), 'GENERAL',    'General Finance',          'General financial planning and advisory questions', TRUE, 6),
    (gen_random_uuid(), 'AI_CHAT',    'AI Assistant',             'AI-handled queries (before human handoff)', TRUE, 7)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 13. Loan Types
-- =============================================================================
INSERT INTO loan.loan_type (id, code, name, description, min_amount, max_amount, min_tenure_months, max_tenure_months, is_active, sort_order)
VALUES
    (gen_random_uuid(), 'BUSINESS_LOAN',     'Business Loan',         'Term loan for business expansion, equipment, or working capital', 100000, 50000000, 12, 84, TRUE, 1),
    (gen_random_uuid(), 'WORKING_CAPITAL',   'Working Capital Loan',  'Short-term loan to fund day-to-day business operations', 50000, 10000000, 3, 24, TRUE, 2),
    (gen_random_uuid(), 'PERSONAL_LOAN',     'Personal Loan',         'Unsecured personal loan for immediate financial needs', 50000, 2000000, 12, 60, TRUE, 3),
    (gen_random_uuid(), 'MSME_MUDRA',        'MSME / Mudra Loan',     'Government-backed Pradhan Mantri Mudra Yojana (Shishu, Kishor, Tarun)', 10000, 1000000, 12, 60, TRUE, 4)
ON CONFLICT (code) DO NOTHING;

COMMIT;
