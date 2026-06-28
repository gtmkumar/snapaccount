using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace DocumentService.Infrastructure.SignalR;

/// <summary>
/// DG-DOC-07: SignalR hub for real-time document status-change push.
/// Mobile clients connect here and join their personal user group to receive
/// <c>DocumentStatusChanged</c> events when OCR / review / approval transitions occur,
/// replacing or augmenting the existing 2.5s poll in DocumentListScreen.
///
/// Design:
/// - One group per user (<c>user:{userId}</c>) — a user may have multiple concurrent
///   connections (multiple tabs / devices); all receive the same event, each updates
///   its local queue independently.
/// - No per-document subscription needed — the event payload carries <c>documentId</c>
///   and <c>status</c>; mobile filters client-side via <c>markReady(documentId)</c>.
/// - Auth: Firebase JWT validated by <c>FirebaseAuthMiddleware</c> before hub connection;
///   <c>[Authorize]</c> provides a second enforcement layer.
/// - Mapped in Finance.WebApi/Program.cs at <c>/hubs/documents</c>.
/// </summary>
[Authorize]
public sealed class DocumentHub(ILogger<DocumentHub> logger) : Hub
{
    /// <summary>
    /// Client calls <c>SubscribeToDocumentUpdates</c> once after connecting.
    /// Adds the connection to the user-scoped group so it receives
    /// <c>DocumentStatusChanged</c> events for any document owned by the caller.
    /// </summary>
    public async Task SubscribeToDocumentUpdates()
    {
        var userId = GetUserId();
        if (userId == null)
        {
            await Clients.Caller.SendAsync("Error", "Not authenticated.");
            return;
        }

        var groupName = UserGroupName(userId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        logger.LogInformation(
            "DocumentHub: Connection {ConnectionId} joined user group {Group}",
            Context.ConnectionId, groupName);
    }

    /// <summary>Client calls this to leave the group (e.g., on screen unmount).</summary>
    public async Task UnsubscribeFromDocumentUpdates()
    {
        var userId = GetUserId();
        if (userId == null) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, UserGroupName(userId));
    }

    /// <inheritdoc />
    public override Task OnConnectedAsync()
    {
        logger.LogInformation(
            "DocumentHub: Connection {ConnectionId} (user {UserId}) connected.",
            Context.ConnectionId, GetUserId() ?? "<unknown>");
        return base.OnConnectedAsync();
    }

    /// <inheritdoc />
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        logger.LogInformation(
            "DocumentHub: Connection {ConnectionId} disconnected.",
            Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>Returns the SignalR group name for a user's personal document notifications.</summary>
    public static string UserGroupName(string userId) => $"user:{userId}";

    private string? GetUserId() =>
        Context.User?.FindFirst("user_id")?.Value
        ?? Context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
}
