using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Catalog;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Seeding;

/// <summary>
/// Startup hosted service that seeds the notification event catalogue and default templates
/// for all 26 event types × 4 channels × 3 locales (en/hi/bn).
/// Idempotent — skips rows that already exist.
/// </summary>
public sealed class NotificationSeeder(
    IServiceScopeFactory scopeFactory,
    ILogger<NotificationSeeder> logger) : IHostedService
{
    private static readonly string[] Locales = ["en", "hi", "bn"];

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationServiceDbContext>();

        await db.Database.MigrateAsync(cancellationToken);

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
        await SeedTemplatesAsync(db, cancellationToken);

        logger.LogInformation("NotificationSeeder: seeded {Count} event types.", NotificationEventCatalog.All.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task SeedTemplatesAsync(NotificationServiceDbContext db, CancellationToken ct)
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

                    db.NotificationTemplates.Add(NotificationTemplate.Create(
                        entry.EventCode,
                        channel,
                        locale,
                        body,
                        subject: subject,
                        // DLT template ID left null — must be registered separately on TRAI DLT portal
                        dltTemplateId: null,
                        senderName: "SNPACC"));
                }
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private static (string body, string? subject) BuildDefaultTemplate(
        string eventCode, string eventName, NotificationChannel channel, string locale)
    {
        // Default bilingual templates. In production, marketing team replaces via admin panel.
        var body = locale switch
        {
            "hi" => $"SnapAccount: {{{{message}}}} — {{{{eventName}}}}",
            "bn" => $"SnapAccount: {{{{message}}}} — {{{{eventName}}}}",
            _ => $"{{{{message}}}}"
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
