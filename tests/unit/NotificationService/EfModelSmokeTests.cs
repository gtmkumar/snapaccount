using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NotificationService.Infrastructure.Persistence;
using Xunit;

namespace NotificationService.Tests;

/// <summary>
/// EF model smoke tests for NotificationService — validates that the EF Core model can
/// generate correct SQL for all DbSets, including the notification_template rows added
/// or modified in migration 081.
///
/// House rule: use full SELECT projections (ToListAsync / FirstOrDefaultAsync) rather than
/// AnyAsync() — AnyAsync() does not materialise column names and cannot surface
/// EF↔DB mapping errors.
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class NotificationEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static NotificationServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<NotificationServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new NotificationServiceDbContext(options);
    }

    // ── Existing tables (regression) ─────────────────────────────────────────

    [Fact]
    public async Task NotificationEvents_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationEvents
            .Select(e => new { e.Id, e.EventCode, e.EventName, e.Category, e.IsActive, e.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for notification.notification_event must be correct");
    }

    [Fact]
    public async Task NotificationPreferences_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationPreferences
            .Select(p => new { p.Id, p.UserId, p.EventCode, p.PushEnabled, p.SmsEnabled, p.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for notification.notification_preference must be correct");
    }

    // ── GAP-037: NotificationTemplate (migration 081 augments columns) ────────

    [Fact]
    public async Task NotificationTemplates_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationTemplates
            .Select(t => new
            {
                t.Id, t.Code, t.Name, t.EventCode, t.Channel, t.Locale,
                t.Subject, t.Body, t.DltTemplateId, t.SenderName,
                t.IsCurrent, t.EffectiveFrom, t.EffectiveTo,
                t.CreatedAt, t.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for notification.notification_template must be correct");
    }

    [Fact]
    public async Task NotificationTemplates_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationTemplates
            .Select(t => new
            {
                t.Id, t.Code, t.Name, t.EventCode, t.Channel, t.Locale,
                t.Subject, t.Body, t.DltTemplateId, t.SenderName,
                t.IsCurrent, t.EffectiveFrom, t.EffectiveTo,
                t.CreatedAt, t.UpdatedAt, t.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on notification_template must not throw");
    }

    [Fact]
    public async Task NotificationTemplates_FilterByCurrentAndChannel_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationTemplates
            .Where(t => t.IsCurrent)
            .Select(t => new { t.Id, t.EventCode, t.Channel, t.Locale, t.IsCurrent })
            .ToListAsync();
        await act.Should().NotThrowAsync("Filtered query on notification_template (IsCurrent) must generate valid SQL");
    }

    [Fact]
    public async Task NotificationTemplates_FilterByEventCodeAndLocale_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationTemplates
            .Where(t => t.EventCode == "GST_DEADLINE_3_DAYS" && t.Locale == "en")
            .Select(t => new { t.Id, t.Body, t.Subject })
            .ToListAsync();
        await act.Should().NotThrowAsync("Filtered query by event_code+locale on notification_template must work");
    }

    // ── NotificationLog ───────────────────────────────────────────────────────

    [Fact]
    public async Task NotificationLog_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationLog
            .Select(l => new { l.Id, l.UserId, l.EventCode, l.Channel, l.Status, l.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for notification.notification_log must be correct");
    }

    [Fact]
    public async Task NotificationLog_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.NotificationLog
            .Select(l => new { l.Id, l.UserId, l.EventCode, l.Channel, l.Status, l.DedupeKey, l.CreatedAt })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on notification_log must not throw");
    }

    // ── InboxNotification ─────────────────────────────────────────────────────

    [Fact]
    public async Task InboxNotifications_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.InboxNotifications
            .Select(n => new { n.Id, n.UserId, n.EventType, n.IsRead, n.Title, n.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for notification.inbox_notification must be correct");
    }
}
