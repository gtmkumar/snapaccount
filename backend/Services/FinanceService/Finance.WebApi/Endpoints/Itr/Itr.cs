using ItrService.Application.Assessees.Commands.UpdateProfile;
using ItrService.Application.Assessees.Queries.GetProfile;
using ItrService.Application.Dashboard.Queries.GetActivity;
using ItrService.Application.Dashboard.Queries.GetDashboardStats;
using ItrService.Application.Dashboard.Queries.GetWorkloadByUser;
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
using ItrService.Application.Filings.Queries.SuggestItrForm;
using ItrService.Application.Filings.Commands.SubmitForCaReview;
using ItrService.Application.Filings.Commands.UpdateFilingDraft;
using ItrService.Application.Filings.Queries.GetComputationVersions;
using ItrService.Application.Filings.Queries.GetFiling;
using ItrService.Application.Filings.Queries.GetFilingKpi;
using ItrService.Application.Filings.Queries.ListFilings;
using ItrService.Application.Form16.Commands.UploadForm16;
using ItrService.Application.Notices.Commands.RespondToNotice;
using ItrService.Application.Notices.Commands.UploadNotice;
using ItrService.Application.Notices.Queries.ListNotices;
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

        // WEB-FIX: assesseeId is now truly optional — omitting it switches to org-wide listing mode
        // (all filings in the caller's org), supporting status + assessmentYear filters.
        // This fixes the admin ITR page sending GET /itr/filings?status=UNDER_CA_REVIEW&assessmentYear=AY2026-27
        // without an assesseeId (which previously returned 400).
        group.MapGet("/filings", async (
            Guid? assesseeId, string? status, string? assessmentYear, IMediator mediator, CancellationToken ct,
            int page = 1, int pageSize = 20) =>
        {
            var result = await mediator.Send(new ListFilingsQuery(assesseeId, status, page, pageSize, assessmentYear), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("ListFilings")
        .WithSummary("List filings")
        .WithDescription("Returns paginated ITR filings. When assesseeId is provided, returns filings for that assessee (org-scoped). When omitted, returns all filings across the caller's org (admin mode, requires admin.itr.read permission). Supports status and assessmentYear filter params.")
        .RequireAuthorization()
        .WithTags("Filings");

        // GET /itr/filings/kpi — must be declared BEFORE /filings/{id:guid} so "kpi" literal wins.
        // Response shape: { awaitingReview, slaBreached, avgTimeToReviewDays, totalFilingsAy }
        group.MapGet("/filings/kpi", async (
            string? assessmentYear, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetFilingKpiQuery(assessmentYear), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetItrFilingKpi")
        .WithSummary("Org-scoped ITR filing KPI counts for the admin ITR page KpiStrip.")
        .WithDescription("Returns { awaitingReview, slaBreached, avgTimeToReviewDays, totalFilingsAy }. Supports optional assessmentYear filter (e.g. AY2026-27). Requires admin.itr.read permission.")
        .RequireAuthorization()
        .WithTags("Filings");

        // GET /itr/filings/suggest-form — must be declared BEFORE /filings/{id:guid}.
        // DG-ITR-10: derives the recommended ITR form from income heads + assessee type.
        // Optionally validates a caller-supplied form (callerSuppliedForm query param).
        group.MapGet("/filings/suggest-form", async (
            string assesseeType,
            string assessmentYear,
            decimal salaryIncome,
            decimal housePropertyIncome,
            decimal businessIncome,
            decimal capitalGains,
            decimal otherIncome,
            IMediator mediator,
            CancellationToken ct,
            bool hasMultipleHouseProperties = false,
            bool isPresumptiveTaxation = false,
            bool hasForeignAssets = false,
            decimal? annualTurnoverCr = null,
            string? callerSuppliedForm = null) =>
        {
            var query = new SuggestItrFormQuery(
                assesseeType, salaryIncome, housePropertyIncome, businessIncome,
                capitalGains, otherIncome, assessmentYear,
                hasMultipleHouseProperties, isPresumptiveTaxation, hasForeignAssets,
                annualTurnoverCr, callerSuppliedForm);
            var result = await mediator.Send(query, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("SuggestItrForm")
        .WithSummary("Suggest ITR form from income profile (DG-ITR-10)")
        .WithDescription(
            "Derives the recommended ITR form (ITR-1..4) from the assessee's income heads and assessee type, " +
            "per Indian Income Tax rules. Rules are config-driven and versioned by assessment year. " +
            "When callerSuppliedForm is provided, also validates eligibility. " +
            "Returns { suggestedForm, isOutsideAutoScope, reasons, validation? }.")
        .RequireAuthorization()
        .WithTags("Filings");

        group.MapPost("/filings", async (StartFilingRequest req, IMediator mediator, CancellationToken ct) =>
        {
            // DG-ITR-10: ItrFormType is optional — omit it to let the server auto-derive the form.
            var command = new StartFilingCommand(
                req.AssesseeId, req.AssessmentYear, req.ItrFormType, req.Regime,
                req.SalaryIncome, req.HousePropertyIncome, req.BusinessIncome,
                req.CapitalGains, req.OtherIncome,
                req.HasMultipleHouseProperties, req.IsPresumptiveTaxation,
                req.HasForeignAssets, req.AnnualTurnoverCr);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess
                ? Results.Created($"/itr/filings/{result.Value.FilingId}", result.Value)
                : MapError(result.Error);
        })
        .WithName("StartFiling")
        .WithSummary("Start a new ITR filing")
        .WithDescription(
            "Creates a filing in DRAFT status. Idempotent per (assesseeId, assessmentYear). " +
            "DG-ITR-10: itrFormType is optional — omit to auto-derive from income heads. " +
            "When provided, validates eligibility against IT rules; ineligible forms return 400. " +
            "Response includes resolvedItrFormType and formWarnings for sub-optimal choices.")
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

        // DG-ITR-07: GET /itr/filings/{id}/computation-versions — versioned computation history.
        // Admin CA panel Col 3 (ItrFilingDetailPage) queries this to show version history,
        // diff viewer, and Restore action. Returns newest-first.
        group.MapGet("/filings/{id:guid}/computation-versions", async (
            Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetComputationVersionsQuery(id), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetComputationVersions")
        .WithSummary("Get computation version history for a filing")
        .WithDescription("Returns all versioned tax-computation snapshots for the filing, ordered newest-first. Each entry contains the exact input and result JSON used, matching the admin ComputationVersionSchema. DG-ITR-07.")
        .RequireAuthorization()
        .WithTags("Tax Computation");

        // DG-ITR-02: PATCH /itr/filings/{id} — draft autosave + CA notes
        // Admin CA tax-computation panel calls this every 30s and on explicit Save Draft.
        // Persists income-head inputs + ca_notes without changing status.
        group.MapPatch("/filings/{id:guid}", async (Guid id, UpdateFilingDraftRequest req, IMediator mediator, CancellationToken ct) =>
        {
            var command = new UpdateFilingDraftCommand(
                id,
                req.SalaryIncome,
                req.HousePropertyIncome,
                req.BusinessIncome,
                req.CapitalGains,
                req.OtherIncome,
                req.CaNotes);
            var result = await mediator.Send(command, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("UpdateFilingDraft")
        .WithSummary("Autosave filing draft inputs and CA notes")
        .WithDescription("Persists income-head values and CA notes without changing status. Called every 30s by the admin CA panel autosave. Allowed in DRAFT, CA_REJECTED, or UNDER_CA_REVIEW state. Returns updated FilingDetailDto. DG-ITR-02.")
        .RequireAuthorization()
        .WithTags("Filings");

        // ── Tax Computation ───────────────────────────────────────────────────

        group.MapPost("/filings/{id:guid}/compute", async (
            Guid id, ComputeTaxRequest req, IMediator mediator, CancellationToken ct) =>
        {
            // DG-ITR-09: pass NewRegimeDeductionClaims through to the engine.
            var command = new ComputeTaxCommand(
                id, req.SalaryIncome, req.HousePropertyIncome, req.BusinessIncome,
                req.CapitalGains, req.OtherIncome, req.Section80C, req.Section80D,
                req.Section80E, req.OtherDeductions, req.AdvanceTaxPaid, req.TdsPaid,
                NewRegimeDeductionClaims: req.NewRegimeDeductionClaims);
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
            // DG-ITR-09: pass NewRegimeDeductionClaims so the comparison's new-regime branch
            // applies the same catalog-driven deductions as the direct compute endpoint.
            var command = new CompareRegimesCommand(
                id, req.SalaryIncome, req.HousePropertyIncome, req.BusinessIncome,
                req.CapitalGains, req.OtherIncome, req.Section80C, req.Section80D,
                req.Section80E, req.OtherDeductions, req.AdvanceTaxPaid, req.TdsPaid,
                NewRegimeDeductionClaims: req.NewRegimeDeductionClaims);
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

        group.MapGet("/notices", async (
            Guid? assesseeId, Guid? filingId, string? status, string? assessmentYear,
            IMediator mediator, CancellationToken ct,
            int page = 1, int pageSize = 20) =>
        {
            var result = await mediator.Send(
                new ListNoticesQuery(assesseeId, filingId, status, assessmentYear, page, pageSize), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
        .WithName("ListItrNotices")
        .WithSummary("List ITR notices for admin Notice Tracker")
        .WithDescription("Org-scoped paginated list. Supports assessmentYear (e.g. AY2026-27), status, assesseeId, filingId filters.")
        .RequireAuthorization()
        .WithTags("Notices");

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
        // Output-cached: slab config is global, seeded by migration (no runtime writer),
        // and changes ~annually — the TTL alone is the regeneration schedule.
        .CacheOutput(OutputCachingExtensions.MasterDataPolicyPrefix + "itr-config")
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
        // Output-cached: same profile as /tax-slabs — global, seeded, ~annual changes.
        .CacheOutput(OutputCachingExtensions.MasterDataPolicyPrefix + "itr-config")
        .WithTags("Tax Configuration");

        // ── Doc Checklist (P6-HANDOFF-23) ─────────────────────────────────────

        group.MapGet("/doc-checklist", async (
            Guid? assesseeId, Guid? filingId, IMediator mediator, CancellationToken ct) =>
        {
            // SWEEP-B FIX: required query params made nullable → return 400, not 500 binding error.
            if (!assesseeId.HasValue || !filingId.HasValue)
                return Results.BadRequest(new { error = "assesseeId and filingId query parameters are required.", code = "ITR.MissingQueryParams" });
            var result = await mediator.Send(new GetDocChecklistQuery(assesseeId.Value, filingId.Value), ct);
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
            Guid? filingId, IMediator mediator, CancellationToken ct) =>
        {
            // SWEEP-B FIX: filingId is a required query param — made nullable to return 400 not 500.
            if (!filingId.HasValue)
                return Results.BadRequest(new { error = "filingId query parameter is required.", code = "ITR.MissingFilingId" });
            var result = await mediator.Send(new ListGrievancesQuery(filingId.Value), ct);
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

        // GET /itr/admin/workload-by-user — per-assignee ITR grievance workload (Team workload grid, Screen 89)
        group.MapGet("/admin/workload-by-user", async (IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetWorkloadByUserQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
        })
        .WithName("GetItrAdminWorkloadByUser")
        .WithSummary("Per-assignee ITR grievance workload — admin team-workload grid.")
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

/// <summary>
/// Request body for POST /itr/filings.
/// DG-ITR-10: <see cref="ItrFormType"/> is now optional — when omitted, the server
/// auto-derives the form from income heads and assessee type per IT rules.
/// Income head fields default to 0 and are used only for form determination.
/// </summary>
public sealed record StartFilingRequest(
    Guid AssesseeId,
    string AssessmentYear,
    string Regime,
    /// <summary>
    /// Optional ITR form override (ITR-1..7).
    /// When null, the server auto-derives using ItrFormResolver.
    /// When provided, validated against income profile; ineligible forms → 400.
    /// </summary>
    string? ItrFormType = null,
    // ── Income heads for auto-determination ──────────────────────────────────
    decimal SalaryIncome = 0,
    decimal HousePropertyIncome = 0,
    decimal BusinessIncome = 0,
    decimal CapitalGains = 0,
    decimal OtherIncome = 0,
    bool HasMultipleHouseProperties = false,
    bool IsPresumptiveTaxation = false,
    bool HasForeignAssets = false,
    decimal? AnnualTurnoverCr = null);

/// <summary>
/// Request body for PATCH /itr/filings/{id} — draft autosave.
/// DG-ITR-02: all fields are optional (partial update). Admin sends { ...inputs, caNotes }.
/// </summary>
public sealed record UpdateFilingDraftRequest(
    decimal? SalaryIncome,
    decimal? HousePropertyIncome,
    decimal? BusinessIncome,
    decimal? CapitalGains,
    decimal? OtherIncome,
    string? CaNotes);

/// <summary>
/// Request body for POST /itr/filings/{id}/compute.
/// DG-ITR-09: NewRegimeDeductionClaims is an optional dictionary of section-code → claimed INR amount
/// for new-regime-eligible deduction sections (e.g. {"80CCD(2)": 50000}).
/// The engine loads allowed sections from the deduction catalog (config-driven per AY) and caps claims.
/// </summary>
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
    decimal TdsPaid,
    Dictionary<string, decimal>? NewRegimeDeductionClaims = null);

/// <summary>
/// Request body for POST /itr/filings/{id}/compare-regimes.
/// DG-ITR-09: NewRegimeDeductionClaims is forwarded to the engine's new-regime branch
/// so the comparison reflects the correct new-regime-eligible deductions.
/// </summary>
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
    decimal TdsPaid,
    Dictionary<string, decimal>? NewRegimeDeductionClaims = null);

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
