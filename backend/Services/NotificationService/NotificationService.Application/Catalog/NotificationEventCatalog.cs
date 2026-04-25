namespace NotificationService.Application.Catalog;

/// <summary>
/// Static catalogue of all 26 notification event types from Plan I2.
/// Each entry defines the event code, human name, category, and default channels.
/// Used by <see cref="NotificationSeeder"/> to seed templates at startup.
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

        // Document events (3)
        new("DOC_OCR_COMPLETED",    "Document Processed",            "DOCUMENT",     "Push,InApp"),
        new("DOC_OCR_FAILED",       "Document Processing Failed",    "DOCUMENT",     "Push,InApp"),
        new("DOC_APPROVED",         "Document Approved",             "DOCUMENT",     "InApp"),

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

        // Callback events (3)
        new("CB_SCHEDULED",         "Callback Scheduled",           "CALLBACK",     "Push,Sms"),
        new("CB_COMPLETED",         "Callback Completed",           "CALLBACK",     "Push"),
        new("CB_ESCALATED",         "Callback Escalated",           "CALLBACK",     "Push,Email"),

        // Account events (2)
        new("ACCT_LOGIN_NEW_DEVICE", "New Device Login",            "ACCOUNT",      "Push,Sms,Email"),
        new("ACCT_PROFILE_UPDATED",  "Profile Updated",             "ACCOUNT",      "Email"),
    ];
}

/// <summary>One entry in the notification event catalogue.</summary>
public record CatalogEntry(
    string EventCode,
    string EventName,
    string Category,
    string DefaultChannels);
