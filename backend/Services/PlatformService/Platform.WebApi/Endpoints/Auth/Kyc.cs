using AuthService.Application.Kyc.Commands.SendAadhaarOtp;
using AuthService.Application.Kyc.Commands.VerifyAadhaarOtp;
using AuthService.Application.Kyc.Commands.VerifyGstin;
using AuthService.Application.Kyc.Commands.VerifyPan;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// KYC (Know Your Customer) endpoints — PAN and Aadhaar verification.
/// All endpoints require authorization (the user must be logged in).
/// Provider is controlled by the <c>KYC_PROVIDER</c> env var (default: "mock").
/// </summary>
public sealed class Kyc : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // POST /auth/me/kyc/pan/verify { pan, name }
        groupBuilder.MapPost("/me/kyc/pan/verify", VerifyPan).RequireAuthorization();

        // POST /auth/me/kyc/aadhaar/otp/send { aadhaar }
        groupBuilder.MapPost("/me/kyc/aadhaar/otp/send", SendAadhaarOtp).RequireAuthorization();

        // POST /auth/me/kyc/aadhaar/otp/verify { transactionId, otp }
        groupBuilder.MapPost("/me/kyc/aadhaar/otp/verify", VerifyAadhaarOtp).RequireAuthorization();

        // DG-AUTH-04: POST /auth/gstin/verify { gstin }
        // Verifies GSTIN format + active status via KYC provider and returns business-profile fields
        // (legalName, tradeName, principalPlaceOfBusiness) for onboarding auto-fill.
        // Provider controlled by KYC_PROVIDER env var (default: "mock").
        groupBuilder.MapPost("/gstin/verify", VerifyGstin)
            .RequireAuthorization()
            .RequireRateLimiting("otp")
            .WithName("VerifyGstin")
            .WithSummary("Verify GSTIN and retrieve business-profile fields for onboarding auto-fill (DG-AUTH-04).")
            .WithDescription(
                "Validates the 15-character GSTIN format, calls the KYC provider (mock or Sandbox/Quicko), " +
                "persists a kyc_verification record, and returns legalName / tradeName / principalPlaceOfBusiness " +
                "for use in BusinessProfileWizardScreen step 2 auto-fill. " +
                "Returns 400 on format error, 200 with status=FAILED when the GSTIN is inactive.");
    }

    // POST /auth/me/kyc/pan/verify [Authorize]
    private static async Task<IResult> VerifyPan(KycVerifyPanRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new VerifyPanCommand(req.Pan, req.Name), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // POST /auth/me/kyc/aadhaar/otp/send [Authorize]
    private static async Task<IResult> SendAadhaarOtp(KycSendAadhaarOtpRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SendAadhaarOtpCommand(req.Aadhaar), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // POST /auth/me/kyc/aadhaar/otp/verify [Authorize]
    private static async Task<IResult> VerifyAadhaarOtp(KycVerifyAadhaarOtpRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new VerifyAadhaarOtpCommand(req.TransactionId, req.Otp), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    // DG-AUTH-04: POST /auth/gstin/verify [Authorize]
    private static async Task<IResult> VerifyGstin(KycVerifyGstinRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new VerifyGstinCommand(req.Gstin), ct);
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : MapError(result.Error);
    }

    private static IResult MapError(Error error) =>
        error.Type switch
        {
            ErrorType.NotFound => Results.NotFound(new { error = error.Message, code = error.Code }),
            ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
            _ => Results.BadRequest(new { error = error.Message, code = error.Code })
        };
}

// ── Request DTOs ─────────────────────────────────────────────────────────────
internal record KycVerifyPanRequest(string Pan, string? Name = null);
internal record KycSendAadhaarOtpRequest(string Aadhaar);
internal record KycVerifyAadhaarOtpRequest(string TransactionId, string Otp);

/// <summary>
/// DG-AUTH-04: POST /auth/gstin/verify request body.
/// </summary>
/// <param name="Gstin">15-character GSTIN to verify (e.g. 22AAAAA0000A1Z5).</param>
internal record KycVerifyGstinRequest(string Gstin);
