namespace ChatService.Domain.Enums;

/// <summary>
/// Role of a participant within a chat thread.
/// </summary>
public enum ParticipantRole
{
    /// <summary>The SME user who opened the thread.</summary>
    User = 1,

    /// <summary>An agent (OPS / support staff) assigned to the thread.</summary>
    Agent = 2,

    /// <summary>A Chartered Accountant assigned for escalated threads.</summary>
    CA = 3,

    /// <summary>A loan officer participant.</summary>
    LoanOfficer = 4,

    /// <summary>A read-only system/bot participant.</summary>
    Bot = 5
}
