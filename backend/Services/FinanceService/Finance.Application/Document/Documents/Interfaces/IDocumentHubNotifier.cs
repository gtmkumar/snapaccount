namespace DocumentService.Application.Documents.Interfaces;

/// <summary>
/// DG-DOC-07: Abstraction over the DocumentHub SignalR context for broadcasting
/// real-time document status-change events.
/// Injected into Application-layer command handlers so the Domain/Application layers
/// remain free of infrastructure concerns (Infrastructure implements this via
/// <c>IHubContext&lt;DocumentHub&gt;</c>).
/// Mobile clients subscribe to the user-scoped group and call
/// <c>markReady(serverId)</c> on receipt, replacing / augmenting the 2.5s poll.
/// </summary>
public interface IDocumentHubNotifier
{
    /// <summary>
    /// Broadcasts a <c>DocumentStatusChanged</c> event to the SignalR user-group
    /// (<c>user:{userId}</c>) so the mobile client can update the queue item.
    /// </summary>
    /// <param name="documentId">The document whose status changed.</param>
    /// <param name="userId">Owner user ID — routes the event to the correct client group.</param>
    /// <param name="status">New status string (e.g. "OCR_COMPLETE", "APPROVED", "REJECTED").</param>
    /// <param name="ct">Cancellation token.</param>
    Task NotifyStatusChangedAsync(
        Guid documentId,
        Guid userId,
        string status,
        CancellationToken ct = default);
}
