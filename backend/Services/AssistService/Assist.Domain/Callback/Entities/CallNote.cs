using SnapAccount.Shared.Domain;

namespace CallbackService.Domain.Entities;

/// <summary>
/// A note added to a callback by an agent or system.
/// Stored in <c>callback.call_notes</c>.
/// </summary>
public class CallNote : BaseAuditableEntity
{
    /// <summary>Parent callback ID.</summary>
    public Guid CallbackId { get; private set; }

    /// <summary>Author — agent or system user ID.</summary>
    public Guid AuthorId { get; private set; }

    /// <summary>Note content.</summary>
    public string Content { get; private set; } = string.Empty;

    /// <summary>If true, visible only to agents (not the customer).</summary>
    public bool IsInternal { get; private set; }

    private CallNote() { }

    /// <summary>Creates a call note.</summary>
    public static CallNote Create(Guid callbackId, Guid authorId, string content, bool isInternal)
        => new()
        {
            CallbackId = callbackId,
            AuthorId = authorId,
            Content = content,
            IsInternal = isInternal
        };
}
