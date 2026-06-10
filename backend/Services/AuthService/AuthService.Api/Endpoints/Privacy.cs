using AuthService.Application.Privacy.Commands.EnqueueDataExport;
using AuthService.Application.Privacy.Commands.SubmitDataCorrectionRequest;
using AuthService.Application.Privacy.Commands.WithdrawConsent;
using AuthService.Application.Privacy.Queries.GetDataExportStatus;
using AuthService.Application.Privacy.Queries.GetMyConsents;
using AuthService.Application.Privacy.Queries.ListMyDataCorrectionRequests;
using MediatR;
using Microsoft.AspNetCore.Http;
using SnapAccount.Shared.Api;

namespace AuthService.Api.Endpoints;

/// <summary>
/// DPDP Act 2023 — Privacy rights endpoints under <c>/auth/me</c>.
///
/// Endpoints:
///   GET  /auth/me/consents                    — current consent status per purpose
///   POST /auth/me/consents/{purpose}/withdraw — withdraw a specific purpose
///   GET  /auth/me/data-export                 — data portability export status
///   POST /auth/me/data-export                 — enqueue a new data export
///   POST /auth/me/data-correction             — submit a data-correction request
///   GET  /auth/me/data-correction             — list own correction requests
/// </summary>
public sealed class Privacy : EndpointGroupBase
{
    /// <summary>Route prefix: /auth (endpoints use /me/** paths).</summary>
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Consent ──────────────────────────────────────────────────────────────
        groupBuilder.MapGet("/me/consents", GetMyConsents)
            .RequireAuthorization()
            .WithSummary("Get current consent status per processing purpose.");

        groupBuilder.MapPost("/me/consents/{purpose}/withdraw", WithdrawConsent)
            .RequireAuthorization()
            .WithSummary("Withdraw consent for a specific processing purpose.");

        // ── Data export (portability) ──────────────────────────────────────────
        groupBuilder.MapPost("/me/data-export", EnqueueDataExport)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithSummary("Request a complete data export bundle (DPDP portability).");

        groupBuilder.MapGet("/me/data-export", GetDataExportStatus)
            .RequireAuthorization()
            .WithSummary("Get the status of the most-recent data export request.");

        // ── Data correction ───────────────────────────────────────────────────
        groupBuilder.MapPost("/me/data-correction", SubmitDataCorrectionRequest)
            .RequireAuthorization()
            .WithSummary("Submit a request to correct inaccurate personal data.");

        groupBuilder.MapGet("/me/data-correction", ListMyDataCorrectionRequests)
            .RequireAuthorization()
            .WithSummary("List data-correction requests submitted by the authenticated user.");
    }

    // ── Handlers ─────────────────────────────────────────────────────────────────

    private static async Task<IResult> GetMyConsents(IMediator mediator)
    {
        var result = await mediator.Send(new GetMyConsentsQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> WithdrawConsent(
        string purpose,
        ISender mediator,
        HttpContext httpContext,
        WithdrawConsentRequest body)
    {
        var ip        = httpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = httpContext.Request.Headers["User-Agent"].FirstOrDefault();

        var cmd = new WithdrawConsentCommand(
            purpose,
            body.NoticeVersion,
            ip,
            userAgent,
            body.Locale ?? "en");

        var result = await mediator.Send(cmd);
        return result.IsSuccess ? Results.NoContent() : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> EnqueueDataExport(ISender mediator)
    {
        var result = await mediator.Send(new EnqueueDataExportCommand());
        return result.IsSuccess ? Results.Accepted(null, result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> GetDataExportStatus(ISender mediator, Guid? requestId = null)
    {
        var result = await mediator.Send(new GetDataExportStatusQuery(requestId));
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> SubmitDataCorrectionRequest(
        ISender mediator,
        DataCorrectionRequestBody body)
    {
        var result = await mediator.Send(
            new SubmitDataCorrectionRequestCommand(body.DataCategory, body.Description));

        return result.IsSuccess ? Results.Accepted(null, result.Value) : Results.Problem(result.Error.Message);
    }

    private static async Task<IResult> ListMyDataCorrectionRequests(IMediator mediator)
    {
        var result = await mediator.Send(new ListMyDataCorrectionRequestsQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
    }
}

// ── Request DTOs (endpoint-layer only) ────────────────────────────────────────

/// <summary>Body for POST /auth/me/consents/{purpose}/withdraw.</summary>
public sealed record WithdrawConsentRequest(string NoticeVersion, string? Locale);

/// <summary>Body for POST /auth/me/data-correction.</summary>
public sealed record DataCorrectionRequestBody(string DataCategory, string Description);
