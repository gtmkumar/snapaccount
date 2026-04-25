using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the chat schema database context.
/// Phase 6F: full DbSet properties wired for all chat entities.
/// </summary>
public interface IChatServiceDbContext
{
    /// <summary>Chat threads (chat.threads).</summary>
    DbSet<ChatThread> Threads { get; }

    /// <summary>Chat messages (chat.messages).</summary>
    DbSet<ChatMessage> Messages { get; }

    /// <summary>Thread participants (chat.thread_participants).</summary>
    DbSet<ThreadParticipant> ThreadParticipants { get; }

    /// <summary>Read receipts (chat.read_receipts).</summary>
    DbSet<ReadReceipt> ReadReceipts { get; }

    /// <summary>Routing rules for category auto-assignment (chat.routing_rules).</summary>
    DbSet<RoutingRule> RoutingRules { get; }

    /// <summary>Persists changes to the chat schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
