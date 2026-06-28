namespace NotificationService.Application.Catalog;

/// <summary>
/// Single source of truth for all notification event types.
/// Each entry defines the event code, human name, category, and default channels.
/// Used by <see cref="NotificationSeeder"/> to seed templates at startup.
///
/// DG-NOTIF-06: This catalog is the canonical event taxonomy. The SQL seed file
/// (999_seed_reference_data.sql) previously used a divergent taxonomy with different
/// codes (USER_REGISTERED, OTP_REQUESTED, DOCUMENT_PROCESSED, …). Those orphaned
/// rows were removed by migration 099_notification_template_seed_reconcile.sql.
/// All events — including welcome, OTP, and password-reset — are defined here and
/// seeded exclusively by NotificationSeeder at application startup.
/// </summary>
public static class NotificationEventCatalog
{
    public static IReadOnlyList<CatalogEntry> All { get; } =
    [
        // GST events (6)
        new("GST_DEADLINE_7_DAYS",  "GST Return Due in 7 Days",      "GST",          "Push,Sms,Email"),
        new("GST_DEADLINE_3_DAYS",  "GST Return Due in 3 Days",      "GST",          "Push,Sms,Email"),
        new("GST_DEADLINE_1_DAY",   "GST Return Due Tomorrow",       "GST",          "Push,Sms,Email"),
        new("GST_RETURN_FILED",     "GST Return Filed Successfully", "GST",          "Push,Email"),
        new("GST_ITC_MISMATCH",     "ITC Mismatch Detected",         "GST",          "Push,Email"),
        new("GST_NOTICE_RECEIVED",  "GST Notice Received",           "GST",          "Push,Sms,Email"),

        // ITR events (6)
        new("ITR_EFILE_VERIFY_D1",  "E-verify ITR — Day 1",          "ITR",          "Push,Sms"),
        new("ITR_EFILE_VERIFY_D7",  "E-verify ITR — Day 7",          "ITR",          "Push,Sms"),
        new("ITR_EFILE_VERIFY_D15", "E-verify ITR — Day 15",         "ITR",          "Push,Sms,Email"),
        new("ITR_EFILE_VERIFY_D25", "E-verify ITR — Day 25",         "ITR",          "Push,Sms,Email"),
        new("ITR_EFILE_VERIFY_D29", "E-verify ITR — Day 29 (Last)", "ITR",          "Push,Sms,Email"),
        new("ITR_REFUND_CREDITED",  "ITR Refund Credited",           "ITR",          "Push,Sms,Email"),

        // Document events (4)
        new("DOC_OCR_COMPLETED",            "Document Processed",              "DOCUMENT", "Push,InApp"),
        new("DOC_OCR_FAILED",               "Document Processing Failed",      "DOCUMENT", "Push,InApp"),
        new("DOC_APPROVED",                 "Document Approved",                "DOCUMENT", "InApp"),
        // DG-NOTIF-01: clarification request notifies the document owner (Push + InApp).
        new("DOC_CLARIFICATION_REQUESTED",  "Clarification Requested",          "DOCUMENT", "Push,InApp"),

        // Loan events (6) — P6-HANDOFF-34: LOAN_DISBURSED, LOAN_DISBURSEMENT_FAILED, LOAN_DISBURSEMENT_REVERSED added
        new("LOAN_APPLICATION_STATUS",    "Loan Application Update",        "LOAN", "Push,Email"),
        new("LOAN_EMI_DUE",               "EMI Due Reminder",               "LOAN", "Push,Sms"),
        new("LOAN_EMI_PAID",              "EMI Payment Confirmed",           "LOAN", "Push,Email"),
        new("LOAN_DISBURSED",             "Loan Disbursed Successfully",     "LOAN", "Push,Sms,Email"),
        new("LOAN_DISBURSEMENT_FAILED",   "Loan Disbursement Failed",        "LOAN", "Push,Sms,Email"),
        new("LOAN_DISBURSEMENT_REVERSED", "Loan Disbursement Reversed",      "LOAN", "Push,Sms,Email"),

        // Subscription events (3)
        new("SUB_RENEWAL_7_DAYS",   "Subscription Renewal in 7 Days", "SUBSCRIPTION", "Push,Email"),
        new("SUB_RENEWAL_3_DAYS",   "Subscription Renewal in 3 Days", "SUBSCRIPTION", "Push,Sms,Email"),
        new("SUB_RENEWAL_FAILED",   "Subscription Renewal Failed",    "SUBSCRIPTION", "Push,Sms,Email"),

        // Chat events (5) — DG-NOTIF-01: fan-out; DG-CHAT-03: appointment lifecycle
        new("CHAT_NEW_MESSAGE",         "New Chat Message",                   "CHAT", "Push,InApp"),
        new("APPT_BOOKED",              "Appointment Booked",                 "CHAT", "Push,InApp"),
        new("APPT_REMINDER_30",         "Appointment Reminder — 30 Minutes",  "CHAT", "Push,Sms"),
        new("APPT_REMINDER_5",          "Appointment Reminder — 5 Minutes",   "CHAT", "Push"),
        new("APPT_CANCELLED_BY_CA",     "Appointment Cancelled by CA",        "CHAT", "Push,Sms"),

        // Callback events (3)
        new("CB_SCHEDULED",         "Callback Scheduled",           "CALLBACK",     "Push,Sms"),
        new("CB_COMPLETED",         "Callback Completed",           "CALLBACK",     "Push"),
        new("CB_ESCALATED",         "Callback Escalated",           "CALLBACK",     "Push,Email"),

        // Account events (5) — DG-NOTIF-06: added USER_REGISTERED, ACCT_OTP_REQUESTED,
        // ACCT_PASSWORD_RESET to cover events previously in 999_seed_reference_data.sql
        // under divergent codes (USER_REGISTERED, OTP_REQUESTED, PASSWORD_RESET_REQUESTED).
        new("ACCT_LOGIN_NEW_DEVICE",   "New Device Login",            "ACCOUNT",  "Push,Sms,Email"),
        new("ACCT_PROFILE_UPDATED",    "Profile Updated",             "ACCOUNT",  "Email"),
        new("USER_REGISTERED",         "Welcome to SnapAccount",      "ACCOUNT",  "Push,Sms,Email"),
        new("ACCT_OTP_REQUESTED",      "OTP Authentication Code",     "ACCOUNT",  "Sms"),
        new("ACCT_PASSWORD_RESET",     "Password Reset Requested",    "ACCOUNT",  "Email"),
    ];

    /// <summary>
    /// A fast lookup set of all catalog event codes.
    /// Used by <see cref="NotificationSeeder"/> at startup to validate seeded templates.
    /// </summary>
    public static IReadOnlySet<string> AllCodes { get; } =
        new HashSet<string>(All.Select(e => e.EventCode), StringComparer.Ordinal);
}

/// <summary>One entry in the notification event catalogue.</summary>
public record CatalogEntry(
    string EventCode,
    string EventName,
    string Category,
    string DefaultChannels);
