using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ChatService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the chat schema.
/// Phase 6F: all entity DbSets wired.
/// Wave 7A (migration 080): CaProfiles, AppointmentSlots, Appointments, MessageBookmarks added.
/// Wave 7A addendum (migration 085): CaAvailabilityRules added; Appointment CA-cancel columns.
/// </summary>
public class ChatServiceDbContext(DbContextOptions<ChatServiceDbContext> options)
    : BaseDbContext(options), IChatServiceDbContext
{
    /// <inheritdoc />
    public DbSet<ChatThread> Threads => Set<ChatThread>();

    /// <inheritdoc />
    public DbSet<ChatMessage> Messages => Set<ChatMessage>();

    /// <inheritdoc />
    public DbSet<ThreadParticipant> ThreadParticipants => Set<ThreadParticipant>();

    /// <inheritdoc />
    public DbSet<ReadReceipt> ReadReceipts => Set<ReadReceipt>();

    /// <inheritdoc />
    public DbSet<RoutingRule> RoutingRules => Set<RoutingRule>();

    /// <inheritdoc />
    public DbSet<CaProfile> CaProfiles => Set<CaProfile>();

    /// <inheritdoc />
    public DbSet<AppointmentSlot> AppointmentSlots => Set<AppointmentSlot>();

    /// <inheritdoc />
    public DbSet<Appointment> Appointments => Set<Appointment>();

    /// <inheritdoc />
    public DbSet<MessageBookmark> MessageBookmarks => Set<MessageBookmark>();

    /// <inheritdoc />
    public DbSet<CaAvailabilityRule> CaAvailabilityRules => Set<CaAvailabilityRule>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("chat");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ChatServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
