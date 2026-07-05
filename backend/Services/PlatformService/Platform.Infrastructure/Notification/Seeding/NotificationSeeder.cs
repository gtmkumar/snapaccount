using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Catalog;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Seeding;

/// <summary>
/// Startup hosted service that seeds the notification event catalogue and default templates
/// for all catalog event types × 4 channels × 3 locales (en/hi/bn).
/// Idempotent — skips rows that already exist.
///
/// DG-NOTIF-06: This seeder is the SINGLE authoritative source for notification_template rows.
/// A prior divergence existed where 999_seed_reference_data.sql inserted templates under a
/// different event taxonomy (USER_REGISTERED, OTP_REQUESTED, DOCUMENT_PROCESSED, etc.).
/// Migration 099 removed those orphaned rows. This seeder validates at startup that no
/// orphaned templates remain so the divergence cannot silently re-emerge.
/// </summary>
public sealed class NotificationSeeder(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<NotificationSeeder> logger) : IHostedService
{
    // DG-NOTIF-07: Dev placeholder DLT ID seeded in non-production environments so that
    // the SMS DLT gate (SendNotificationCommandHandler:115-122) does not suppress 100% of SMS
    // during local development and integration testing.  Real TRAI-registered DLT template IDs
    // are 19-digit numeric strings (e.g. "1234567890123456789"); this value is deliberately
    // recognisable so operators can identify dev-only rows in the dlt-status endpoint.
    internal const string DevPlaceholderDltId = "DEV_PLACEHOLDER_DLT_ID";

    private static readonly string[] Locales = ["en", "hi", "bn"];

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // DG-NOTIF-07: Dev bypass flag — when true the seeder seeds SMS templates with a
        // recognisable placeholder DLT ID instead of null so SMS can be dispatched locally
        // without a real TRAI DLT registration.  Auto-enabled in Development environments
        // that have not explicitly disabled it.  NEVER set to true in staging/production.
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        var rawBypass = configuration["Notification:SmsDevBypassDlt"];
        var devBypassDlt = rawBypass is not null
            ? string.Equals(rawBypass, "true", StringComparison.OrdinalIgnoreCase)
            : isDevelopment;

        if (devBypassDlt)
        {
            logger.LogWarning(
                "DG-NOTIF-07 NotificationSeeder: Notification:SmsDevBypassDlt=true — " +
                "seeding SMS templates with dev placeholder DLT ID ('{DevId}'). " +
                "This MUST be replaced with real TRAI DLT IDs before go-live.",
                DevPlaceholderDltId);
        }

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationServiceDbContext>();

