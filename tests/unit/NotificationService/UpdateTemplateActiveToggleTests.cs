// Unit tests: CG-11 — notification template Active toggle persists via UpdateTemplateCommand.
//
// Before CG-11 the update command/handler/PUT payload carried no `isActive`, so the admin
// Active toggle was a no-op. These tests verify the handler now flips the template's active
// state (domain `IsCurrent`, surfaced to the UI as `isActive`) only when IsActive is supplied,
// and leaves it untouched for body-only updates.
//
// Uses EF Core InMemory — no Postgres needed.

using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Notifications.Commands.UpdateTemplate;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;
using Xunit;

namespace NotificationService.Tests;

[Trait("Category", "Unit")]
public sealed class UpdateTemplateActiveToggleTests
{
    private static NotificationServiceDbContext NewDb() =>
        new(new DbContextOptionsBuilder<NotificationServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static async Task<NotificationTemplate> SeedTemplateAsync(NotificationServiceDbContext db)
    {
        var t = NotificationTemplate.Create("GST_NOTICE_RECEIVED", NotificationChannel.Email, "en", "Hello {{name}}");
        db.NotificationTemplates.Add(t);
        await db.SaveChangesAsync();
        return t;
    }

    [Fact]
    public async Task Update_WithIsActiveFalse_DeactivatesTemplate()
    {
        await using var db = NewDb();
        var t = await SeedTemplateAsync(db);
        t.IsCurrent.Should().BeTrue("seeded template starts active");

        var result = await new UpdateTemplateCommandHandler(db).Handle(
            new UpdateTemplateCommand(t.Id, t.Body, IsActive: false), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var reloaded = await db.NotificationTemplates.FirstAsync(x => x.Id == t.Id);
        reloaded.IsCurrent.Should().BeFalse("IsActive:false must persist as IsCurrent=false");
    }

    [Fact]
    public async Task Update_WithIsActiveTrue_ReactivatesTemplate()
    {
        await using var db = NewDb();
        var t = await SeedTemplateAsync(db);
        t.SetActive(false);
        await db.SaveChangesAsync();

        var result = await new UpdateTemplateCommandHandler(db).Handle(
            new UpdateTemplateCommand(t.Id, t.Body, IsActive: true), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var reloaded = await db.NotificationTemplates.FirstAsync(x => x.Id == t.Id);
        reloaded.IsCurrent.Should().BeTrue("IsActive:true must persist as IsCurrent=true");
    }

    [Fact]
    public async Task Update_WithoutIsActive_LeavesActiveStateUnchanged()
    {
        await using var db = NewDb();
        var t = await SeedTemplateAsync(db);
        t.SetActive(false);              // start inactive
        await db.SaveChangesAsync();

        // Body-only update — IsActive omitted (null) must not resurrect the template.
        var result = await new UpdateTemplateCommandHandler(db).Handle(
            new UpdateTemplateCommand(t.Id, "New body {{name}}"), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var reloaded = await db.NotificationTemplates.FirstAsync(x => x.Id == t.Id);
        reloaded.Body.Should().Be("New body {{name}}");
        reloaded.IsCurrent.Should().BeFalse("omitting IsActive must leave the active state untouched");
    }
}
