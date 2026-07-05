using MediatR;
using NotificationService.Application.Notifications.Commands.CreateTemplate;
using NotificationService.Application.Notifications.Commands.DeleteTemplate;
using NotificationService.Application.Notifications.Commands.TestSendTemplate;
using NotificationService.Application.Notifications.Commands.UpdateTemplate;
using NotificationService.Application.Notifications.Queries.GetDltStatus;
using NotificationService.Application.Notifications.Queries.GetTemplate;
using NotificationService.Application.Notifications.Queries.ListTemplates;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace NotificationService.Api.Endpoints;

/// <summary>
/// Notification template manager endpoints (GAP-037).
/// Admin permission: notification.templates.manage.
/// All endpoints: standard rate limit (100 req/min).
///
/// Dispatch lookup order:
///   1. Active DB template (IsCurrent=true) for (event_code, channel, locale)
///   2. Code-defined defaults (existing SendNotificationCommandHandler fallback)
///
/// Variable substitution: {{placeholder}} tokens. Test-send endpoint shows
/// [MISSING:name] for any unreplaced tokens.
/// </summary>
public sealed class Templates : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/notifications/templates";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        /// <summary>GET /notifications/templates — List templates (filterable by event/channel/locale).</summary>
        g.MapGet("/", ListTemplates)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListNotificationTemplates")
            .WithSummary("GAP-037: List notification templates (admin). Filterable by event_code, channel, locale.");

        /// <summary>GET /notifications/templates/{id} — Get a single template.</summary>
        g.MapGet("/{id:guid}", GetTemplate)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetNotificationTemplate")
            .WithSummary("GAP-037: Get a notification template by ID (admin). Returns placeholder names.");

        /// <summary>POST /notifications/templates — Create a new template version.</summary>
        g.MapPost("/", CreateTemplate)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CreateNotificationTemplate")
            .WithSummary("GAP-037: Create a notification template (admin). Retires existing current version for same event×channel×locale.");

        /// <summary>PUT /notifications/templates/{id} — Update template body/metadata in-place.</summary>
        g.MapPut("/{id:guid}", UpdateTemplate)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("UpdateNotificationTemplate")
            .WithSummary("GAP-037: Update a notification template body and metadata in-place (admin).");

        /// <summary>DELETE /notifications/templates/{id} — Soft-delete a template.</summary>
        g.MapDelete("/{id:guid}", DeleteTemplate)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("DeleteNotificationTemplate")
            .WithSummary("GAP-037: Soft-delete a notification template (admin).");

        /// <summary>POST /notifications/templates/{id}/test-send — Send template to calling admin as test.</summary>
        g.MapPost("/{id:guid}/test-send", TestSendTemplate)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("TestSendNotificationTemplate")
            .WithSummary("GAP-037: Test-send a template to the calling admin. Returns rendered body + missing variable warnings.");

        /// <summary>
        /// GET /notifications/templates/dlt-status — DG-NOTIF-07: DLT registration coverage report.
        /// Returns all SMS templates showing which are registered vs missing a TRAI DLT template ID.
        /// Dev-placeholder IDs (seeded by NotificationSeeder in non-production) are flagged separately
        /// so operators can distinguish dev scaffolding from real registrations.
        /// </summary>
        g.MapGet("/dlt-status", GetDltStatus)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetNotificationDltStatus")
            .WithSummary("DG-NOTIF-07: DLT registration coverage for SMS templates. Shows which event×locale combos are missing TRAI DLT IDs.")
            .WithDescription(
                "Returns all SMS-channel templates with their DLT registration status. " +
                "UnregisteredCount templates will have SMS suppressed in production. " +
                "DevPlaceholderCount templates carry a dev placeholder — real registration required before go-live. " +
                "HasUnregisteredCurrentTemplates=true means at least one current SMS template will suppress in prod.");
    }

    // ── Delegates ──────────────────────────────────────────────────────────────

    private static async Task<IResult> ListTemplates(
        ISender sender, CancellationToken ct,
        string? eventCode = null, NotificationChannel? channel = null, string? locale = null,
        int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(
            new ListTemplatesQuery(eventCode, channel, locale, page <= 0 ? 1 : page, pageSize <= 0 ? 20 : pageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> GetTemplate(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetTemplateQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CreateTemplate(CreateTemplateRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreateTemplateCommand(req.EventCode, req.Channel, req.Locale, req.Body, req.Subject, req.DltTemplateId, req.SenderName),
            ct);
        return result.IsSuccess
            ? Results.Created($"/notifications/templates/{result.Value!.TemplateId}", result.Value)
            : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> UpdateTemplate(Guid id, UpdateTemplateRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateTemplateCommand(id, req.Body, req.Subject, req.DltTemplateId, req.SenderName, req.IsActive),
            ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> DeleteTemplate(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeleteTemplateCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> TestSendTemplate(Guid id, TestSendRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new TestSendTemplateCommand(id, req.Variables ?? new Dictionary<string, string>(), req.RecipientEmail, req.RecipientPhone),
            ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    /// <summary>
    /// GET /notifications/templates/dlt-status
    /// DG-NOTIF-07: Returns DLT registration coverage for all SMS templates.
    /// </summary>
    private static async Task<IResult> GetDltStatus(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetDltStatusQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>Request for creating a notification template.</summary>
public record CreateTemplateRequest(
    string EventCode,
    NotificationChannel Channel,
    string Locale,
    string Body,
    string? Subject = null,
    string? DltTemplateId = null,
    string? SenderName = null);

/// <summary>Request for updating a notification template. IsActive toggles the template active/inactive (CG-11); omit to leave unchanged.</summary>
public record UpdateTemplateRequest(
    string Body,
    string? Subject = null,
    string? DltTemplateId = null,
    string? SenderName = null,
    bool? IsActive = null);

/// <summary>Request for test-sending a template.</summary>
public record TestSendRequest(
    IReadOnlyDictionary<string, string>? Variables = null,
    string? RecipientEmail = null,
    string? RecipientPhone = null);
