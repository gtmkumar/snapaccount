using CallbackService.Domain.Enums;
using CallbackService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace CallbackService.Domain.Entities;

/// <summary>
/// Aggregate root representing a customer callback request.
/// Implements the state machine: Pending → Assigned → Confirmed → Completed.
/// Stored in <c>callback.callbacks</c>.
/// </summary>
public class Callback : BaseAuditableEntity
{
    private readonly List<CallNote> _notes = [];

    /// <summary>
    /// Customer who requested the callback.
    /// Nullable: set to NULL after DPDP Right-to-Erasure anonymization (SEC-027).
    /// </summary>
    public Guid? UserId { get; private set; }

    /// <summary>Organisation the user belongs to.</summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>Current state machine status.</summary>
    public CallbackStatus Status { get; private set; }

    /// <summary>Category of support required.</summary>
    public CallbackCategory Category { get; private set; }

    /// <summary>Priority for queue ordering.</summary>
    public CallbackPriority Priority { get; private set; }

    /// <summary>Agent assigned to handle this callback. Null until assigned.</summary>
    public Guid? AssignedAgentId { get; private set; }

    /// <summary>Customer-preferred callback window start (IST, stored as UTC).</summary>
    public DateTime? PreferredWindowStart { get; private set; }

    /// <summary>Customer-preferred callback window end (IST, stored as UTC).</summary>
    public DateTime? PreferredWindowEnd { get; private set; }

    /// <summary>Confirmed scheduled time agreed with customer (UTC).</summary>
    public DateTime? ScheduledAt { get; private set; }

    /// <summary>Actual completion time (UTC).</summary>
    public DateTime? CompletedAt { get; private set; }

    /// <summary>Brief description of issue provided by customer.</summary>
    public string? IssueDescription { get; private set; }

    /// <summary>Summary written by agent after completing the call.</summary>
    public string? ResolutionSummary { get; private set; }

    /// <summary>Phone number to call back (from user profile or overridden).</summary>
    public string PhoneNumber { get; private set; } = string.Empty;

    /// <summary>Escalation reason — set when status transitions to Escalated.</summary>
    public string? EscalationReason { get; private set; }

    /// <summary>Cancellation reason.</summary>
    public string? CancellationReason { get; private set; }

    /// <summary>Number of times this callback has been rescheduled.</summary>
    public int RescheduleCount { get; private set; }

    /// <summary>
    /// SEC-027 DPDP: Timestamp when this record was anonymized under Right-to-Erasure.
    /// Null until erasure is applied.
    /// </summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>
    /// SEC-027 DPDP: Reason code for anonymization (e.g. 'DPDP_ORG_ERASURE').
    /// </summary>
    public string? AnonymizationReason { get; private set; }

    /// <summary>Readonly navigation to call notes.</summary>
    public IReadOnlyList<CallNote> Notes => _notes.AsReadOnly();

    private Callback() { }

    /// <summary>Creates a new callback request in Pending status.</summary>
    public static Callback Create(
        Guid? userId,
        Guid? organizationId,
        string phoneNumber,
        CallbackCategory category,
        CallbackPriority priority,
        string? issueDescription,
        DateTime? preferredWindowStart,
        DateTime? preferredWindowEnd)
    {
        var cb = new Callback
        {
            UserId = userId,
            OrganizationId = organizationId,
            PhoneNumber = phoneNumber,
            Category = category,
            Priority = priority,
            IssueDescription = issueDescription,
            PreferredWindowStart = preferredWindowStart,
            PreferredWindowEnd = preferredWindowEnd,
            Status = CallbackStatus.Pending
        };
        cb.AddDomainEvent(new CallbackRequestedEvent(cb.Id, userId ?? Guid.Empty, category));
        return cb;
    }

    /// <summary>Assigns an agent. Transitions Pending → Assigned.</summary>
    public void Assign(Guid agentId)
    {
        if (Status != CallbackStatus.Pending)
            throw new InvalidOperationException($"Cannot assign callback in status {Status}.");
        AssignedAgentId = agentId;
        Status = CallbackStatus.Assigned;
        AddDomainEvent(new CallbackAssignedEvent(Id, agentId));
    }

    /// <summary>Confirms a scheduled time. Transitions Assigned → Confirmed.</summary>
    public void Confirm(DateTime scheduledAt)
    {
        if (Status != CallbackStatus.Assigned)
            throw new InvalidOperationException($"Cannot confirm callback in status {Status}.");
        ScheduledAt = scheduledAt;
        Status = CallbackStatus.Confirmed;
        AddDomainEvent(new CallbackConfirmedEvent(Id, scheduledAt));
    }

    /// <summary>Marks the call as completed. Transitions Confirmed → Completed.</summary>
    public void Complete(string? resolutionSummary)
    {
        if (Status is not (CallbackStatus.Confirmed or CallbackStatus.Assigned))
            throw new InvalidOperationException($"Cannot complete callback in status {Status}.");
        ResolutionSummary = resolutionSummary;
        CompletedAt = DateTime.UtcNow;
        Status = CallbackStatus.Completed;
        AddDomainEvent(new CallbackCompletedEvent(Id, AssignedAgentId ?? Guid.Empty, resolutionSummary));
    }

    /// <summary>Escalates to a senior agent. Valid from Pending/Assigned/Confirmed.</summary>
    public void Escalate(string reason)
    {
        if (Status is CallbackStatus.Completed or CallbackStatus.Cancelled)
            throw new InvalidOperationException($"Cannot escalate callback in status {Status}.");
        EscalationReason = reason;
        Status = CallbackStatus.Escalated;
        AddDomainEvent(new CallbackEscalatedEvent(Id, reason));
    }

    /// <summary>Cancels the callback.</summary>
    public void Cancel(string? reason)
    {
        if (Status is CallbackStatus.Completed)
            throw new InvalidOperationException("Cannot cancel a completed callback.");
        CancellationReason = reason;
        Status = CallbackStatus.Cancelled;
        AddDomainEvent(new CallbackCancelledEvent(Id, reason));
    }

    /// <summary>Reschedules to a new preferred window. Only on Pending/Assigned/Confirmed.</summary>
    public void Reschedule(DateTime newWindowStart, DateTime newWindowEnd)
    {
        if (Status is CallbackStatus.Completed or CallbackStatus.Cancelled)
            throw new InvalidOperationException($"Cannot reschedule callback in status {Status}.");
        PreferredWindowStart = newWindowStart;
        PreferredWindowEnd = newWindowEnd;
        ScheduledAt = null;
        if (Status == CallbackStatus.Confirmed) Status = CallbackStatus.Assigned;
        RescheduleCount++;
    }

    /// <summary>Adds a call note.</summary>
    public void AddNote(Guid authorId, string content, bool isInternal)
    {
        _notes.Add(CallNote.Create(Id, authorId, content, isInternal));
    }

    /// <summary>
    /// SEC-027: Anonymizes this callback record under DPDP Act 2023 Right-to-Erasure.
    /// Clears the user link; records the anonymization timestamp and reason.
    /// The <c>user_id</c> column is set to NULL via EF Core backing field.
    /// </summary>
    /// <param name="reason">Reason code, e.g. 'DPDP_ORG_ERASURE'.</param>
    public void Anonymize(string reason)
    {
        UserId = null;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }

}
