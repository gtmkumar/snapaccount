using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ChatService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the chat schema.
/// Phase 6F: all entity DbSets wired.
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
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("chat");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ChatServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
