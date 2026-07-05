using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Kyc.Commands.SendAadhaarOtp;

/// <summary>Response after initiating Aadhaar OTP send.</summary>
/// <param name="TransactionId">Opaque transaction id — pass to POST /aadhaar/otp/verify.</param>
public record SendAadhaarOtpResponse(string TransactionId);

/// <summary>
/// POST /auth/me/kyc/aadhaar/otp/send { aadhaar } (RequireAuthorization)
/// Validates Aadhaar format (12 digits), stores a PENDING kyc_verification record
/// with the MASKED Aadhaar (XXXX-XXXX-1234), calls mock provider to dispatch OTP.
/// Full Aadhaar is NEVER stored (DPDP Act 2023).
/// </summary>
/// <param name="Aadhaar">12-digit Aadhaar number (digits only, no spaces/hyphens).</param>
public record SendAadhaarOtpCommand(string Aadhaar) : ICommand<SendAadhaarOtpResponse>;

public sealed class SendAadhaarOtpCommandValidator : AbstractValidator<SendAadhaarOtpCommand>
{
    public SendAadhaarOtpCommandValidator()
    {
        RuleFor(x => x.Aadhaar)
            .NotEmpty()
            .Matches(@"^\d{12}$")
            .WithMessage("Aadhaar must be exactly 12 digits.");
    }
}

public sealed class SendAadhaarOtpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IKycProvider kycProvider)
    : ICommandHandler<SendAadhaarOtpCommand, SendAadhaarOtpResponse>
{
    public async Task<Result<SendAadhaarOtpResponse>> Handle(
        SendAadhaarOtpCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Mask Aadhaar — only store last 4 digits (DPDP Act 2023)
        var masked = MaskAadhaar(request.Aadhaar);

        // Call mock provider — logs a dev OTP, returns transaction id
        var otpResult = await kycProvider.SendAadhaarOtpAsync(request.Aadhaar, cancellationToken);

        // Persist PENDING record (masked Aadhaar only)
        var record = new KycVerification
        {
            UserId = userId,
            Kind = KycKind.Aadhaar,
            ReferenceNumber = masked,
            Status = KycStatus.Pending,
            Provider = "mock",
            ProviderRef = otpResult.TransactionId
        };
        db.KycVerifications.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        return new SendAadhaarOtpResponse(otpResult.TransactionId);
    }

    /// <summary>Returns XXXX-XXXX-1234 format — only the last 4 digits are visible.</summary>
    private static string MaskAadhaar(string aadhaar)
    {
        var last4 = aadhaar[^4..];
        return $"XXXX-XXXX-{last4}";
    }
}
