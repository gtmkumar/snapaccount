namespace ChatService.Domain.Enums;

/// <summary>
/// Role of the sender of a <see cref="Entities.ChatMessage"/>, persisted to the
/// NOT NULL <c>chat.messages.sender_role</c> column (migration 029).
/// CHECK vocabulary: 'USER','CA','ADMIN','SYSTEM','AI'.
/// Derived from the sender's <see cref="ParticipantRole"/> when a message is created.
/// </summary>
public enum MessageSenderRole
{
    /// <summary>The SME customer.</summary>
    User = 1,

    /// <summary>A Chartered Accountant.</summary>
    CA = 2,

    /// <summary>Operations / support staff (agents, loan officers).</summary>
    Admin = 3,

    /// <summary>System-generated message (routing, notices).</summary>
    System = 4,

    /// <summary>AI assistant.</summary>
    AI = 5
}
