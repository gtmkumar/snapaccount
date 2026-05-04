using ItrService.Application.Assessees.Commands.UpdateProfile;
using ItrService.Application.Assessees.Queries.GetProfile;
using ItrService.Application.Dashboard.Queries.GetActivity;
using ItrService.Application.Dashboard.Queries.GetDashboardStats;
using ItrService.Application.DocChecklist.Queries.GetDocChecklist;
using ItrService.Application.Grievances.Commands.CreateGrievance;
using ItrService.Application.Grievances.Queries.ListGrievances;
using ItrService.Application.Filings.Commands.CaApprove;
using ItrService.Application.Filings.Commands.CaReject;
using ItrService.Application.Filings.Commands.CompareRegimes;
using ItrService.Application.Filings.Commands.ComputeTax;
using ItrService.Application.Filings.Commands.MarkEVerified;
using ItrService.Application.Filings.Commands.MarkFiled;
using ItrService.Application.Filings.Commands.StartFiling;
using ItrService.Application.Filings.Commands.SubmitForCaReview;
using ItrService.Application.Filings.Queries.GetFiling;
using ItrService.Application.Filings.Queries.ListFilings;
using ItrService.Application.Form16.Commands.UploadForm16;
using ItrService.Application.Notices.Commands.RespondToNotice;
using ItrService.Application.Notices.Commands.UploadNotice;
using ItrService.Application.Refunds.Queries.GetRefundStatus;
using ItrService.Application.TaxSlabs.Queries.GetDeductionCatalog;
using ItrService.Application.TaxSlabs.Queries.GetTaxSlabs;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace ItrService.Api.Endpoints;

/// <summary>
/// All ITR service endpoints — assessee profile, filings, tax computation, notices, refunds.
/// Phase 6D endpoints.
/// </summary>
public sealed class Itr : EndpointGroupBase
{
    /// <inheritdoc/>
    public override string? GroupName => "/itr";

