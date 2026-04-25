using ChatService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A message within a <see cref="ChatThread"/>.
/// Canonical table: chat.messages (migration 029).
/// P6-HANDOFF: AttachmentsJson = GCS URI metadata only (never base64 bytes).
/// P6-HANDOFF: ClientMessageId = offline idempotency key (UNIQUE per (thread_id, client_message_id)).
/// </summary>
public class ChatMessage : BaseAuditableEntity
{
    /// <summary>Parent thread.</summary>
    public Guid ThreadId { get; private set; }

    /// <summary>User who sent the message. Nullable post-DPDP-erasure (anonymized).</summary>
    public Guid? SenderUserId { get; private set; }

    /// <summary>Message body (plain text / markdown).</summary>
    public string Body { get; private set; } = string.Empty;

    /// <summary>
    /// GCS URI metadata for file attachments.
    /// Format: [{gcs_uri, filename, content_type, size_bytes, uploaded_at, uploaded_by}].
    /// Never stores raw bytes.
    /// </summary>
    public string? AttachmentsJson { get; private set; }

    /// <summary>
    /// Client-generated idempotency key — UNIQUE per (thread_id, client_message_id).
    /// Allows offline clients to re-POST the same message without duplication.
    /// </summary>
    public string? ClientMessageId { get; private set; }

    /// <summary>
    /// Set once the full-text search tsvector is computed (by DB trigger on insert).
    /// Applications should NOT set this manually.
    /// </summary>
    public string? BodyTsvector { get; private set; }

    /// <summary>DPDP: timestamp of sender anonymization.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>DPDP: reason for anonymization.</summary>
    public string? AnonymizationReason { get; private set; }

    /// <summary>Navigation: read receipts for this message.</summary>
    public IReadOnlyList<ReadReceipt> ReadReceipts => _readReceipts.AsReadOnly();
    private readonly List<ReadReceipt> _readReceipts = [];

    private ChatMessage() { }

    /// <summary>
    /// Creates a new message and raises <see cref="MessageSentEvent"/>.
    /// </summary>
    public static ChatMessage Create(
        Guid threadId,
        Guid senderUserId,
        string body,
        string? attachmentsJson = null,
        string? clientMessageId = null)
    {
        var message = new ChatMessage
        {
            ThreadId = threadId,
            SenderUserId = senderUserId,
            Body = body,
            AttachmentsJson = attachmentsJson,
            ClientMessageId = clientMessageId
        };

        message.AddDomainEvent(new MessageSentEvent(message.Id, threadId, senderUserId, body));
        return message;
    }

    /// <summary>
    /// DPDP Act 2023: anonymize sender on user erasure.
    /// Nulls SenderUserId, sets AnonymizedAt + AnonymizationReason.
    /// DB trigger blocks hard-delete.
    /// </summary>
    public void AnonymizeSender(string reason = "DPDP_USER_ERASURE")
    {
        SenderUserId = null;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
