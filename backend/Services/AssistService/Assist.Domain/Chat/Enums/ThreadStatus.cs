namespace ChatService.Domain.Enums;

/// <summary>
/// State machine for a chat thread.
/// Valid transitions:
///   OPEN → PENDING_USER  (agent replies)
///   PENDING_USER → OPEN  (user replies)
///   OPEN | PENDING_USER → RESOLVED
///   OPEN | PENDING_USER → ESCALATED
///   RESOLVED | ESCALATED → REOPENED → OPEN
/// </summary>
public enum ThreadStatus
{
    /// <summary>Thread is open and awaiting an agent reply.</summary>
    Open = 1,

    /// <summary>Agent has replied; waiting for the user to respond.</summary>
    PendingUser = 2,

    /// <summary>Thread has been resolved.</summary>
    Resolved = 3,

    /// <summary>Thread has been escalated (e.g. to a CA).</summary>
    Escalated = 4,

    /// <summary>Previously resolved/escalated thread that was re-opened.</summary>
    Reopened = 5
}
