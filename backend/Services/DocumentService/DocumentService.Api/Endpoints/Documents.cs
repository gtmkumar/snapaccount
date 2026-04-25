using DocumentService.Application.Documents.Commands.UploadDocument;
using MediatR;
using SnapAccount.Shared.Api;

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

    private static Task<IResult> GetDocuments(
        ISender sender,
        int page = 1,
        int pageSize = 20,
        string? status = null,
        Guid? categoryId = null)
    {
        // TODO Phase 2: wire GetDocumentsQuery when DbContext read-projection is ready
        return Task.FromResult(Results.Ok(new { message = "TODO", page, pageSize }));
    }

    private static Task<IResult> GetDocument(Guid id, ISender sender)
    {
        // TODO Phase 2: wire GetDocumentQuery
        return Task.FromResult(Results.Ok(new { message = "TODO", id }));
    }

    private static Task<IResult> CategorizeDocument(
        Guid id, CategorizeRequest req, ISender sender)
    {
        // TODO Phase 2: wire CategorizeDocumentCommand
        return Task.FromResult(Results.NoContent());
    }

    private static Task<IResult> ShareDocument(Guid id, ShareRequest req, ISender sender)
    {
        // TODO Phase 2: wire ShareDocumentCommand
        return Task.FromResult(Results.Ok(new { message = "TODO" }));
    }

    private static Task<IResult> RequestOcr(Guid id, ISender sender)
    {
        // TODO Phase 2: wire RequestOcrCommand — triggers Google Document AI pipeline
        return Task.FromResult(Results.Accepted($"/documents/{id}", new { message = "OCR queued." }));
    }
}

// Request DTOs
internal record CategorizeRequest(Guid CategoryId);
internal record ShareRequest(string SharedWithEmail, string? Permission = "VIEW");
