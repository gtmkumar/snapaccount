using DocumentService.Application.Documents.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace DocumentService.Infrastructure.SignalR;

/// <summary>
/// DG-DOC-07: Infrastructure implementation of <see cref="IDocumentHubNotifier"/>.
/// Broadcasts document status changes to the user-scoped SignalR group via
/// <c>IHubContext&lt;DocumentHub&gt;</c>.
///
/// Failures are logged but not rethrown — the document transition already succeeded
/// in the DB; a failed push is gracefully recovered via the mobile's existing poll.
/// </summary>
public sealed class DocumentHubNotifier(
    IHubContext<DocumentHub> hubContext,
    ILogger<DocumentHubNotifier> logger) : IDocumentHubNotifier
{
    /// <inheritdoc />
    public async Task NotifyStatusChangedAsync(
        Guid documentId,
        Guid userId,
        string status,
        CancellationToken ct = default)
    {
        try
        {
            var groupName = DocumentHub.UserGroupName(userId.ToString());
            await hubContext.Clients
                .Group(groupName)
                .SendAsync(
                    "DocumentStatusChanged",
                    new DocumentStatusChangedPayload(documentId, status),
                    ct);

            logger.LogInformation(
                "DocumentHub: Pushed DocumentStatusChanged (doc={DocumentId} status={Status}) to group {Group}",
                documentId, status, groupName);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — the DB transition succeeded; mobile polling is the fallback.
            logger.LogError(ex,
                "DocumentHub: Failed to push DocumentStatusChanged for document {DocumentId}. " +
                "Mobile polling remains as fallback.",
                documentId);
        }
    }
}

/// <summary>
/// DG-DOC-07: Payload emitted to SignalR clients on <c>DocumentStatusChanged</c>.
/// Mobile client destructures <c>documentId</c> and <c>status</c> to call
/// <c>markReady(documentId)</c>, superseding the 2.5s poll.
/// </summary>
internal sealed record DocumentStatusChangedPayload(Guid DocumentId, string Status);
