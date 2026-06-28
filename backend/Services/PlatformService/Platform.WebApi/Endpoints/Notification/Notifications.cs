using MediatR;
using NotificationService.Application.Notifications.Commands.FireCelebration;
using NotificationService.Application.Notifications.Commands.MarkAllRead;
using NotificationService.Application.Notifications.Commands.MarkRead;
using NotificationService.Application.Notifications.Commands.RegisterPushToken;
using NotificationService.Application.Notifications.Commands.RetryDlqItem;
using NotificationService.Application.Notifications.Commands.SendNotification;
using NotificationService.Application.Notifications.Commands.UpdatePreferences;
using NotificationService.Application.Notifications.Queries.GetCelebrations;
using NotificationService.Application.Notifications.Queries.GetDlq;
using NotificationService.Application.Notifications.Queries.GetInbox;
using NotificationService.Application.Notifications.Queries.GetPreferences;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace NotificationService.Api.Endpoints;

/// <summary>
/// Notification endpoints — fan-out dispatch, inbox, preferences, push tokens, DLQ.
/// Rate limit: 100 req/min (standard). AI-rated endpoints do not apply here.
/// </summary>
public sealed class Notifications : EndpointGroupBase
{
    public override string? GroupName => "/notifications";

    public override void Map(RouteGroupBuilder g)
    {
        // POST /notifications/send — internal fan-out (called by other services)
        g.MapPost("/send", SendNotification)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SendNotification")
            .WithSummary("Fan-out: dispatch a notification to a user across eligible channels.");

        // GET /notifications/inbox — paginated in-app inbox for the calling user
        // DG-NOTIF-04: accepts category (GST|ITR|DOCS|LOAN|CALLBACK|BILLING|SYSTEM) and unreadOnly
        g.MapGet("/inbox", GetInbox)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetInbox")
            .WithSummary("Returns paginated in-app notification inbox for the authenticated user.")
            .WithDescription(
                "Accepts optional query params: page, pageSize, category (GST|ITR|DOCS|LOAN|CALLBACK|BILLING|SYSTEM), unreadOnly. " +
                "Returns items with status READ|UNREAD, title, category, deepLinkUrl, and linkedEntity* fields.");

        // POST /notifications/{id}/read — mark a single in-app notification as read
        g.MapPost("/{id:guid}/read", MarkRead)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("MarkNotificationRead")
            .WithSummary("Marks a single in-app inbox notification as read.");

        // POST /notifications/read-all — mark all unread inbox notifications as read
        // DG-NOTIF-04: new endpoint consumed by admin notification center markAllNotificationsRead()
        g.MapPost("/read-all", MarkAllRead)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("MarkAllNotificationsRead")
            .WithSummary("Marks all unread in-app notifications as read for the authenticated user.");

        // GET /notifications/preferences — get all channel preferences for the calling user
        g.MapGet("/preferences", GetPreferences)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetNotificationPreferences")
            .WithSummary("Returns all notification preferences for the authenticated user.");

        // PUT /notifications/preferences — upsert a preference for a specific event code
        g.MapPut("/preferences", UpdatePreferences)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("UpdateNotificationPreferences")
            .WithSummary("Creates or updates channel preferences for a specific event code.");

        // POST /notifications/push-tokens — register or refresh an FCM device token
        g.MapPost("/push-tokens", RegisterPushToken)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RegisterPushToken")
            .WithSummary("Registers or refreshes an FCM push token for a user device.");

        // GET /notifications/dlq — operator: list DLQ items
        g.MapGet("/dlq", GetDlq)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetDlq")
            .WithSummary("Returns paginated DLQ items for operator review.");

        // POST /notifications/dlq/{id}/retry — operator: retry a DLQ item
        g.MapPost("/dlq/{id:guid}/retry", RetryDlqItem)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RetryDlqItem")
            .WithSummary("Retries a DLQ item by re-dispatching via the fan-out pipeline.");

        // Phase 6F: Celebration tracking (per-user × per-kind idempotent firing)
        // Decision: reuses notification.notification_log with EventCode='celebration.{kind}'
        // No new migration needed.

        // POST /notifications/celebrations/{kind}/fire
        g.MapPost("/celebrations/{kind}/fire", FireCelebration)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("FireCelebration")
            .WithSummary("Records that a celebration animation fired for this user+kind (idempotent).")
            .WithDescription(
                "Allowed kinds: first_gst_filed, first_refund_credited, first_loan_disbursed, " +
                "first_itr_filed, first_document_uploaded. " +
                "Duplicate calls return 200 OK with alreadyFired=true.");

        // GET /notifications/celebrations
        g.MapGet("/celebrations", GetCelebrations)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetCelebrations")
            .WithSummary("Returns map of celebration kind → boolean indicating whether it has been fired.");
    }

