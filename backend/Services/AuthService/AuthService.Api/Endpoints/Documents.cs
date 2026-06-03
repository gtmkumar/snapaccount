using AuthService.Application.Documents.Commands.ConfirmDocumentOtp;
using AuthService.Application.Documents.Commands.SaveDocument;
using AuthService.Application.Documents.Commands.SendDocumentOtp;
using AuthService.Application.Documents.Queries.ListDocuments;
using AuthService.Application.Organizations.Queries.GetVerificationPolicy;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Tax/identity document endpoints (PAN, AADHAAR, GSTIN, TAN).
/// All endpoints require authorization (the user must be logged in).
/// Behaviour branches on the user's org <c>GovernmentVerificationEnabled</c> flag.
///
/// Rate limit: standard 100 req/min per user.
/// </summary>
public sealed class Documents : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/me/organization/verification-policy
        group.MapGet("/me/organization/verification-policy", GetVerificationPolicy)
            .RequireAuthorization()
            .WithSummary("Returns the governmentVerificationEnabled flag for the current user's org. " +
                         "Mobile clients call this to determine whether to show the OTP flow.");

        // GET /auth/me/documents
        group.MapGet("/me/documents", ListDocuments)
            .RequireAuthorization()
            .WithSummary("List the current user's saved document records (one per kind).");

        // POST /auth/me/documents/{kind}
        group.MapPost("/me/documents/{kind}", SaveDocument)
            .RequireAuthorization()
            .WithSummary("Save or update a document record. " +
                         "Status=SAVED when gov-verification is OFF; PENDING when ON.");

        // POST /auth/me/documents/{kind}/verify/otp/send
        group.MapPost("/me/documents/{kind}/verify/otp/send", SendOtp)
            .RequireAuthorization()
            .WithSummary("Dispatch an OTP for the given document kind. " +
                         "Upserts the record to PENDING. Only meaningful when gov-verification is ON.");

        // POST /auth/me/documents/{kind}/verify/otp/confirm
        group.MapPost("/me/documents/{kind}/verify/otp/confirm", ConfirmOtp)
            .RequireAuthorization()
            .WithSummary("Confirm the OTP. On success sets status=VERIFIED. " +
                         "On failure leaves status=PENDING (retry allowed — not hard-blocked).");
    }

    // GET /auth/me/organization/verification-policy
    private static async Task<IResult> GetVerificationPolicy(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetVerificationPolicyQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // GET /auth/me/documents
    private static async Task<IResult> ListDocuments(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListDocumentsQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/me/documents/{kind}
    private static async Task<IResult> SaveDocument(
        string kind, DocSaveRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SaveDocumentCommand(kind, req.Number, req.HolderName), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/me/documents/{kind}/verify/otp/send
    private static async Task<IResult> SendOtp(
        string kind, DocOtpSendRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SendDocumentOtpCommand(kind, req.Number), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/me/documents/{kind}/verify/otp/confirm
    private static async Task<IResult> ConfirmOtp(
        string kind, DocOtpConfirmRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new ConfirmDocumentOtpCommand(kind, req.TransactionId, req.Otp), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static IResult MapError(Error error) =>
        error.Type switch
        {
            ErrorType.NotFound   => Results.NotFound(new { error = error.Message, code = error.Code }),
            ErrorType.Forbidden  => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
            ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
            _                    => Results.BadRequest(new { error = error.Message, code = error.Code })
        };
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

/// <summary>Body for POST /auth/me/documents/{kind}.</summary>
internal record DocSaveRequest(string Number, string? HolderName = null);

/// <summary>Body for POST /auth/me/documents/{kind}/verify/otp/send.</summary>
internal record DocOtpSendRequest(string Number);

/// <summary>Body for POST /auth/me/documents/{kind}/verify/otp/confirm.</summary>
internal record DocOtpConfirmRequest(string TransactionId, string Otp);
