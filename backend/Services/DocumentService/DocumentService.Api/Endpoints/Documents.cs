using DocumentService.Application.Admin.Queries.GetAdminDocumentQueue;
using DocumentService.Application.Admin.Queries.GetUserDocuments;
using DocumentService.Application.Dashboard.Queries.GetActivity;
using DocumentService.Application.Dashboard.Queries.GetDashboardStats;
using DocumentService.Application.Documents.Commands.AddDocumentTag;
using DocumentService.Application.Documents.Commands.ApproveDocument;
using DocumentService.Application.Documents.Commands.ArchiveDocument;
using DocumentService.Application.Documents.Commands.CategorizeDocument;
using DocumentService.Application.Documents.Commands.RejectDocument;
using DocumentService.Application.Documents.Commands.RemoveDocumentTag;
using DocumentService.Application.Documents.Commands.RequestClarification;
using DocumentService.Application.Documents.Commands.RequestOcr;
using DocumentService.Application.Documents.Commands.ShareDocument;
using DocumentService.Application.Documents.Commands.SubmitOcrFeedback;
using DocumentService.Application.Documents.Commands.UploadDocument;
using DocumentService.Application.Documents.Queries.GetDocument;
using DocumentService.Application.Documents.Queries.GetDocuments;
using DocumentService.Application.Documents.Queries.GetDocumentTags;
using DocumentService.Application.Documents.Queries.GetOcrAccuracyReport;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace DocumentService.Api.Endpoints;

