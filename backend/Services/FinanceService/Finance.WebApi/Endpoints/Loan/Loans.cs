using LoanService.Application.LoanApplications.Commands.AssignToBank;
using LoanService.Application.LoanApplications.Commands.RunFraudChecks;
using LoanService.Application.LoanApplications.Queries.GetFraudSummary;
using LoanService.Application.LoanApplications.Commands.AttachDocument;
using LoanService.Application.LoanApplications.Commands.CheckEligibility;
using LoanService.Application.LoanApplications.Commands.CloseApplication;
using LoanService.Application.LoanApplications.Commands.GeneratePackage;
using LoanService.Application.LoanApplications.Commands.RecordBankDecision;
using LoanService.Application.Consents.Queries.GetConsentCatalog;
using LoanService.Application.Dashboard.Queries.GetDashboardStats;
using LoanService.Application.Dashboard.Queries.GetLoanKpi;
using LoanService.Application.KeyFacts.Commands.GenerateKfs;
using LoanService.Application.KeyFacts.Queries.GetKfs;
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
using LoanService.Application.LoanProducts.Queries.GetLoanProduct;
using LoanService.Application.LoanProducts.Queries.ListLoanProducts;
using LoanService.Application.PartnerBanks.Commands.CreatePartnerBank;
using LoanService.Application.PartnerBanks.Commands.UpdatePartnerBank;
using LoanService.Application.PartnerBanks.Queries.GetPartnerBanks;
using LoanService.Infrastructure.Webhooks;
using MediatR;
using SnapAccount.Shared.Api;
// DG-LOAN-01: admin loan-operations endpoints
using LoanService.Application.LoanApplications.Commands.BeginReview;
using LoanService.Application.LoanApplications.Commands.ApproveApplication;
using LoanService.Application.LoanApplications.Commands.RejectApplication;
using LoanService.Application.LoanApplications.Commands.RequestDocuments;
using LoanService.Application.LoanApplications.Commands.RevokeConsent;
using LoanService.Application.LoanApplications.Queries.ListConsents;
using LoanService.Application.LoanApplications.Queries.ListStatusLog;
using LoanService.Application.BankCommunications.Queries.ListBankCommunications;
using LoanService.Application.BankCommunications.Queries.GetBankCommKpi;
using LoanService.Application.BankCommunications.Commands.ResendBankMessage;
using LoanService.Application.PartnerBanks.Queries.ListPartnerBanks;
using LoanService.Application.KeyFacts.Commands.AcknowledgeKfs;

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
        // ── Loan Products (public catalog — org-agnostic) ─────────────────────

        /// <summary>
        /// GET /loans/products — Paginated catalog of active loan products.
        /// Mobile: LoanHubScreen calls listLoanProducts({ pageSize: 50 }).
        /// Response: { items: LoanProductDto[], totalCount: int }
        /// Rate limit: standard. No org-scoping — catalog is shared across all orgs.
        /// </summary>
        groupBuilder.MapGet("/products", ListLoanProducts)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListLoanProducts")
            .WithSummary("Paginated catalog of active loan products")
            .WithDescription("Returns all active loan products ordered by name. Org-agnostic — every authenticated user sees the same catalog. Mobile LoanHubScreen queries pageSize=50.");

        /// <summary>
        /// GET /loans/products/{id} — Single active loan product by ID.
        /// Mobile: getLoanProduct(productId) for product detail / pre-fill.
        /// </summary>
        groupBuilder.MapGet("/products/{id:guid}", GetLoanProduct)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanProduct")
            .WithSummary("Get a single active loan product by ID");

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

        // GAP-021: KFS MUST be generated and acknowledged before consent submission.
        /// <summary>POST /loans/applications/{id}/kfs — Generate a Key Facts Statement.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/kfs", GenerateKfs)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GenerateKfs")
            .WithSummary("Generate an RBI-compliant Key Facts Statement for this loan application. Must be acknowledged before consent.")
            .WithDescription(
                "NEW-D10: Optional ?locale=hi|bn|en query param selects the KFS language. " +
                "Resolution chain: caller param → 'en' fallback. " +
                "Validated against supported set: en, hi, bn. " +
                "The generated locale is stored on the KFS row (migration 079).");

        /// <summary>GET /loans/applications/{id}/kfs — Retrieve the most-recent KFS.</summary>
        groupBuilder.MapGet("/applications/{id:guid}/kfs", GetKfs)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetKfs")
            .WithSummary("Retrieve the current Key Facts Statement for this loan application.")
            .WithDescription(
                "NEW-D10: Optional ?locale=hi query param prefers a locale variant. " +
                "Falls back to any locale (typically 'en') if the requested locale is not found. " +
                "Never fails because of locale — RBI KFS retrieval is statutory. " +
                "Optional ?kfsId=<guid> pins to a specific KFS row (audit path). " +
                "DG-LOAN-05: Response includes verified, signatureLast8, nominalInterestRate, " +
                "totalFees, netDisbursalAmount, totalAmountPayable, coolingOffTerms, grievanceOfficerJson.");

        /// <summary>
        /// POST /loans/applications/{id}/kfs/{kfsId}/acknowledge — Record KFS read-receipt.
        /// DG-LOAN-05: Borrower must call this BEFORE submitting consents (RBI informed-consent chain).
        /// The returned acknowledgementId must be forwarded to LoanConsentScreen and included in consent submissions.
        /// Body: { kfsVersion?: int, deviceId?: string }
        /// Response: { acknowledgementId: Guid, acknowledgedAt: DateTime }
        /// Permission: loan.application.consent.
        /// Rate limit: standard.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/kfs/{kfsId:guid}/acknowledge", AcknowledgeKfs)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("AcknowledgeKfs")
            .WithSummary("Record that the borrower has read and understood the KFS (RBI read-receipt, DG-LOAN-05)")
            .WithDescription(
                "Standalone KFS acknowledgement step — call BEFORE submitting consents. " +
                "Idempotent: returns existing acknowledgement if the KFS was already acknowledged. " +
                "The acknowledgementId is echoed so the mobile client can pass it to LoanConsentScreen.");

        /// <summary>POST /loans/applications/{id}/consents — Record a consent.</summary>
        groupBuilder.MapPost("/applications/{id:guid}/consents", RecordConsent)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RecordConsent");

        // ── GAP-110: Fraud pre-submission stage ───────────────────────────────

        /// <summary>
        /// POST /loans/applications/{id}/fraud-check — Run fraud pre-submission checks.
        /// Must be called before submit. FLAG verdicts allow submission with operator note.
        /// FAIL verdicts return 422 and block submission.
        /// Permission: loan.application.submit (same as submit).
        /// Rate limit: standard.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/fraud-check", RunFraudChecks)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RunLoanFraudChecks")
            .WithSummary("Run fraud pre-submission checks (GAP-110)")
            .WithDescription(
                "Executes 6 fraud checks: duplicate PAN/phone/device across orgs (aggregate counts only, " +
                "never leaks other-org PII), velocity rules (config-driven thresholds), and penny-drop name match. " +
                "FLAG: submission allowed + operator review note. " +
                "FAIL: 422 — submission blocked. " +
                "All results persisted to loan.fraud_checks.");

        /// <summary>
        /// GET /loans/applications/{id}/fraud-summary — Retrieve fraud check results.
        /// Permission: loan.fraud.view (operator tier).
        /// </summary>
        groupBuilder.MapGet("/applications/{id:guid}/fraud-summary", GetFraudSummary)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanFraudSummary")
            .WithSummary("Retrieve fraud check decision log for an application (operator tier, GAP-110)");

        // ── DG-LOAN-01: Admin loan-operations actions ─────────────────────────────

        /// <summary>
        /// POST /loans/applications/{id}/begin-review — Transition SUBMITTED → UNDER_REVIEW.
        /// Admin: called when an officer starts reviewing a submitted application.
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/begin-review", BeginReview)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("BeginLoanReview")
            .WithSummary("Transition loan application from SUBMITTED to UNDER_REVIEW (admin, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/applications/{id}/approve — Approve application (UNDER_REVIEW → APPROVED).
        /// Body: { bankReferenceNo: string }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/approve", ApproveApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ApproveLoanApplication")
            .WithSummary("Approve a loan application (admin, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/applications/{id}/reject — Reject application.
        /// Body: { reason: string }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/reject", RejectApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RejectLoanApplication")
            .WithSummary("Reject a loan application (admin, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/applications/{id}/request-documents — Move to DOCS_REQUESTED.
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/request-documents", RequestDocuments)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RequestLoanDocuments")
            .WithSummary("Request additional documents from applicant (admin, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/applications/{id}/disburse — Admin-initiated disbursement record.
        /// Body: { disbursedAmount: decimal, bankReferenceNo: string }
        /// Alias for /disbursement that matches loanApi.ts:recordDisbursement signature.
        /// Permission: loan.disbursement.record.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/disburse", DisburseApplication)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("DisburseApplication")
            .WithSummary("Record loan disbursement (admin alias for /disbursement, DG-LOAN-01)");

        /// <summary>
        /// GET /loans/applications/{id}/consents — List consents for an application.
        /// Response: { items: ConsentRecordDto[] }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapGet("/applications/{id:guid}/consents", ListConsents)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListLoanConsents")
            .WithSummary("List consent records for a loan application (admin, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/applications/{id}/consents/{consentId}/revoke — Revoke a consent.
        /// DG-LOAN-04 / DPDP Act 2023 s.6: data principal right to withdraw consent.
        /// Body: { reason?: string }
        /// Response: { consentId, consentType, revokedAt, reason }
        /// Idempotent: returns existing revocation details if already revoked.
        /// A revoked DATA_SHARE_WITH_BANK or DISBURSEMENT_MANDATE consent blocks bank
        /// data-sharing and disbursement (enforced in downstream handlers).
        /// Permission: loan.application.consent.
        /// Rate limit: standard.
        /// </summary>
        groupBuilder.MapPost("/applications/{id:guid}/consents/{consentId:guid}/revoke", RevokeConsent)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("RevokeLoanConsent")
            .WithSummary("Revoke a loan consent per DPDP Act 2023 s.6 (DG-LOAN-04)")
            .WithDescription(
                "DPDP compliant: revocation is append-only — the original signed record is never deleted. " +
                "A revoked DATA_SHARE_WITH_BANK or DISBURSEMENT_MANDATE consent blocks further bank data-sharing and disbursement.");

        /// <summary>
        /// GET /loans/applications/{id}/status-log — Status transition timeline.
        /// Response: { items: StatusLogEntryDto[] }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapGet("/applications/{id:guid}/status-log", ListStatusLog)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListLoanStatusLog")
            .WithSummary("Status transition timeline for a loan application (admin, DG-LOAN-01)");

        // ── DG-LOAN-01: Org-wide bank communications ──────────────────────────

        /// <summary>
        /// GET /loans/bank-communications — Org-wide bank communication log.
        /// Query params: bankId?, channel?, status?, direction?, from?, to?, search?, applicationId?, page?, pageSize?
        /// Response: { items, totalCount }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapGet("/bank-communications", ListBankCommunications)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListBankCommunications")
            .WithSummary("Org-wide bank communication log (admin, DG-LOAN-01)");

        /// <summary>
        /// GET /loans/bank-communications/kpi — KPI metrics for bank comms dashboard.
        /// Response: { sentToday, pending, failed, avgResponseMinutes?, bounceRate? }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapGet("/bank-communications/kpi", GetBankCommKpi)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetBankCommKpi")
            .WithSummary("Bank communications KPI for admin dashboard (DG-LOAN-01)");

        /// <summary>
        /// POST /loans/bank-communications/{id}/resend — Re-queue a bank message.
        /// Body: { reason?: string }
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapPost("/bank-communications/{id:guid}/resend", ResendBankMessage)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ResendBankMessage")
            .WithSummary("Re-queue a bank communication message (admin, DG-LOAN-01)");

        // ── DG-LOAN-01: /loans/banks alias for partner banks ─────────────────

        /// <summary>
        /// GET /loans/banks — Paginated partner banks list.
        /// Response: { items: PartnerBankListDto[], totalCount }
        /// Matches admin loanApi.ts:listPartnerBanks → GET /loans/banks.
        /// Permission: loan.bank.decision.
        /// </summary>
        groupBuilder.MapGet("/banks", ListBanks)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListBanks")
            .WithSummary("Paginated partner banks list (admin alias /loans/banks, DG-LOAN-01)");

        /// <summary>
        /// POST /loans/banks — Register a new partner bank.
        /// Alias for POST /partner-banks that matches admin loanApi.ts:registerPartnerBank → POST /loans/banks.
        /// Permission: loan.bank.create.
        /// </summary>
        groupBuilder.MapPost("/banks", CreateBankAlias)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("CreateBankAlias")
            .WithSummary("Register partner bank via /loans/banks alias (admin, DG-LOAN-01)");

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

        // ── KPI Strip ─────────────────────────────────────────────────────────

        /// <summary>
        /// GET /loans/kpi — org-scoped counts for the LoansListPage KpiStrip.
        /// Response: { totalApps, submitted, underReview, awaitingDocs, approved, disbursed }
        /// </summary>
        groupBuilder.MapGet("/kpi", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetLoanKpiQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        })
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetLoanKpi")
            .WithSummary("Org-scoped loan KPI counts for the LoansListPage KpiStrip.");

        // ── Admin Dashboard ───────────────────────────────────────────────────

        groupBuilder.MapGet("/admin/dashboard-stats", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetDashboardStatsQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
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

    /// <summary>
    /// POST /loans/applications/{id}/kfs?locale=hi
    /// NEW-D10: binds optional locale query param (en/hi/bn). Validated by GenerateKfsCommandValidator.
    /// </summary>
    private static async Task<IResult> GenerateKfs(
        Guid id, ISender sender, CancellationToken ct, string? locale = null)
    {
        var result = await sender.Send(new GenerateKfsCommand(id, locale), ct);
        return result.IsSuccess
            ? Results.Created($"/loans/applications/{id}/kfs/{result.Value.KfsId}", result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>
    /// GET /loans/applications/{id}/kfs?kfsId=&amp;locale=hi
    /// NEW-D10: binds optional locale query param. Falls back to en if locale variant not found.
    /// Never fails solely because of locale — RBI KFS is statutory.
    /// </summary>
    private static async Task<IResult> GetKfs(
        Guid id, ISender sender, CancellationToken ct, Guid? kfsId = null, string? locale = null)
    {
        var result = await sender.Send(new GetKfsQuery(id, kfsId, locale), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

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
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
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
        // DG-LOAN-06: thread DeviceId and SharedWithBankIds through to the command.
        // DeviceId defaults to null (backward-compatible); clients SHOULD supply it.
        var result = await sender.Send(
            new RecordConsentCommand(
                id, req.ConsentType, req.ConsentTextVersion, ip, ua, req.KfsId,
                req.ConsentLocale, req.DeviceId, req.SharedWithBankIds), ct);
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
        ISender sender, CancellationToken ct, Guid? orgId = null)
    {
        // SWEEP-B FIX: orgId is a required query param — made nullable to return 400 not 500 on missing param.
        if (!orgId.HasValue)
            return Results.BadRequest(new { error = "orgId query parameter is required.", code = "LOAN.MissingOrgId" });
        var result = await sender.Send(new GetEligibilityResultQuery(orgId.Value, null), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GetPartnerBanks(
        ISender sender, CancellationToken ct, bool includeInactive = false)
    {
        var result = await sender.Send(new GetPartnerBanksQuery(includeInactive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
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

        // DG-LOAN-02: header is X-Bank-Signature (not X-Signature) per contract
        var bankSignature = http.Request.Headers["X-Bank-Signature"].FirstOrDefault() ?? string.Empty;

        if (string.IsNullOrEmpty(idempotencyKey))
            return Results.BadRequest(new { error = "X-Idempotency-Key header is required." });

        if (string.IsNullOrEmpty(bankSignature))
            return Results.BadRequest(new { error = "X-Bank-Signature header is required." });

        var processingResult = await webhookHandler.ProcessAsync(bankId, idempotencyKey, bankSignature, rawBody, ct);

        // DG-LOAN-02: map handler result to HTTP status codes per documented contract
        return processingResult.Status switch
        {
            WebhookProcessingStatus.Accepted        => Results.Ok(new { status = "accepted" }),
            WebhookProcessingStatus.NotFound        => Results.NotFound(new { error = processingResult.Reason }),
            WebhookProcessingStatus.SignatureMismatch => Results.Json(
                new { error = processingResult.Reason },
                statusCode: StatusCodes.Status401Unauthorized),
            WebhookProcessingStatus.DuplicateKey    => Results.Conflict(
                new { code = "DUPLICATE_EVENT", key = processingResult.ConflictKey }),
            WebhookProcessingStatus.BadRequest      => Results.BadRequest(new { error = processingResult.Reason }),
            _                                       => Results.Problem("Unknown webhook status.", statusCode: 500)
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

    // ── Loan Product handlers ─────────────────────────────────────────────────

    /// <summary>
    /// GET /loans/products — Returns paginated active loan product catalog.
    /// Mobile LoanHubScreen: listLoanProducts({ pageSize: 50 }).
    /// </summary>
    private static async Task<IResult> ListLoanProducts(
        [AsParameters] ProductListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListLoanProductsQuery(p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>
    /// GET /loans/products/{id} — Returns a single active loan product.
    /// Mobile: getLoanProduct(productId).
    /// </summary>
    private static async Task<IResult> GetLoanProduct(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetLoanProductQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.NotFound(result.Error.Message);
    }

    // ── GAP-110: Fraud check handlers ─────────────────────────────────────────

    private static async Task<IResult> RunFraudChecks(
        Guid id, RunFraudChecksRequest req, ISender sender, CancellationToken ct)
    {
        var command = new RunFraudChecksCommand(
            id,
            req.ApplicantPan,
            req.ApplicantPhone,
            req.DeviceId,
            req.BankAccountNumber,
            req.IfscCode,
            req.DeclaredName);

        var result = await sender.Send(command, ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    private static async Task<IResult> GetFraudSummary(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetFraudSummaryQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    // ── DG-LOAN-01: Admin loan-operations handler delegates ───────────────────

    /// <summary>POST /loans/applications/{id}/begin-review</summary>
    private static async Task<IResult> BeginReview(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new BeginReviewCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>POST /loans/applications/{id}/approve</summary>
    private static async Task<IResult> ApproveApplication(
        Guid id, ApproveApplicationRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ApproveApplicationCommand(id, req.BankReferenceNo), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>POST /loans/applications/{id}/reject</summary>
    private static async Task<IResult> RejectApplication(
        Guid id, RejectApplicationRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RejectApplicationCommand(id, req.Reason), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>POST /loans/applications/{id}/request-documents</summary>
    private static async Task<IResult> RequestDocuments(
        Guid id, RequestDocumentsRequest? req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RequestDocumentsCommand(id, req?.Note), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>
    /// POST /loans/applications/{id}/disburse
    /// Admin alias for /disbursement — body matches loanApi.ts:RecordDisbursementRequest.
    /// </summary>
    private static async Task<IResult> DisburseApplication(
        Guid id, DisburseApplicationRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new RecordDisbursementCommand(id, req.DisbursedAmount, req.BankReferenceNo), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message, statusCode: MapError(result.Error));
    }

    /// <summary>GET /loans/applications/{id}/consents</summary>
    private static async Task<IResult> ListConsents(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListConsentsQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>
    /// POST /loans/applications/{id}/consents/{consentId}/revoke
    /// DG-LOAN-04: DPDP Act 2023 s.6 — revoke a previously recorded consent.
    /// </summary>
    private static async Task<IResult> RevokeConsent(
        Guid id, Guid consentId, RevokeConsentRequest? req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RevokeConsentCommand(id, consentId, req?.Reason), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>
    /// POST /loans/applications/{id}/kfs/{kfsId}/acknowledge
    /// DG-LOAN-05: Records that the borrower has read and understood the KFS
    /// (standalone read-receipt before LoanConsentScreen).
    /// </summary>
    private static async Task<IResult> AcknowledgeKfs(
        Guid id, Guid kfsId, AcknowledgeKfsRequest? req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new AcknowledgeKfsCommand(id, kfsId, req?.DeviceId), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.ToHttpResult();
    }

    /// <summary>GET /loans/applications/{id}/status-log</summary>
    private static async Task<IResult> ListStatusLog(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListStatusLogQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>GET /loans/bank-communications</summary>
    private static async Task<IResult> ListBankCommunications(
        [AsParameters] BankCommListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListBankCommunicationsQuery(
            p.ApplicationId,
            p.BankId,
            p.Direction,
            p.Channel,
            p.Status,
            p.From,
            p.To,
            p.Search,
            p.Page,
            p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>GET /loans/bank-communications/kpi</summary>
    private static async Task<IResult> GetBankCommKpi(
        ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetBankCommKpiQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>POST /loans/bank-communications/{id}/resend</summary>
    private static async Task<IResult> ResendBankMessage(
        Guid id, ResendMessageRequest? req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ResendBankMessageCommand(id, req?.Reason), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>GET /loans/banks — paginated partner banks list</summary>
    private static async Task<IResult> ListBanks(
        [AsParameters] BanksListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListPartnerBanksQuery(p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    /// <summary>POST /loans/banks — register partner bank (alias for /partner-banks)</summary>
    private static async Task<IResult> CreateBankAlias(
        RegisterPartnerBankRequest req, ISender sender, CancellationToken ct)
    {
        if (!Enum.TryParse<LoanService.Domain.Entities.BankAdapterType>(
                req.AdapterType, ignoreCase: true, out var adapterType))
        {
            return Results.BadRequest(new { error = $"Invalid adapterType '{req.AdapterType}'. Expected EMAIL, REST, or OAUTH." });
        }

        var result = await sender.Send(
            new CreatePartnerBankCommand(
                req.Name,
                req.LogoUrl,
                adapterType,
                req.ContactEmail,
                req.ConfigJson,
                null,  // ApiConfigKeyRef — provided via Secret Manager in prod; null in dev
                null), // WebhookSecretRef — TL-gated; not required via this alias endpoint
            ct);

        return result.IsSuccess
            ? Results.Created($"/loans/banks/{result.Value.BankId}", new { bankId = result.Value.BankId })
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

/// <summary>Query parameters for listing loan products.</summary>
internal record ProductListParams(int Page = 1, int PageSize = 20);

/// <summary>Request body for updating a loan application.</summary>
internal record UpdateApplicationRequest(decimal? RequestedAmount, int? TenureMonths, string? Purpose);

/// <summary>Request body for attaching a document.</summary>
internal record AttachDocumentRequest(Guid DocumentId, LoanService.Domain.Entities.ApplicationDocumentType DocumentType);

/// <summary>
/// Request body for recording consent.
/// <para>
/// <c>ConsentLocale</c> — BCP-47 locale tag (e.g. "en", "hi") identifying the language of the
/// consent text that was displayed to the user. Obtained from the <c>locale</c> field returned by
/// GET /loans/consents/catalog. Defaults to "en". Required for DPDP / RBI audit trail (GAP-040).
/// </para>
/// </summary>
/// <summary>
/// Request body for recording consent.
/// GAP-021: <see cref="KfsId"/> is required — the borrower must acknowledge a KFS before consent.
/// </summary>
/// <summary>
/// DG-LOAN-06: Optional device id from the mobile client for F4.2 DPDP audit trail.
/// The backend masks it (first-8...last-4) before persisting.
/// </summary>
internal record RecordConsentRequest(
    LoanService.Domain.Entities.ConsentType ConsentType,
    string ConsentTextVersion,
    Guid KfsId,
    string ConsentLocale = "en",
    string? DeviceId = null,
    Guid[]? SharedWithBankIds = null);

/// <summary>Request body for assigning to bank.</summary>
internal record AssignToBankRequest(Guid BankId, Guid PackageId);

/// <summary>Request body for generating a PDF package.</summary>
internal record GeneratePackageRequest(string OrgName);

/// <summary>Request body for eligibility check.</summary>
internal record CheckEligibilityRequest(Guid OrgId, Guid? LoanProductId = null);

/// <summary>
/// GAP-110: Request body for running fraud pre-submission checks.
/// PAN is validated to format XXXXX9999X (FluentValidation in RunFraudChecksCommandValidator).
/// </summary>
internal record RunFraudChecksRequest(
    string ApplicantPan,
    string? ApplicantPhone = null,
    string? DeviceId = null,
    string? BankAccountNumber = null,
    string? IfscCode = null,
    string? DeclaredName = null);

/// <summary>Request body for updating a partner bank.</summary>
internal record UpdatePartnerBankRequest(
    string? Name = null,
    string? LogoUrl = null,
    string? ContactEmail = null,
    string? ApiConfigJson = null,
    bool? IsActive = null);

// ── DG-LOAN-01: Additional request/param types ────────────────────────────────

/// <summary>Request body for approving a loan application. Matches admin ApproveApplicationRequest.</summary>
internal record ApproveApplicationRequest(string BankReferenceNo);

/// <summary>Request body for rejecting a loan application. Matches admin RejectApplicationRequest.</summary>
internal record RejectApplicationRequest(string Reason);

/// <summary>Request body for requesting documents. Note is optional.</summary>
internal record RequestDocumentsRequest(string? Note = null);

/// <summary>
/// Request body for admin-initiated disbursement.
/// Matches admin RecordDisbursementRequest { disbursedAmount, bankReferenceNo }.
/// </summary>
internal record DisburseApplicationRequest(decimal DisbursedAmount, string BankReferenceNo);

/// <summary>Request body for resending a bank message.</summary>
internal record ResendMessageRequest(string? Reason = null);

/// <summary>Query parameters for listing bank communications.</summary>
internal record BankCommListParams(
    Guid? ApplicationId = null,
    string? BankId = null,
    string? Direction = null,
    string? Channel = null,
    string? Status = null,
    DateTime? From = null,
    DateTime? To = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 20);

/// <summary>Query parameters for listing banks (/loans/banks).</summary>
internal record BanksListParams(int Page = 1, int PageSize = 20);

/// <summary>
/// Request body for registering a partner bank via /loans/banks alias.
/// Matches admin RegisterPartnerBankRequest { name, gstin?, adapterType, configJson?, contactEmail?, logoUrl? }.
/// </summary>
internal record RegisterPartnerBankRequest(
    string Name,
    string AdapterType,
    string? Gstin = null,
    string? ConfigJson = null,
    string? ContactEmail = null,
    string? LogoUrl = null);

/// <summary>
/// DG-LOAN-04: Request body for revoking a consent.
/// DPDP Act 2023 s.6 — data principal may provide an optional reason.
/// </summary>
internal record RevokeConsentRequest(string? Reason = null);

/// <summary>
/// DG-LOAN-05: Request body for KFS acknowledgement.
/// Body is optional; <c>DeviceId</c> is recommended for DPDP audit trail.
/// </summary>
internal record AcknowledgeKfsRequest(
    /// <summary>Optional masked device id for DPDP audit.</summary>
    string? DeviceId = null);
