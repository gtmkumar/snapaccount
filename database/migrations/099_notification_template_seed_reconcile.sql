-- =============================================================================
-- 099_notification_template_seed_reconcile.sql
-- DG-NOTIF-06: Reconcile divergent notification template seed sources.
--
-- Background:
--   999_seed_reference_data.sql previously inserted notification_template rows
--   using a divergent event taxonomy (USER_REGISTERED, OTP_REQUESTED,
--   DOCUMENT_PROCESSED, GST_RETURN_FILED, GST_FILING_REMINDER, etc.) that did not
--   match the canonical NotificationEventCatalog codes used by the C# NotificationSeeder.
--
--   The C# seeder is the single source of truth (aligned to catalog codes such as
--   DOC_OCR_COMPLETED, GST_DEADLINE_7_DAYS, CHAT_NEW_MESSAGE, …).  The SQL rows are
--   dead — no subscriber ever fires events under the old codes — and cause confusion
--   because they appear "active" (is_current=TRUE) while never being dispatched.
--
-- Fix:
--   1. Soft-delete (set deleted_at) the orphaned SQL-seeded rows by their unique `code`
--      values.  Soft-delete is preferred over hard-DELETE to preserve audit history.
--   2. The 999_seed_reference_data.sql Section 8 block is updated in the same PR to
--      remove those INSERT statements so the rows do not reappear on fresh installs.
--   3. NotificationEventCatalog.cs now includes USER_REGISTERED, ACCT_OTP_REQUESTED,
--      and ACCT_PASSWORD_RESET so the C# seeder produces templates for those events.
--
-- Idempotent: soft-deletes are skipped if deleted_at is already set.
-- Depends on: 008_notification_schema.sql, 017_notification_preferences_templates.sql
-- =============================================================================

-- Step 1: Soft-delete the orphaned template rows inserted by 999_seed_reference_data.sql.
-- These codes are the unique identifiers of the rows seeded with the wrong event taxonomy.
UPDATE notification.notification_template
SET
    deleted_at  = NOW(),
    updated_at  = NOW(),
    is_current  = FALSE
WHERE code IN (
    'WELCOME_USER_PUSH',
    'WELCOME_USER_SMS',
    'WELCOME_USER_EMAIL',
    'OTP_AUTH_SMS',
    'DOCUMENT_PROCESSED_PUSH',
    -- Note: GST_RETURN_FILED_PUSH and GST_RETURN_FILED_SMS used event_type='GST_RETURN_FILED'
    -- which DOES exist in the catalog — however those SQL rows predate the C# seeder and
    -- lack the code pattern (eventCode__CHANNEL__locale) used by NotificationSeeder.Create.
    -- The seeder's idempotency check matches on (event_type, channel, language, is_current)
    -- so these SQL rows would NOT block the seeder from inserting its own rows.
    -- We soft-delete them anyway so only the seeder-managed rows remain active per event.
    'GST_RETURN_FILED_PUSH',
    'GST_RETURN_FILED_SMS',
    'GST_FILING_REMINDER_7D_PUSH',
    'GST_FILING_REMINDER_3D_PUSH',
    'ITR_FILED_PUSH',
    'ITR_EVERIFY_REMINDER_PUSH',
    'LOAN_STATUS_PUSH',
    'SUBSCRIPTION_RENEWAL_PUSH',
    'CHAT_MESSAGE_PUSH',
    'ITC_MISMATCH_PUSH',
    'APPOINTMENT_CONFIRMED_PUSH',
    'PASSWORD_RESET_EMAIL'
)
AND deleted_at IS NULL;

-- Step 2: Ensure there are no is_current=TRUE rows left for the orphaned event_type codes.
-- Any row that survived step 1 (e.g. already had a non-standard code) is retired here.
UPDATE notification.notification_template
SET
    is_current  = FALSE,
    updated_at  = NOW()
WHERE event_type IN (
    'USER_REGISTERED',      -- now catalog code: USER_REGISTERED (same code, was orphaned)
    'OTP_REQUESTED',        -- now catalog code: ACCT_OTP_REQUESTED
    'DOCUMENT_PROCESSED',   -- now catalog code: DOC_OCR_COMPLETED
    -- GST_RETURN_FILED is a valid catalog code; skip retiring by event_type to avoid
    -- hitting the correctly-seeded C# rows.
    'GST_FILING_REMINDER',  -- now catalog codes: GST_DEADLINE_7_DAYS / GST_DEADLINE_3_DAYS
    'GST_FILING_REMINDER_3D',
    'ITR_FILED',            -- was never in catalog; ITR events use ITR_EFILE_VERIFY_* / ITR_REFUND_CREDITED
    'ITR_EVERIFY_REMINDER', -- now catalog codes: ITR_EFILE_VERIFY_D1 through D29
    'LOAN_STATUS_CHANGED',  -- now catalog code: LOAN_APPLICATION_STATUS
    'SUBSCRIPTION_EXPIRING',-- now catalog codes: SUB_RENEWAL_7_DAYS / SUB_RENEWAL_3_DAYS
    'CHAT_MESSAGE_RECEIVED',-- now catalog code: CHAT_NEW_MESSAGE
    'ITC_MISMATCH_DETECTED',-- now catalog code: GST_ITC_MISMATCH
    'APPOINTMENT_CONFIRMED',-- now catalog code: APPT_BOOKED
    'PASSWORD_RESET_REQUESTED' -- now catalog code: ACCT_PASSWORD_RESET
)
AND deleted_at IS NULL
AND is_current = TRUE;
