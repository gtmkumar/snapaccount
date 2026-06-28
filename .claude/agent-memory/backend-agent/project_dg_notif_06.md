---
name: dg-notif-06-notification-template-taxonomy-reconcile
description: DG-NOTIF-06 fix — single canonical seeder for notification templates, removed orphaned SQL seed rows
metadata:
  type: project
---

## DG-NOTIF-06: Notification Template Seed Reconciliation (2026-06-28)

**Fact:** Two divergent template seed sources existed with incompatible event taxonomies:
- `NotificationSeeder.cs` (C#) used canonical catalog codes (DOC_OCR_COMPLETED, GST_DEADLINE_7_DAYS, CHAT_NEW_MESSAGE…)
- `999_seed_reference_data.sql` Section 8 used legacy codes (DOCUMENT_PROCESSED, GST_FILING_REMINDER, CHAT_MESSAGE_RECEIVED…)

This meant orphaned "active" rows in `notification.notification_template` that no subscriber could ever fire.

**Why:** The SQL 999 seed predated the C# NotificationSeeder. When 017_notification_preferences_templates added `is_current` column (DEFAULT TRUE), the SQL rows silently activated alongside the canonical C# rows — different event codes, different `code` values, same `is_current=TRUE`.

**Fix applied:**
1. **`NotificationEventCatalog.cs`** — Added 3 new entries: `USER_REGISTERED` (welcome, Push/Sms/Email), `ACCT_OTP_REQUESTED` (OTP auth, Sms), `ACCT_PASSWORD_RESET` (password reset, Email). Added `AllCodes` IReadOnlySet for fast O(1) validation. Account events section now has 5 entries (was 2).
2. **`NotificationSeeder.cs`** — Added `ValidateTemplateEventCodesAsync`: at startup, queries all `is_current=TRUE AND deleted_at IS NULL` template rows, logs Warning for any event_type not in `AllCodes`. Added `BuildWelcomeTemplate`, `BuildOtpTemplate`, `BuildPasswordResetTemplate` for richer default bodies on the 3 new events. `#pragma warning disable IDE0060` for unused channel params on single-channel events.
3. **`999_seed_reference_data.sql`** — Removed Section 8 notification_template INSERT block (~100 lines). Replaced with explanatory comment directing maintainers to extend NotificationEventCatalog instead.
4. **Migration `099_notification_template_seed_reconcile.sql`** — Soft-deletes orphaned rows by `code` (WELCOME_USER_PUSH/SMS/EMAIL, OTP_AUTH_SMS, DOCUMENT_PROCESSED_PUSH, GST_RETURN_FILED_PUSH/SMS, GST_FILING_REMINDER_7D_PUSH/3D_PUSH, ITR_FILED_PUSH, ITR_EVERIFY_REMINDER_PUSH, LOAN_STATUS_PUSH, SUBSCRIPTION_RENEWAL_PUSH, CHAT_MESSAGE_PUSH, ITC_MISMATCH_PUSH, APPOINTMENT_CONFIRMED_PUSH, PASSWORD_RESET_EMAIL). Also retires by `event_type` for any stragglers.

**How to apply:** Migration 099 runs before app starts (psql -f). C# seeder fires at startup and seeds canonical templates for all 40 catalog events × channels × locales.

**Build:** 0 errors, 0 warnings from changed files. Pre-existing NU190x warnings unchanged (24 total).
