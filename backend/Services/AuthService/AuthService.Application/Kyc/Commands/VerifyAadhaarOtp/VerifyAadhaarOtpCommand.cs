using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Kyc.Commands.VerifyAadhaarOtp;

/// <summary>Aadhaar OTP verification result.</summary>
/// <param name="Status">Final KYC status: "VERIFIED" or "FAILED".</param>
/// <param name="VerifiedAt">UTC timestamp when VERIFIED, null otherwise.</param>
public record VerifyAadhaarOtpResponse(string Status, DateTime? VerifiedAt);

/// <summary>
/// POST /auth/me/kyc/aadhaar/otp/verify { transactionId, otp } (RequireAuthorization)
/// Verifies the OTP against the transaction id from the send step.
/// Updates the kyc_verification record status to VERIFIED or FAILED.
/// </summary>
/// <param name="TransactionId">The transaction id from POST /aadhaar/otp/send.</param>
/// <param name="Otp">The OTP received (6 digits for mock).</param>
public record VerifyAadhaarOtpCommand(string TransactionId, string Otp) : ICommand<VerifyAadhaarOtpResponse>;

public sealed class VerifyAadhaarOtpCommandValidator : AbstractValidator<VerifyAadhaarOtpCommand>
{
    public VerifyAadhaarOtpCommandValidator()
    {
        RuleFor(x => x.TransactionId).NotEmpty().WithMessage("Transaction ID is required.");
        RuleFor(x => x.Otp).NotEmpty().WithMessage("OTP is required.");
    }
}

public sealed class VerifyAadhaarOtpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IKycProvider kycProvider)
    : ICommandHandler<VerifyAadhaarOtpCommand, VerifyAadhaarOtpResponse>
{
    public async Task<Result<VerifyAadhaarOtpResponse>> Handle(
        VerifyAadhaarOtpCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Find the PENDING Aadhaar verification for this user + transaction
        var record = await db.KycVerifications
            .FirstOrDefaultAsync(
                k => k.UserId == userId
                     && k.Kind == KycKind.Aadhaar
                     && k.ProviderRef == request.TransactionId
                     && k.Status == KycStatus.Pending
                     && k.DeletedAt == null,
                cancellationToken);

        if (record is null)
            return Error.NotFound("Kyc.TransactionNotFound",
                "No pending Aadhaar verification found for this transaction ID.");

        // Call KYC provider to verify the OTP
        var kycResult = await kycProvider.VerifyAadhaarOtpAsync(
            request.TransactionId, request.Otp, cancellationToken);

        var verifiedAt = kycResult.Status == KycStatus.Verified ? DateTime.UtcNow : (DateTime?)null;

        record.Status = kycResult.Status;
        record.VerifiedAt = verifiedAt;

        await db.SaveChangesAsync(cancellationToken);

        return new VerifyAadhaarOtpResponse(kycResult.Status, verifiedAt);
    }
}