    /// <inheritdoc/>
    public override void Map(RouteGroupBuilder group)
    {
        // ── Assessee Profile ──────────────────────────────────────────────────

        group.MapGet("/profile/{userId}", async (string userId, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetProfileQuery(userId), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetAssesseeProfile")
        .WithSummary("Get assessee profile")
        .WithDescription("Returns the assessee profile. PAN shown as last-4 only.")
        .RequireAuthorization()
        .WithTags("Profile");

        group.MapPut("/profile", async (UpdateProfileRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new UpdateProfileCommand(
                req.UserId, req.PanCipher, req.PanLast4, req.FullName, req.AssesseeType,
                req.OrganizationId, req.Email, req.Phone, req.DateOfBirth, req.Address, req.AnnualTurnoverCr);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("UpdateAssesseeProfile")
        .WithSummary("Create or update assessee profile")
        .WithDescription("PAN cipher must be AES-256-CBC ciphertext from IPanEncryptionService (P6-HANDOFF-19). PAN cannot be changed once set.")
        .RequireAuthorization()
        .WithTags("Profile");

        // ── Filings ───────────────────────────────────────────────────────────

        group.MapGet("/filings", async (
            Guid assesseeId, string? status, int page, int pageSize,
            IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new ListFilingsQuery(assesseeId, status, page, pageSize), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("ListFilings")
        .WithSummary("List filings")
        .WithDescription("Returns paginated ITR filings for an assessee.")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings", async (StartFilingRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new StartFilingCommand(req.AssesseeId, req.AssessmentYear, req.ItrFormType, req.Regime);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess
                ? Results.Created($"/itr/filings/{result.Value.FilingId}", result.Value)
                : MapError(result.Error);
        })
        .WithName("StartFiling")
        .WithSummary("Start a new ITR filing")
        .WithDescription("Creates a filing in DRAFT status. Idempotent per (assesseeId, assessmentYear).")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapGet("/filings/{id:guid}", async (Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetFilingQuery(id), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetFiling")
        .WithSummary("Get filing detail")
        .WithDescription("Returns filing detail. ITR-V URI not returned here (P6-HANDOFF-20).")
        .RequireAuthorization()
        .WithTags("Filings");

        // ── Tax Computation ───────────────────────────────────────────────────

        group.MapPost("/filings/{id:guid}/compute", async (
            Guid id, ComputeTaxRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new ComputeTaxCommand(
                id, req.SalaryIncome, req.HousePropertyIncome, req.BusinessIncome,
                req.CapitalGains, req.OtherIncome, req.Section80C, req.Section80D,
                req.Section80E, req.OtherDeductions, req.AdvanceTaxPaid, req.TdsPaid);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("ComputeTax")
        .WithSummary("Compute income tax")
        .WithDescription("Runs the tax engine and pins computation on the filing (P6-HANDOFF-18). Latency: ~200ms. Rate limit: 20 req/min.")
        .RequireAuthorization()
        .RequireRateLimiting("ai")
        .WithTags("Tax Computation");

        group.MapPost("/filings/{id:guid}/compare-regimes", async (
            Guid id, CompareRegimesRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new CompareRegimesCommand(
                id, req.SalaryIncome, req.HousePropertyIncome, req.BusinessIncome,
                req.CapitalGains, req.OtherIncome, req.Section80C, req.Section80D,
                req.Section80E, req.OtherDeductions, req.AdvanceTaxPaid, req.TdsPaid);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("CompareRegimes")
        .WithSummary("Compare OLD vs NEW tax regime")
        .WithDescription("Runs tax engine twice and returns side-by-side comparison with recommendation. Rate limit: 20 req/min.")
        .RequireAuthorization()
        .RequireRateLimiting("ai")
        .WithTags("Tax Computation");

        // ── Filing State Machine ──────────────────────────────────────────────

        group.MapPost("/filings/{id:guid}/submit", async (Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new SubmitForCaReviewCommand(id), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("SubmitForCaReview")
        .WithSummary("Submit filing for CA review")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings/{id:guid}/ca-approve", async (
            Guid id, CaApproveRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new CaApproveCommand(id, req.CaUserId), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("CaApprove")
        .WithSummary("CA approves the filing")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings/{id:guid}/ca-reject", async (
            Guid id, CaRejectRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new CaRejectCommand(id, req.CaUserId, req.Reason), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("CaReject")
        .WithSummary("CA rejects the filing")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings/{id:guid}/mark-filed", async (
            Guid id, MarkFiledRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new MarkFiledCommand(id, req.AcknowledgementNumber), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("MarkFiled")
        .WithSummary("Mark filing as filed with IT department")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings/{id:guid}/e-verify", async (
            Guid id, EVerifyRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new MarkEVerifiedCommand(id, req.VerificationMethod, req.ItrVObjectKey), ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("MarkEVerified")
        .WithSummary("E-verify a filed return")
        .WithDescription("Methods: ITR_V_UPLOAD, EVC, AADHAAR_OTP, BANK_ATM.")
        .RequireAuthorization()
        .WithTags("Filings");

        // ── Form 16 ───────────────────────────────────────────────────────────

        group.MapPost("/filings/{id:guid}/form16", async (
            Guid id, UploadForm16Request req, IMediator mediator, CancellationToken ct) =>
        {
            // SEC-041: pass plaintext PAN; handler encrypts server-side and derives last-4.
            var command = new UploadForm16Command(id, req.AssesseeId, req.GcsUri, req.EmployeePan);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess
                ? Results.Created($"/itr/filings/{id}/form16", result.Value)
                : MapError(result.Error);
        })
        .WithName("UploadForm16")
        .WithSummary("Upload Form 16")
        .WithDescription("Submit GCS object key of uploaded Form 16 PDF for OCR extraction. Rate limit: 20 req/min.")
        .RequireAuthorization()
        .RequireRateLimiting("ai")
        .WithTags("Form 16");

        // ── Notices ───────────────────────────────────────────────────────────

        group.MapPost("/filings/{id:guid}/notices", async (
            Guid id, UploadNoticeRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new UploadNoticeCommand(id, req.AssesseeId, req.NoticeNumber,
                req.NoticeType, req.IssuedDate, req.DueDate, req.Subject, req.AttachmentsJson);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess
                ? Results.Created($"/itr/filings/{id}/notices/{result.Value.NoticeId}", result.Value)
                : MapError(result.Error);
        })
        .WithName("UploadItrNotice")
        .WithSummary("Upload ITR notice")
        .RequireAuthorization()
        .WithTags("Notices");

        group.MapPost("/notices/{noticeId:guid}/respond", async (
            Guid noticeId, RespondToNoticeRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new RespondToNoticeCommand(noticeId, req.RespondedByUserId,
                req.ResponseText, req.ResponseAttachmentsJson);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
        })
        .WithName("RespondToItrNotice")
        .WithSummary("Respond to ITR notice")
        .RequireAuthorization()
        .WithTags("Notices");

        // ── Refund Status ─────────────────────────────────────────────────────

        group.MapGet("/filings/{id:guid}/refund", async (Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetRefundStatusQuery(id), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetRefundStatus")
        .WithSummary("Get refund status")
        .WithDescription("Returns latest refund status from the polling log.")
        .RequireAuthorization()
        .WithTags("Refunds");

        // ── Tax Slabs & Deductions ─────────────────────────────────────────────

        group.MapGet("/tax-slabs", async (
            string assessmentYear, string regime, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetTaxSlabsQuery(assessmentYear, regime), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetTaxSlabs")
        .WithSummary("Get tax slabs for assessment year + regime")
        .WithDescription("Returns versioned slab config. AY format: AY2025-26. Regime: OLD or NEW.")
        .RequireAuthorization()
        .WithTags("Tax Configuration");

        group.MapGet("/deduction-catalog", async (
            string assessmentYear, string regime, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetDeductionCatalogQuery(assessmentYear, regime), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetDeductionCatalog")
        .WithSummary("Get deduction section catalog")
        .WithDescription("Returns all deduction sections (80C, 80D, etc.) with limits and regime availability.")
        .RequireAuthorization()
        .WithTags("Tax Configuration");

        // ── Doc Checklist (P6-HANDOFF-23) ─────────────────────────────────────

        group.MapGet("/doc-checklist", async (
            Guid assesseeId, Guid filingId, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetDocChecklistQuery(assesseeId, filingId), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetDocChecklist")
        .WithSummary("Per-filing document checklist")
        .WithDescription("Returns the document checklist for a filing, with per-item provided state. Drives mobile 'Documents needed' UI.")
        .RequireAuthorization()
        .WithTags("Doc Checklist");

        // ── Grievances (P6-HANDOFF-23) ────────────────────────────────────────

        group.MapPost("/grievances", async (
            CreateGrievanceRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new CreateGrievanceCommand(req.FilingId, req.Subject, req.Body, req.Category);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess
                ? Results.Created($"/itr/grievances/{result.Value.GrievanceId}", result.Value)
                : MapError(result.Error);
        })
        .WithName("CreateGrievance")
        .WithSummary("Raise a grievance against a filing")
        .RequireAuthorization()
        .RequireRateLimiting("standard")
        .WithTags("Grievances");

        group.MapGet("/grievances", async (
            Guid filingId, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new ListGrievancesQuery(filingId), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("ListGrievances")
        .WithSummary("List grievances for a filing")
        .RequireAuthorization()
        .WithTags("Grievances");

        // ── Admin Dashboard ───────────────────────────────────────────────────

        group.MapGet("/admin/dashboard-stats", async (IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetItrAdminDashboardStats")
        .WithSummary("ITR verifications-pending count for the admin cross-service dashboard.")
        .RequireAuthorization()
        .WithTags("Admin");

        group.MapGet("/admin/activity", async (string? range, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetActivityQuery(range ?? "7D"), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetItrAdminActivity")
        .WithSummary("Daily ITR filing creation counts for the cross-service activity chart.")
        .RequireAuthorization()
        .WithTags("Admin");
    }

    /// <summary>Maps a <see cref="Error"/> to the appropriate HTTP result.</summary>
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

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>Request body for PUT /itr/profile.</summary>
public sealed record UpdateProfileRequest(
    string UserId,
    string PanCipher,
    string PanLast4,
    string FullName,
    string AssesseeType,
    Guid? OrganizationId,
    string? Email,
    string? Phone,
    DateOnly? DateOfBirth,
    string? Address,
    decimal? AnnualTurnoverCr);

/// <summary>Request body for POST /itr/filings.</summary>
public sealed record StartFilingRequest(
    Guid AssesseeId,
    string AssessmentYear,
    string ItrFormType,
    string Regime);

/// <summary>Request body for POST /itr/filings/{id}/compute.</summary>
public sealed record ComputeTaxRequest(
    decimal SalaryIncome,
    decimal HousePropertyIncome,
    decimal BusinessIncome,
    decimal CapitalGains,
    decimal OtherIncome,
    decimal Section80C,
    decimal Section80D,
    decimal Section80E,
    decimal OtherDeductions,
    decimal AdvanceTaxPaid,
    decimal TdsPaid);

/// <summary>Request body for POST /itr/filings/{id}/compare-regimes.</summary>
public sealed record CompareRegimesRequest(
    decimal SalaryIncome,
    decimal HousePropertyIncome,
    decimal BusinessIncome,
    decimal CapitalGains,
    decimal OtherIncome,
    decimal Section80C,
    decimal Section80D,
    decimal Section80E,
    decimal OtherDeductions,
    decimal AdvanceTaxPaid,
    decimal TdsPaid);

/// <summary>Request body for CA approve.</summary>
public sealed record CaApproveRequest(Guid CaUserId);

/// <summary>Request body for CA reject.</summary>
public sealed record CaRejectRequest(Guid CaUserId, string Reason);

/// <summary>Request body for mark-filed.</summary>
public sealed record MarkFiledRequest(string AcknowledgementNumber);

/// <summary>Request body for e-verify.</summary>
public sealed record EVerifyRequest(string VerificationMethod, string? ItrVObjectKey = null);

/// <summary>Request body for upload Form 16. SEC-041: PAN supplied plaintext, encrypted server-side.</summary>
public sealed record UploadForm16Request(
    Guid AssesseeId,
    string GcsUri,
    string EmployeePan);

/// <summary>Request body for POST /itr/grievances (P6-HANDOFF-23).</summary>
public sealed record CreateGrievanceRequest(
    Guid FilingId,
    string Subject,
    string Body,
    string Category);

/// <summary>Request body for upload notice.</summary>
public sealed record UploadNoticeRequest(
    Guid AssesseeId,
    string NoticeNumber,
    string NoticeType,
    DateOnly IssuedDate,
    DateOnly? DueDate,
    string? Subject,
    string? AttachmentsJson);

/// <summary>Request body for respond to notice.</summary>
public sealed record RespondToNoticeRequest(
    Guid RespondedByUserId,
    string? ResponseText,
    string? ResponseAttachmentsJson);
