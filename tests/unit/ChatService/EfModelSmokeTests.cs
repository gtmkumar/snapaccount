using ChatService.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// EF model smoke tests for ChatService — validates that the EF Core model can generate
/// SQL for every DbSet introduced in Wave 7A (migration 080) without schema errors.
///
/// House rule: use full SELECT projections (ToListAsync / Select(...)) rather than
/// AnyAsync() — AnyAsync() emits "SELECT 1 FROM table LIMIT 1" which does NOT
/// materialise column names and therefore cannot surface EF↔DB column mapping errors.
/// All projections include a FirstOrDefaultAsync variant to catch single-row mapping issues.
///
/// Requires: local postgres running with snapaccount DB (trust-auth).
/// Run with: dotnet test --filter "Category=EfSmoke"
/// </summary>
[Trait("Category", "EfSmoke")]
public sealed class ChatEfModelSmokeTests
{
    private const string LocalConnectionString =
        "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql";

    private static ChatServiceDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ChatServiceDbContext>()
            .UseNpgsql(LocalConnectionString, o => o.SetPostgresVersion(17, 0))
            .Options;
        return new ChatServiceDbContext(options);
    }

    // ── Existing tables (regression) ─────────────────────────────────────────

    [Fact]
    public async Task ChatThreads_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Threads
            .Select(t => new { t.Id, t.OrganizationId, t.Status, t.Category, t.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.threads must be correct");
    }

    [Fact]
    public async Task ChatMessages_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Messages
            .Select(m => new { m.Id, m.ThreadId, m.SenderUserId, m.Body, m.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.messages must be correct");
    }

    // ── Wave 7A new tables (migration 080) ────────────────────────────────────

    [Fact]
    public async Task CaProfiles_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaProfiles
            .Select(p => new
            {
                p.Id, p.UserId, p.DisplayName, p.Bio, p.Specialisations,
                p.AverageRating, p.RatingCount, p.IsActive, p.CreatedAt, p.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.ca_profiles must be correct (migration 080)");
    }

    [Fact]
    public async Task CaProfiles_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaProfiles
            .Select(p => new
            {
                p.Id, p.UserId, p.DisplayName, p.AverageRating, p.RatingCount,
                p.IsActive, p.CreatedAt, p.UpdatedAt, p.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on ca_profiles must not throw");
    }

    [Fact]
    public async Task AppointmentSlots_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AppointmentSlots
            .Select(s => new
            {
                s.Id, s.CaProfileId, s.StartUtc, s.EndUtc, s.IsAvailable,
                s.CreatedAt, s.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.appointment_slots must be correct (migration 080)");
    }

    [Fact]
    public async Task AppointmentSlots_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.AppointmentSlots
            .Select(s => new
            {
                s.Id, s.CaProfileId, s.StartUtc, s.EndUtc, s.IsAvailable,
                s.CreatedAt, s.UpdatedAt, s.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on appointment_slots must not throw");
    }

    [Fact]
    public async Task Appointments_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.OrganizationId, a.BookedByUserId, a.CaProfileId,
                a.SlotId, a.Status, a.MeetLink, a.Notes,
                a.RatingStars, a.RatingComment, a.RatedAt, a.CreatedAt, a.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.appointments must be correct (migration 080)");
    }

    [Fact]
    public async Task Appointments_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.OrganizationId, a.BookedByUserId, a.CaProfileId,
                a.SlotId, a.Status, a.MeetLink, a.Notes,
                a.RatingStars, a.RatingComment, a.RatedAt, a.CreatedAt, a.UpdatedAt, a.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on appointments must not throw");
    }

    [Fact]
    public async Task MessageBookmarks_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.MessageBookmarks
            .Select(b => new
            {
                b.Id, b.UserId, b.MessageId, b.Note, b.CreatedAt, b.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.message_bookmarks must be correct (migration 080)");
    }

    [Fact]
    public async Task MessageBookmarks_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.MessageBookmarks
            .Select(b => new
            {
                b.Id, b.UserId, b.MessageId, b.Note, b.CreatedAt, b.UpdatedAt, b.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on message_bookmarks must not throw");
    }

    // ── Join query (validates FK navigation in EF SQL) ────────────────────────

    [Fact]
    public async Task Appointments_FilterByOrg_WithoutError()
    {
        using var db = CreateDbContext();
        var orgId = Guid.NewGuid(); // non-existent — only testing SQL correctness
        var act = async () => await db.Appointments
            .Where(a => a.OrganizationId == orgId)
            .Select(a => new { a.Id, a.Status, a.CreatedAt })
            .ToListAsync();
        await act.Should().NotThrowAsync("Filtered query on chat.appointments must generate valid SQL");
    }

    [Fact]
    public async Task CaProfiles_ActiveOnly_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaProfiles
            .Where(p => p.IsActive)
            .Select(p => new { p.Id, p.DisplayName, p.AverageRating, p.RatingCount })
            .ToListAsync();
        await act.Should().NotThrowAsync("Filtered query on chat.ca_profiles must generate valid SQL");
    }

    // ── Wave 7A addendum (migration 085) — CaAvailabilityRules + Appointment CA-cancel ──

    [Fact]
    public async Task CaAvailabilityRules_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaAvailabilityRules
            .Select(r => new
            {
                r.Id, r.CaProfileId, r.Weekday, r.StartTimeIst, r.EndTimeIst,
                r.SlotDurationMinutes, r.EffectiveFrom, r.EffectiveTo,
                r.IsActive, r.CreatedAt, r.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.ca_availability_rules must be correct (migration 085)");
    }

    [Fact]
    public async Task CaAvailabilityRules_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaAvailabilityRules
            .Select(r => new
            {
                r.Id, r.CaProfileId, r.Weekday, r.StartTimeIst, r.EndTimeIst,
                r.SlotDurationMinutes, r.EffectiveFrom, r.EffectiveTo,
                r.IsActive, r.CreatedAt, r.UpdatedAt, r.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync on ca_availability_rules must not throw");
    }

    [Fact]
    public async Task CaAvailabilityRules_FilterByActive_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.CaAvailabilityRules
            .Where(r => r.IsActive)
            .Select(r => new { r.Id, r.CaProfileId, r.Weekday, r.SlotDurationMinutes })
            .ToListAsync();
        await act.Should().NotThrowAsync("Filtered active query on ca_availability_rules must work");
    }

    [Fact]
    public async Task Appointments_CaCancelColumns_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Validates migration 085 additive columns: cancelled_by_ca, ca_cancellation_reason
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.Status, a.CancelledByCa, a.CaCancellationReason,
                a.CreatedAt, a.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync("EF mapping for chat.appointments CA-cancel columns (migration 085) must be correct");
    }

    [Fact]
    public async Task Appointments_CaCancelColumns_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.Status, a.CancelledByCa, a.CaCancellationReason,
                a.CreatedAt, a.UpdatedAt, a.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync("FirstOrDefaultAsync with CA-cancel columns must not throw");
    }

    // ── Migration 086 — chat.appointments.topic column ────────────────────────

    [Fact]
    public async Task Appointments_TopicColumn_CanQuery_WithoutError()
    {
        using var db = CreateDbContext();
        // Validates migration 086 additive column: topic VARCHAR(50) nullable
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.Status, a.Topic, a.Notes,
                a.CreatedAt, a.UpdatedAt
            })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "EF mapping for chat.appointments.topic column (migration 086) must be correct");
    }

    [Fact]
    public async Task Appointments_TopicColumn_FirstOrDefault_WithoutError()
    {
        using var db = CreateDbContext();
        var act = async () => await db.Appointments
            .Select(a => new
            {
                a.Id, a.Status, a.Topic, a.Notes,
                a.CreatedAt, a.UpdatedAt, a.DeletedAt
            })
            .FirstOrDefaultAsync();
        await act.Should().NotThrowAsync(
            "FirstOrDefaultAsync with topic column must not throw");
    }

    [Fact]
    public async Task Appointments_TopicColumn_Filter_WithoutError()
    {
        using var db = CreateDbContext();
        // Validates the ix_appointments_topic index is queryable
        var act = async () => await db.Appointments
            .Where(a => a.Topic == "GST")
            .Select(a => new { a.Id, a.Topic, a.Status })
            .ToListAsync();
        await act.Should().NotThrowAsync(
            "Filter on topic column must generate valid SQL (migration 086 index must exist)");
    }
}
