using LoanService.Application.LoanApplications.Commands.AssignToBank;
using LoanService.Application.LoanApplications.Commands.AttachDocument;
using LoanService.Application.LoanApplications.Commands.CheckEligibility;
using LoanService.Application.LoanApplications.Commands.CloseApplication;
using LoanService.Application.LoanApplications.Commands.GeneratePackage;
using LoanService.Application.LoanApplications.Commands.RecordBankDecision;
using LoanService.Application.Consents.Queries.GetConsentCatalog;
using LoanService.Application.Dashboard.Queries.GetDashboardStats;
using LoanService.Application.LoanApplications.Commands.RecordConsent;
using LoanService.Application.LoanApplications.Commands.RecordDisbursement;
using LoanService.Application.LoanApplications.Commands.StartApplication;
using LoanService.Application.LoanApplications.Commands.SubmitApplication;
using LoanService.Application.LoanApplications.Commands.UpdateApplication;
using LoanService.Application.LoanApplications.Queries.GetApplication;
using LoanService.Application.LoanApplications.Queries.GetBankCommunicationLog;
using LoanService.Application.LoanApplications.Queries.GetEligibilityResult;
using LoanService.Application.LoanApplications.Queries.GetPackageDownloadUrl;
using LoanService.Application.LoanApplications.Queries.ListApplications;
using LoanService.Application.PartnerBanks.Commands.CreatePartnerBank;
using LoanService.Application.PartnerBanks.Commands.UpdatePartnerBank;
using LoanService.Application.PartnerBanks.Queries.GetPartnerBanks;
using LoanService.Infrastructure.Webhooks;
using MediatR;
using SnapAccount.Shared.Api;

namespace LoanService.Api.Endpoints;