        // Seed event catalogue
        foreach (var entry in NotificationEventCatalog.All)
        {
            var exists = await db.NotificationEvents
                .AnyAsync(e => e.EventCode == entry.EventCode, cancellationToken);
            if (!exists)
            {
                db.NotificationEvents.Add(NotificationEvent.Create(
                    entry.EventCode, entry.EventName, entry.Category, entry.DefaultChannels));
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        // Seed default templates
        await SeedTemplatesAsync(db, devBypassDlt, cancellationToken);

        // DG-NOTIF-06: validate that no active templates reference event codes outside the
        // catalog. Orphaned templates are logged as warnings so operators can clean them up
        // (migration 099 removes the known set; this catches any future drift).
        await ValidateTemplateEventCodesAsync(db, cancellationToken);

        logger.LogInformation("NotificationSeeder: seeded {Count} event types.", NotificationEventCatalog.All.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task SeedTemplatesAsync(NotificationServiceDbContext db, bool devBypassDlt, CancellationToken ct)
    {
        foreach (var entry in NotificationEventCatalog.All)
        {
            var channels = entry.DefaultChannels.Split(',').Select(ParseChannel).ToList();

            foreach (var channel in channels)
            {
                foreach (var locale in Locales)
                {
                    var alreadyExists = await db.NotificationTemplates
                        .AnyAsync(t => t.EventCode == entry.EventCode
                                    && t.Channel == channel
                                    && t.Locale == locale
                                    && t.IsCurrent, ct);

                    if (alreadyExists) continue;

                    var (body, subject) = BuildDefaultTemplate(entry.EventCode, entry.EventName, channel, locale);

                    // DG-NOTIF-07: In non-production (devBypassDlt=true) seed SMS templates with a
                    // recognisable placeholder DLT ID so the SMS gate does not suppress 100% of SMS.
                    // In production this must be null until the real TRAI DLT ID is registered via
                    // the admin template manager (PUT /notifications/templates/{id}).
                    string? dltTemplateId = (channel == NotificationChannel.Sms && devBypassDlt)
                        ? DevPlaceholderDltId
                        : null;

                    db.NotificationTemplates.Add(NotificationTemplate.Create(
                        entry.EventCode,
                        channel,
                        locale,
                        body,
                        subject: subject,
                        dltTemplateId: dltTemplateId,
                        senderName: "SNPACC"));
                }
            }
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// DG-NOTIF-06: Warns about any is_current=true template rows whose event_type is not
    /// in <see cref="NotificationEventCatalog.AllCodes"/>.  These are orphaned rows from
    /// the legacy 999_seed_reference_data.sql taxonomy (e.g. USER_REGISTERED, OTP_REQUESTED)
    /// that migration 099 removes from existing databases.
    /// Logging at Warning level so Ops can detect and clean up any re-introduction of drift.
    /// </summary>
    private async Task ValidateTemplateEventCodesAsync(
        NotificationServiceDbContext db, CancellationToken ct)
    {
        // Ignore the query filter so soft-deleted rows are also checked.
        var activeCodes = await db.NotificationTemplates
            .IgnoreQueryFilters()
            .Where(t => t.IsCurrent && t.DeletedAt == null)
            .Select(t => t.EventCode)
            .Distinct()
            .ToListAsync(ct);

        var orphaned = activeCodes
            .Where(code => !NotificationEventCatalog.AllCodes.Contains(code))
            .OrderBy(c => c)
            .ToList();

        if (orphaned.Count == 0)
        {
            logger.LogInformation(
                "NotificationSeeder: taxonomy validation passed — all active templates reference catalog event codes.");
            return;
        }

        foreach (var code in orphaned)
        {
            logger.LogWarning(
                "NotificationSeeder DG-NOTIF-06: active template(s) reference event_type='{EventCode}' " +
                "which is not in NotificationEventCatalog. These are orphaned rows. " +
                "Apply migration 099_notification_template_seed_reconcile to remove them.",
                code);
        }
    }

    private static (string body, string? subject) BuildDefaultTemplate(
        string eventCode, string eventName, NotificationChannel channel, string locale)
    {
        // DG-NOTIF-06: provide specific default bodies for the account events that were
        // previously seeded by 999_seed_reference_data.sql with rich content but wrong codes.
        // In production the marketing team replaces these via the admin template manager.
        var (body, subject) = eventCode switch
        {
            "USER_REGISTERED" => BuildWelcomeTemplate(channel, locale),
            "ACCT_OTP_REQUESTED" => BuildOtpTemplate(channel, locale),
            "ACCT_PASSWORD_RESET" => BuildPasswordResetTemplate(channel, locale),
            _ => BuildGenericTemplate(eventName, channel, locale)
        };

        return (body, subject);
    }

    private static (string body, string? subject) BuildWelcomeTemplate(
        NotificationChannel channel, string locale) => channel switch
    {
        NotificationChannel.Push => (
            locale == "hi"
                ? "SnapAccount में आपका स्वागत है, {{user_name}}! आपकी वित्तीय यात्रा यहाँ से शुरू होती है।"
                : "Welcome to SnapAccount, {{user_name}}! Your financial journey starts here.",
            null),
        NotificationChannel.Sms => (
            locale == "hi"
                ? "SnapAccount में आपका स्वागत है, {{user_name}}! आज ही अपना पहला बिल अपलोड करें। -SnapAccount"
                : "Welcome to SnapAccount, {{user_name}}! Download our app and snap your first bill today. -SnapAccount",
            null),
        NotificationChannel.Email => (
            locale == "hi"
                ? "प्रिय {{user_name}},\n\nSnapAccount में आपका स्वागत है! हम आपको अपने साथ पाकर प्रसन्न हैं।\n\nमोबाइल ऐप का उपयोग करके अपना पहला दस्तावेज़ अपलोड करके शुरू करें।\n\nसादर,\nTeam SnapAccount"
                : "Dear {{user_name}},\n\nWelcome to SnapAccount! We are delighted to have you on board.\n\nGet started by uploading your first document using the mobile app.\n\nBest regards,\nTeam SnapAccount",
            locale == "hi" ? "SnapAccount में आपका स्वागत है" : "Welcome to SnapAccount — Your Smart Financial Assistant"),
        _ => ("Welcome to SnapAccount, {{user_name}}!", null)
    };

    // channel is unused for OTP — OTP is always SMS-only (Sms channel in catalog).
    // The parameter is kept for a uniform call signature across all Build*Template methods.
#pragma warning disable IDE0060
    private static (string body, string? subject) BuildOtpTemplate(
        NotificationChannel channel, string locale) => (
        locale == "hi"
            ? "{{otp}} आपका SnapAccount OTP है। 5 मिनट के लिए वैध। इस OTP को किसी के साथ साझा न करें। -SnapAccount"
            : "{{otp}} is your SnapAccount OTP. Valid for 5 minutes. Do not share this OTP with anyone. -SnapAccount",
        null);

    // channel is unused for password-reset — password-reset is always Email-only.
    private static (string body, string? subject) BuildPasswordResetTemplate(
        NotificationChannel channel, string locale) => (
        locale == "hi"
            ? "प्रिय {{user_name}},\n\nअपना पासवर्ड रीसेट करने के लिए नीचे दिए लिंक पर क्लिक करें। यह लिंक 1 घंटे के लिए वैध है।\n\n{{reset_link}}\n\nयदि आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें।\n\nसादर,\nTeam SnapAccount"
            : "Dear {{user_name}},\n\nClick the link below to reset your password. This link is valid for 1 hour.\n\n{{reset_link}}\n\nIf you did not request this, ignore this email.\n\nRegards,\nTeam SnapAccount",
        locale == "hi" ? "अपना SnapAccount पासवर्ड रीसेट करें" : "Reset your SnapAccount password");
#pragma warning restore IDE0060

    private static (string body, string? subject) BuildGenericTemplate(
        string eventName, NotificationChannel channel, string locale)
    {
        var body = locale switch
        {
            "hi" => $"SnapAccount: {{{{message}}}} — {eventName}",
            "bn" => $"SnapAccount: {{{{message}}}} — {eventName}",
            _ => "{{message}}"
        };

        var subject = channel is NotificationChannel.Email or NotificationChannel.InApp
            ? eventName
            : null;

        return (body, subject);
    }

    private static NotificationChannel ParseChannel(string s) => s.Trim() switch
    {
        "Push" => NotificationChannel.Push,
        "Sms" => NotificationChannel.Sms,
        "Email" => NotificationChannel.Email,
        "InApp" => NotificationChannel.InApp,
        _ => NotificationChannel.Push
    };
}
