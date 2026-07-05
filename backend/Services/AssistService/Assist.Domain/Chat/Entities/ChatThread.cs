using ChatService.Domain.Enums;
using ChatService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A support thread between an SME user and an agent/CA.
/// Canonical table: chat.threads (migration 029).
/// State machine: OPEN → PENDING_USER → RESOLVED | ESCALATED | REOPENED.
/// </summary>
public class ChatThread : BaseAuditableEntity
{
    /// <summary>Organisation that owns this thread.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>User who started the thread.</summary>
    public Guid InitiatedByUserId { get; private set; }

    /// <summary>Business category for routing (FK to chat.categories).</summary>
    public ThreadCategory Category { get; private set; }

    /// <summary>Current thread state.</summary>
    public ThreadStatus Status { get; private set; }

    /// <summary>Optional subject / title supplied by the user at creation.</summary>
    public string? Subject { get; private set; }

    /// <summary>Agent or CA currently assigned to handle this thread.</summary>
    public Guid? AssignedToUserId { get; private set; }

    /// <summary>Timestamp when the thread was resolved.</summary>
    public DateTime? ResolvedAt { get; private set; }

    /// <summary>User who resolved the thread.</summary>
    public Guid? ResolvedByUserId { get; private set; }

    /// <summary>Timestamp when the thread was escalated.</summary>
    public DateTime? EscalatedAt { get; private set; }

    /// <summary>Navigation to messages.</summary>
    public IReadOnlyList<ChatMessage> Messages => _messages.AsReadOnly();
    private readonly List<ChatMessage> _messages = [];

    /// <summary>Navigation to participants.</summary>
    public IReadOnlyList<ThreadParticipant> Participants => _participants.AsReadOnly();
    private readonly List<ThreadParticipant> _participants = [];

    private ChatThread() { }

    /// <summary>
    /// Opens a new thread and raises <see cref="ThreadOpenedEvent"/>.
    /// Automatically adds the initiating user as a <see cref="ParticipantRole.User"/> participant.
    /// </summary>
    public static ChatThread Open(
        Guid organizationId,
        Guid initiatedByUserId,
        ThreadCategory category,
        string? subject = null)
    {
        var thread = new ChatThread
        {
            OrganizationId = organizationId,
            InitiatedByUserId = initiatedByUserId,
            Category = category,
            Status = ThreadStatus.Open,
            Subject = subject
        };

        thread._participants.Add(
            ThreadParticipant.Create(thread.Id, initiatedByUserId, ParticipantRole.User));

        thread.AddDomainEvent(new ThreadOpenedEvent(thread.Id, organizationId, initiatedByUserId, category));
        return thread;
    }

    /// <summary>Assigns the thread to an agent / CA user.</summary>
    public void Assign(Guid assignedToUserId, ParticipantRole role)
    {
        AssignedToUserId = assignedToUserId;

        // Ensure participant record exists
        if (!_participants.Any(p => p.UserId == assignedToUserId && p.DeletedAt == null))
            _participants.Add(ThreadParticipant.Create(Id, assignedToUserId, role));

        AddDomainEvent(new ThreadAssignedEvent(Id, OrganizationId, assignedToUserId));
    }

    /// <summary>Transitions thread to RESOLVED and raises <see cref="ThreadResolvedEvent"/>.</summary>
    public Result Resolve(Guid resolvedByUserId)
    {
        if (Status == ThreadStatus.Resolved)
            return Result.Failure(Error.Conflict("ChatThread.AlreadyResolved", "Thread is already resolved."));

        Status = ThreadStatus.Resolved;
        ResolvedAt = DateTime.UtcNow;
        ResolvedByUserId = resolvedByUserId;
        AddDomainEvent(new ThreadResolvedEvent(Id, OrganizationId, resolvedByUserId));
        return Result.Success();
    }

    /// <summary>Escalates the thread and raises <see cref="ThreadEscalatedEvent"/>.</summary>
    public Result Escalate(Guid escalatedByUserId)
    {
        if (Status == ThreadStatus.Escalated)
            return Result.Failure(Error.Conflict("ChatThread.AlreadyEscalated", "Thread is already escalated."));

        Status = ThreadStatus.Escalated;
        EscalatedAt = DateTime.UtcNow;
        AddDomainEvent(new ThreadEscalatedEvent(Id, OrganizationId, escalatedByUserId));
        return Result.Success();
    }

    /// <summary>Re-opens a resolved or escalated thread.</summary>
    public Result Reopen()
    {
        if (Status == ThreadStatus.Open || Status == ThreadStatus.PendingUser)
            return Result.Failure(Error.Conflict("ChatThread.NotClosed", "Thread is already open."));

        Status = ThreadStatus.Open;
        ResolvedAt = null;
        ResolvedByUserId = null;
        return Result.Success();
    }

    /// <summary>Transitions status when the user sends a message (Open → PendingUser skipped; agent reply → PendingUser).</summary>
    public void OnAgentMessageSent()
    {
        if (Status == ThreadStatus.Open)
            Status = ThreadStatus.PendingUser;
    }

    /// <summary>Transitions status when a user (non-agent) sends a message in PendingUser state.</summary>
    public void OnUserMessageSent()
    {
        if (Status == ThreadStatus.PendingUser)
            Status = ThreadStatus.Open;
    }

    /// <summary>Updates the category (after routing-rule match on first message).</summary>
    public void SetCategory(ThreadCategory category) => Category = category;
}