/// <summary>
/// All /loans endpoints — applications, eligibility, consents, packages, partner banks, webhooks.
/// Phase 6C: all endpoints fully wired, ZERO 501.
///
/// Inherits <see cref="EndpointGroupBase"/>; auto-discovered.
/// </summary>
public sealed class Loans : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/loans";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Applications ──────────────────────────────────────────────────────

        /// <summary>POST /loans/applications — Start a new loan application.</summary>
        groupBuilder.MapPost("/applications", StartApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("StartLoanApplication")
            .WithSummary("Start a new loan application (DRAFT status)");

        /// <summary>GET /loans/applications — List applications for current org.</summary>
        groupBuilder.MapGet("/applications", ListApplications)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListLoanApplications")
            .WithSummary("List loan applications for current organisation");

        /// <summary>GET /loans/applications/{id} — Get single application.</summary>
        groupBuilder.MapGet("/applications/{id:guid}", GetApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanApplication")
            .WithSummary("Get loan application by ID (IDOR-scoped to org)");

        /// <summary>PATCH /loans/applications/{id} — Update a DRAFT application.</summary>
        groupBuilder.MapPatch("/applications/{id:guid}", UpdateApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("UpdateLoanApplication");

        /// <summary>POST /loans/applications/{id}/documents — Attach a document.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/documents", AttachDocument)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("AttachLoanDocument");

        /// <summary>POST /loans/applications/{id}/consents — Record a consent.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/consents", RecordConsent)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RecordConsent");

        /// <summary>POST /loans/applications/{id}/submit — Submit for bank review.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/submit", SubmitApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("SubmitLoanApplication");

        /// <summary>POST /loans/applications/{id}/assign-bank — Assign to partner bank.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/assign-bank", AssignToBank)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("AssignLoanToBank");

        /// <summary>POST /loans/applications/{id}/bank-decision — Record bank decision.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/bank-decision", RecordBankDecision)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RecordBankDecision");

        /// <summary>POST /loans/applications/{id}/disbursement — Record disbursement.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/disbursement", RecordDisbursement)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RecordLoanDisbursement");

        /// <summary>POST /loans/applications/{id}/close — Close an application.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/close", CloseApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("CloseLoanApplication");

        /// <summary>POST /loans/applications/{id}/package — Generate PDF package.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/package", GeneratePackage)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GenerateLoanPackage")
            .WithSummary("Generate composite loan PDF package")
            .WithDescription("Expected latency: up to 30s (QuestPDF + GCS upload). Rate limit: standard.");

        /// <summary>GET /loans/applications/{id}/package/download-url — Get signed download URL.</summary>
        groupBuilder.MapGet("/applications/{id:guid}/package/download-url", GetPackageDownloadUrl)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanPackageDownloadUrl");

        /// <summary>GET /loans/applications/{id}/bank-comms-log — Get status/comms log.</summary>
        groupBuilder.MapGet("/applications/{id:guid}/bank-comms-log", GetBankCommunicationLog)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetBankCommunicationLog");

        // ── Eligibility ───────────────────────────────────────────────────────

        /// <summary>POST /loans/eligibility-check — Run eligibility engine.</summary>
        groupBuilder.MapPost("/eligibility-check", CheckEligibility)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("CheckLoanEligibility");

        /// <summary>GET /loans/eligibility — Get eligibility result for current org.</summary>
        groupBuilder.MapGet("/eligibility", GetEligibilityResult)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanEligibilityResult");

        // ── Partner Banks ─────────────────────────────────────────────────────

        /// <summary>GET /loans/partner-banks — List active partner banks.</summary>
        groupBuilder.MapGet("/partner-banks", GetPartnerBanks)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetPartnerBanks");

        /// <summary>POST /loans/partner-banks — Create partner bank (admin only).</summary>
        groupBuilder.MapPost("/partner-banks", CreatePartnerBank)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("CreatePartnerBank");

        /// <summary>PATCH /loans/partner-banks/{id} — Update partner bank (admin only).</summary>
        groupBuilder.MapPatch("/partner-banks/{id:guid}", UpdatePartnerBank)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("UpdatePartnerBank");

        // ── Consents catalog (P6-HANDOFF-25 / SEC-050) ───────────────────────

        /// <summary>GET /loans/consents/catalog — Versioned consent text catalog (DPDP audit).</summary>
        groupBuilder.MapGet("/consents/catalog", GetConsentCatalog)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanConsentCatalog")
            .WithSummary("Versioned loan consent text catalog")
            .WithDescription("Returns current (non-retired) consent text per type for the requested locale. Mobile echoes the returned textVersion in RecordConsent so DPDP audit trail ties back to exactly what the user saw.");

        // ── Admin Dashboard ───────────────────────────────────────────────────

        groupBuilder.MapGet("/admin/dashboard-stats", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanAdminDashboardStats")
            .WithSummary("Active loan applications count for the admin cross-service dashboard.");

        // ── Webhooks (no auth — HMAC verified in handler) ─────────────────────

        /// <summary>
        /// POST /loans/webhooks/{bankId}/disbursement — Receive bank disbursement webhook.
        /// P6-HANDOFF-33: HMAC-SHA256 verified, idempotency key 30-day TTL.
        /// Latency: expected &lt;500ms. No rate limit (bank calls only).
        /// </summary>
        groupBuilder.MapPost("/webhooks/{bankId:guid}/disbursement", HandleDisbursementWebhook)
            .WithName("HandleDisbursementWebhook")
            .WithSummary("Receive disbursement webhook from partner bank")
            .WithDescription("HMAC-SHA256 verified. No JWT auth — called by bank systems.");
    }

    // ── Handler delegates ──────────────────────────────────────────────────────

    private static async Task<IResult> StartApplication(
        StartApplicationCommand command, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(command, ct);
        return result.IsSuccess
            ? Results.Created($"/loans/applications/{result.Value.ApplicationId}", result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> ListApplications(
        [AsParameters] ListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListApplicationsQuery(p.Status, p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> GetApplication(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetApplicationQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    private static async Task<IResult> UpdateApplication(
        Guid id, UpdateApplicationRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateApplicationCommand(id, req.RequestedAmount, req.TenureMonths, req.Purpose), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> AttachDocument(
        Guid id, AttachDocumentRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new AttachDocumentCommand(id, req.DocumentId, req.DocumentType), ct);
        return result.IsSuccess
            ? Results.Created($"/loans/applications/{id}/documents/{result.Value.ApplicationDocumentId}", result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> RecordConsent(
        Guid id, RecordConsentRequest req, ISender sender, HttpContext http, CancellationToken ct)
    {
        var ip = http.Connection.RemoteIpAddress?.ToString();
        var ua = http.Request.Headers.UserAgent.ToString();
        var result = await sender.Send(
            new RecordConsentCommand(id, req.ConsentType, req.ConsentTextVersion, ip, ua), ct);
        return result.IsSuccess
            ? Results.Created($"/loans/applications/{id}/consents/{result.Value.ConsentId}", result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> SubmitApplication(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SubmitApplicationCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> AssignToBank(
        Guid id, AssignToBankRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new AssignToBankCommand(id, req.BankId, req.PackageId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> RecordBankDecision(
        Guid id, RecordBankDecisionCommand cmd, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(cmd with { ApplicationId = id }, ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> RecordDisbursement(
        Guid id, RecordDisbursementCommand cmd, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(cmd with { ApplicationId = id }, ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> CloseApplication(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CloseApplicationCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GeneratePackage(
        Guid id, GeneratePackageRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GeneratePackageCommand(id, req.OrgName), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GetPackageDownloadUrl(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetPackageDownloadUrlQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    private static async Task<IResult> GetBankCommunicationLog(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetBankCommunicationLogQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    private static async Task<IResult> CheckEligibility(
        CheckEligibilityRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CheckEligibilityCommand(req.OrgId, req.LoanProductId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GetEligibilityResult(
        Guid orgId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetEligibilityResultQuery(orgId, null), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GetPartnerBanks(
        bool includeInactive, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetPartnerBanksQuery(includeInactive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> CreatePartnerBank(
        CreatePartnerBankCommand command, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(command, ct);
        return result.IsSuccess
            ? Results.Created($"/loans/partner-banks/{result.Value.BankId}", result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> UpdatePartnerBank(
        Guid id, UpdatePartnerBankRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdatePartnerBankCommand(id, req.Name, req.LogoUrl, req.ContactEmail, req.ApiConfigJson, req.IsActive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> HandleDisbursementWebhook(
        Guid bankId,
        HttpContext http,
        DisbursementWebhookHandler webhookHandler,
        CancellationToken ct)
    {
        // Read raw body for HMAC signature verification
        http.Request.EnableBuffering();
        using var ms = new MemoryStream();
        await http.Request.Body.CopyToAsync(ms, ct);
        var rawBody = ms.ToArray();

        var idempotencyKey = http.Request.Headers["X-Idempotency-Key"].FirstOrDefault() ?? string.Empty;
        var signature = http.Request.Headers["X-Signature"].FirstOrDefault() ?? string.Empty;

        if (string.IsNullOrEmpty(idempotencyKey))
            return Results.BadRequest("X-Idempotency-Key header is required.");

        var processingResult = await webhookHandler.ProcessAsync(bankId, idempotencyKey, signature, rawBody, ct);

        return processingResult.Status switch
        {
            WebhookProcessingStatus.Accepted => Results.Ok(new { status = "accepted" }),
            WebhookProcessingStatus.AlreadyProcessed => Results.Ok(new { status = "already_processed" }),
            WebhookProcessingStatus.Rejected => Results.Problem(
                processingResult.Reason ?? "Rejected", statusCode: StatusCodes.Status400BadRequest),
            _ => Results.Problem("Unknown webhook status.", statusCode: 500)
        };
    }

    /// <summary>P6-HANDOFF-25 / SEC-050: Returns versioned consent text catalog.</summary>
    private static async Task<IResult> GetConsentCatalog(
        string? locale, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetConsentCatalogQuery(locale), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static int MapError(SnapAccount.Shared.Domain.Error error)
        => error.Type switch
        {
            SnapAccount.Shared.Domain.ErrorType.NotFound => 404,
            SnapAccount.Shared.Domain.ErrorType.Validation => 422,
            SnapAccount.Shared.Domain.ErrorType.Conflict => 409,
            SnapAccount.Shared.Domain.ErrorType.Forbidden => 403,
            SnapAccount.Shared.Domain.ErrorType.Unauthorized => 401,
            _ => 500
        };
}

// ── Request/param types ──────────────────────────────────────────────────────

/// <summary>Query parameters for listing applications.</summary>
internal record ListParams(string? Status = null, int Page = 1, int PageSize = 20);

/// <summary>Request body for updating a loan application.</summary>
internal record UpdateApplicationRequest(decimal? RequestedAmount, int? TenureMonths, string? Purpose);

/// <summary>Request body for attaching a document.</summary>
internal record AttachDocumentRequest(Guid DocumentId, LoanService.Domain.Entities.ApplicationDocumentType DocumentType);

/// <summary>Request body for recording consent.</summary>
internal record RecordConsentRequest(
    LoanService.Domain.Entities.ConsentType ConsentType,
    string ConsentTextVersion);

/// <summary>Request body for assigning to bank.</summary>
internal record AssignToBankRequest(Guid BankId, Guid PackageId);

/// <summary>Request body for generating a PDF package.</summary>
internal record GeneratePackageRequest(string OrgName);

/// <summary>Request body for eligibility check.</summary>
internal record CheckEligibilityRequest(Guid OrgId, Guid? LoanProductId = null);

/// <summary>Request body for updating a partner bank.</summary>
internal record UpdatePartnerBankRequest(
    string? Name = null,
    string? LogoUrl = null,
    string? ContactEmail = null,
    string? ApiConfigJson = null,
    bool? IsActive = null);