/// <summary>
/// All /documents endpoints — upload, list, get, categorize, share, OCR.
/// Inherits <see cref="EndpointGroupBase"/>; discovered automatically by
/// <see cref="WebApplicationExtensions.MapEndpoints"/>.
/// </summary>
public sealed class Documents : EndpointGroupBase
{
    /// <summary>Route prefix: /documents (absolute path).</summary>
    public override string? GroupName => "/documents";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // POST /documents/upload — SEC-004: Authorized; rate-limited to 100/min
        groupBuilder.MapPost("/upload", UploadDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("UploadDocument");

        // GET /documents — paginated list for the authenticated user
        groupBuilder.MapGet("/", GetDocuments)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("GetDocuments");

        // GET /documents/{id}
        groupBuilder.MapGet("/{id:guid}", GetDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("GetDocument");

        // PUT /documents/{id}/category
        groupBuilder.MapPut("/{id:guid}/category", CategorizeDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("CategorizeDocument");

        // POST /documents/{id}/share
        groupBuilder.MapPost("/{id:guid}/share", ShareDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("ShareDocument");

        // POST /documents/{id}/ocr — AI endpoint: 20 req/min rate limit (cost guardrail)
        groupBuilder.MapPost("/{id:guid}/ocr", RequestOcr)
            .RequireAuthorization().RequireRateLimiting("ai").WithName("RequestOcr");

        // POST /documents/{id}/approve — operator approves a reviewed document (document.review permission)
        groupBuilder.MapPost("/{id:guid}/approve", ApproveDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("ApproveDocument")
            .WithSummary("Approve a reviewed document and emit the accounting pipeline event.");

        // POST /documents/{id}/reject — operator rejects a document with a mandatory reason
        groupBuilder.MapPost("/{id:guid}/reject", RejectDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("RejectDocument")
            .WithSummary("Reject a document with a mandatory reason. Body: { reason }.");

        // POST /documents/{id}/request-clarification — operator requests more info from the owner
        groupBuilder.MapPost("/{id:guid}/request-clarification", RequestDocumentClarification)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("RequestDocumentClarification")
            .WithSummary("Request clarification from the document owner. Body: { message }.");

        // POST /documents/{id}/archive — moves a document to ARCHIVED status
        groupBuilder.MapPost("/{id:guid}/archive", ArchiveDocument)
            .RequireAuthorization().RequireRateLimiting("standard").WithName("ArchiveDocument")
            .WithSummary("Archive a document (status → ARCHIVED). Idempotent.");

        // GET /documents/admin/dashboard-stats — admin-only count for cross-service dashboard
        groupBuilder.MapGet("/admin/dashboard-stats", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetDocumentAdminDashboardStats")
            .WithSummary("Pending document count for the admin cross-service dashboard.");

        // GET /documents/admin/activity?range=7D|30D|90D — daily creation series
        groupBuilder.MapGet("/admin/activity", static async (string? range, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetActivityQuery(range ?? "7D"), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetDocumentAdminActivity")
            .WithSummary("Daily document-creation counts for the cross-service activity chart.");

        // GET /documents/admin/users/{userId}/documents?limit=N — recent docs for a user
        groupBuilder.MapGet("/admin/users/{userId:guid}/documents", static async (
            Guid userId, int? limit, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetUserDocumentsQuery(userId, limit ?? 20), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetAdminUserDocuments")
            .WithSummary("Recent documents for a specific user — admin per-user detail view.");

        // ── GAP-013: Server-side SLA queue (replaces client-side SlaChip) ──────

        // GET /documents/admin/queue?page=1&pageSize=20&status=&overdueOnly=true&sortBy=sla_asc
        groupBuilder.MapGet("/admin/queue", static async (
            int? page, int? pageSize,
            string? status, Guid? categoryId,
            bool? overdueOnly, string? sortBy,
            ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAdminDocumentQueueQuery(
                Page: page ?? 1,
                PageSize: pageSize ?? 20,
                Status: status,
                CategoryId: categoryId,
                OverdueOnly: overdueOnly,
                SortBy: sortBy), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetAdminDocumentQueue")
            .WithSummary("GAP-013: Admin document queue with server-computed SLA / overdue fields. " +
                         "sortBy: sla_asc | uploaded_desc. overdueOnly=true filters to overdue only.");

        // ── GAP-015: Document tag CRUD ───────────────────────────────────────

        // GET /documents/{id}/tags
        groupBuilder.MapGet("/{id:guid}/tags", static async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDocumentTagsQuery(id), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetDocumentTags")
            .WithSummary("GAP-015: List all active tags on a document.");

        // POST /documents/{id}/tags
        // BUG-W6-004: Returns 201 Created when a new tag is inserted; 200 OK when the tag already
        // existed (idempotent re-add). The handler sets IsNewlyCreated to distinguish the two paths.
        groupBuilder.MapPost("/{id:guid}/tags", static async (Guid id, AddTagRequest req, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new AddDocumentTagCommand(id, req.TagName), ct);
            if (!result.IsSuccess)
                return MapError(result.Error);

            return result.Value.IsNewlyCreated
                ? Results.Created($"/documents/{id}/tags/{result.Value.TagId}", result.Value)
                : Results.Ok(result.Value);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("AddDocumentTag")
            .WithSummary("GAP-015: Add a tag to a document. Body: { tagName }. Idempotent — re-add returns 200 with existing tag.");

        // DELETE /documents/{id}/tags/{tagId}
        groupBuilder.MapDelete("/{id:guid}/tags/{tagId:guid}", static async (Guid id, Guid tagId, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new RemoveDocumentTagCommand(id, tagId), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RemoveDocumentTag")
            .WithSummary("GAP-015: Remove a tag from a document. Idempotent.");

        // ── GAP-014: OCR feedback write-path ────────────────────────────────

        // POST /documents/{id}/ocr-feedback
        groupBuilder.MapPost("/{id:guid}/ocr-feedback", static async (Guid id, OcrFeedbackRequest req, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(
                new SubmitOcrFeedbackCommand(id, req.OcrFieldId, req.IssueType, req.Notes), ct);
            return result.IsSuccess
                ? Results.Created($"/documents/{id}/ocr-feedback/{result.Value.FeedbackId}", result.Value)
                : MapError(result.Error);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("SubmitOcrFeedback")
            .WithSummary("GAP-014: Persist an operator OCR field correction. " +
                         "IssueType: WRONG_VALUE | MISSING_FIELD | WRONG_FIELD | ILLEGIBLE | FORMATTING_ERROR | OTHER.");

        // GET /documents/admin/ocr-accuracy?fromDate=&toDate=
        groupBuilder.MapGet("/admin/ocr-accuracy", static async (
            DateOnly? fromDate, DateOnly? toDate, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetOcrAccuracyReportQuery(fromDate, toDate), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetOcrAccuracyReport")
            .WithSummary("GAP-014: OCR accuracy report aggregated by field name and issue type. " +
                         "Default window: last 30 days.");
    }

    private static async Task<IResult> UploadDocument(HttpRequest httpRequest, ISender sender)
    {
        if (!httpRequest.HasFormContentType)
            return Results.BadRequest(new { error = "Expected multipart/form-data." });

        var form = await httpRequest.ReadFormAsync();
        var file = form.Files.GetFile("file");
        if (file is null)
            return Results.BadRequest(new { error = "Field 'file' is required." });

        var orgIdStr = form["organizationId"].FirstOrDefault();
        var categoryIdStr = form["categoryId"].FirstOrDefault();

        var result = await sender.Send(new UploadDocumentCommand(
            file.OpenReadStream(),
            file.FileName,
            file.ContentType,
            file.Length,
            Guid.TryParse(orgIdStr, out var orgId) ? orgId : null,
            Guid.TryParse(categoryIdStr, out var catId) ? catId : null));

        return result.IsSuccess
            ? Results.Created($"/documents/{result.Value.DocumentId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    private static async Task<IResult> GetDocuments(
        ISender sender,
        int page = 1,
        int pageSize = 20,
        string? status = null,
        Guid? categoryId = null)
    {
        var result = await sender.Send(new GetDocumentsQuery(page, pageSize, status, categoryId));
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> GetDocument(Guid id, ISender sender)
    {
        var result = await sender.Send(new GetDocumentQuery(id));
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> CategorizeDocument(
        Guid id, CategorizeRequest req, ISender sender)
    {
        var result = await sender.Send(new CategorizeDocumentCommand(id, req.CategoryId));
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> ShareDocument(Guid id, ShareRequest req, ISender sender)
    {
        var result = await sender.Send(new ShareDocumentCommand(
            id, req.ShareType, req.SharedWith, req.ExternalEmail, req.ExpiresAt));
        return result.IsSuccess
            ? Results.Created($"/documents/{id}/shares/{result.Value.ShareId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> RequestOcr(Guid id, ISender sender)
    {
        var result = await sender.Send(new RequestOcrCommand(id));
        return result.IsSuccess
            ? Results.Accepted($"/documents/{id}", new { message = "OCR queued." })
            : MapError(result.Error);
    }

    private static async Task<IResult> ApproveDocument(Guid id, ISender sender)
    {
        var result = await sender.Send(new ApproveDocumentCommand(id));
        return result.IsSuccess
            ? Results.Ok(new { message = "Document approved." })
            : MapError(result.Error);
    }

    private static async Task<IResult> RejectDocument(Guid id, RejectRequest req, ISender sender)
    {
        var result = await sender.Send(new RejectDocumentCommand(id, req.Reason));
        return result.IsSuccess
            ? Results.Ok(new { message = "Document rejected." })
            : MapError(result.Error);
    }

    private static async Task<IResult> RequestDocumentClarification(
        Guid id, ClarificationRequest req, ISender sender)
    {
        var result = await sender.Send(new RequestClarificationCommand(id, req.Message));
        return result.IsSuccess
            ? Results.Ok(new { message = "Clarification request recorded." })
            : MapError(result.Error);
    }

    private static async Task<IResult> ArchiveDocument(Guid id, ISender sender)
    {
        var result = await sender.Send(new ArchiveDocumentCommand(id));
        return result.IsSuccess
            ? Results.Ok(new { message = "Document archived." })
            : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        ErrorType.Conflict => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Unauthorized => Results.Unauthorized(),
        ErrorType.Forbidden => Results.Forbid(),
        _ => Results.BadRequest(new { error = error.Message, code = error.Code })
    };
}

// Request DTOs
internal record CategorizeRequest(Guid CategoryId);
internal record ShareRequest(
    string ShareType,
    Guid? SharedWith = null,
    string? ExternalEmail = null,
    DateTime? ExpiresAt = null);
internal record RejectRequest(string Reason);
internal record ClarificationRequest(string Message);
internal record AddTagRequest(string TagName);
internal record OcrFeedbackRequest(Guid OcrFieldId, string IssueType, string? Notes = null);
