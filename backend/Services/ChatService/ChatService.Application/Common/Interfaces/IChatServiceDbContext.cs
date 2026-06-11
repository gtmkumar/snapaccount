using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChatService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the chat schema database context.
/// Phase 6F: full DbSet properties wired for all chat entities.
/// Wave 7A (migration 080): CaProfiles, AppointmentSlots, Appointments, MessageBookmarks added.
/// Wave 7A addendum (migration 085): CaAvailabilityRules added; Appointment CA-cancel columns.
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

    /// <summary>CA staff profiles and rating aggregates (chat.ca_profiles, migration 080).</summary>
    DbSet<CaProfile> CaProfiles { get; }

    /// <summary>CA availability slots (chat.appointment_slots, migration 080).</summary>
    DbSet<AppointmentSlot> AppointmentSlots { get; }

    /// <summary>Consultation appointments (chat.appointments, migration 080).</summary>
    DbSet<Appointment> Appointments { get; }

    /// <summary>User-scoped message bookmarks (chat.message_bookmarks, migration 080).</summary>
    DbSet<MessageBookmark> MessageBookmarks { get; }

    /// <summary>CA recurring weekly availability rules (chat.ca_availability_rules, migration 085).</summary>
    DbSet<CaAvailabilityRule> CaAvailabilityRules { get; }

    /// <summary>Persists changes to the chat schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