    private static async Task<IResult> SendNotification(
        SendNotificationRequest req,
        ISender sender,
        CancellationToken ct)
    {
        var command = new SendNotificationCommand(
            req.UserId,
            req.EventCode,
            req.Locale,
            req.Variables,
            req.RecipientEmail,
            req.RecipientPhone);

        var result = await sender.Send(command, ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    /// <summary>
    /// GET /notifications/inbox
    /// DG-NOTIF-04: accepts category + unreadOnly query params.
    /// </summary>
    private static async Task<IResult> GetInbox(
        ICurrentUser currentUser,
        ISender sender,
        int page = 1,
        int pageSize = 20,
        string? category = null,
        bool? unreadOnly = null,
        CancellationToken ct = default)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var result = await sender.Send(
            new GetInboxQuery(currentUser.UserId, page, pageSize, category, unreadOnly), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> MarkRead(
        Guid id,
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var result = await sender.Send(new MarkReadCommand(id, currentUser.UserId), ct);
        return result.IsSuccess
            ? Results.NoContent()
            : result.Error.Code.Contains("NotFound")
                ? Results.NotFound(new { error = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Message });
    }

    /// <summary>
    /// POST /notifications/read-all
    /// DG-NOTIF-04: marks all unread inbox notifications as read for the calling user.
    /// </summary>
    private static async Task<IResult> MarkAllRead(
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var result = await sender.Send(new MarkAllReadCommand(currentUser.UserId), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetPreferences(
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var result = await sender.Send(new GetPreferencesQuery(currentUser.UserId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> UpdatePreferences(
        UpdatePreferencesRequest req,
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var command = new UpdatePreferencesCommand(
            currentUser.UserId,
            req.EventCode,
            req.PushEnabled,
            req.SmsEnabled,
            req.EmailEnabled,
            req.InAppEnabled,
            req.QuietHoursStart,
            req.QuietHoursEnd,
            req.DoNotDisturb);
        var result = await sender.Send(command, ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> RegisterPushToken(
        RegisterPushTokenRequest req,
        ICurrentUser currentUser,
        ISender sender,
        CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated) return Results.Unauthorized();
        var command = new RegisterPushTokenCommand(currentUser.UserId, req.DeviceId, req.Token, req.Platform);
        var result = await sender.Send(command, ct);
        return result.IsSuccess ? Results.NoContent() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetDlq(
        ISender sender,
        bool includeResolved = false,
        int page = 1,
        int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await sender.Send(new GetDlqQuery(includeResolved, page, pageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> RetryDlqItem(
        Guid id,
        ISender sender,
        CancellationToken ct)
    {
        var result = await sender.Send(new RetryDlqItemCommand(id), ct);
        return result.IsSuccess ? Results.Accepted() : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> FireCelebration(
        string kind,
        ISender sender,
        CancellationToken ct)
    {
        var result = await sender.Send(new FireCelebrationCommand(kind), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    private static async Task<IResult> GetCelebrations(
        ISender sender,
        CancellationToken ct)
    {
        var result = await sender.Send(new GetCelebrationsQuery(), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }
}

// ──────────────────────────── Request DTOs ────────────────────────────

/// <summary>Request body for POST /notifications/send.</summary>
public record SendNotificationRequest(
    Guid UserId,
    string EventCode,
    string Locale,
    IReadOnlyDictionary<string, string> Variables,
    string? RecipientEmail = null,
    string? RecipientPhone = null);

/// <summary>Request body for PUT /notifications/preferences.</summary>
public record UpdatePreferencesRequest(
    string EventCode,
    bool PushEnabled,
    bool SmsEnabled,
    bool EmailEnabled,
    bool InAppEnabled,
    string? QuietHoursStart = null,
    string? QuietHoursEnd = null,
    bool DoNotDisturb = false);

/// <summary>Request body for POST /notifications/push-tokens.</summary>
public record RegisterPushTokenRequest(
    string DeviceId,
    string Token,
    string Platform);
