using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Documents.Commands.ConfirmDocumentOtp;

/// <summary>
/// Result of an OTP confirmation attempt.
/// </summary>
/// <param name="Kind">Document kind.</param>
/// <param name="Status">
/// "VERIFIED" on success.
/// "PENDING" when the OTP was wrong or mistyped — the document remains retryable
/// (product decision: wrong OTP = user error, not a hard failure).
/// "FAILED" is reserved exclusively for genuine provider rejections of the document
/// number itself (e.g. PAN/GSTIN does not exist in government records).
/// </param>
/// <param name="VerifiedAt">UTC timestamp when status = VERIFIED; null otherwise.</param>
/// <param name="OtpAccepted">True when the OTP matched; false on mismatch (status stays PENDING).</param>
public record ConfirmDocumentOtpResponse(
    string Kind,
    string Status,
    DateTime? VerifiedAt,
    bool OtpAccepted);

/// <summary>
/// POST /auth/me/documents/{kind}/verify/otp/confirm { transactionId, otp } (RequireAuthorization)
///
/// Verifies the OTP against the transaction id from the send step.
/// On success: updates the kyc_verification record to VERIFIED + sets verified_at.
/// On failure: leaves the record at PENDING (product decision — retry is allowed).
/// Returns a clear result indicating whether the OTP was accepted.
/// </summary>
public record ConfirmDocumentOtpCommand(
    string Kind,
    string TransactionId,
    string Otp) : ICommand<ConfirmDocumentOtpResponse>;

/// <summary>FluentValidation validator for <see cref="ConfirmDocumentOtpCommand"/>.</summary>
public sealed class ConfirmDocumentOtpCommandValidator : AbstractValidator<ConfirmDocumentOtpCommand>
{
    public ConfirmDocumentOtpCommandValidator()
    {
        RuleFor(x => x.Kind)
            .Must(k => KycKind.Parse(k) is not null)
            .WithMessage("Kind must be one of: pan, aadhaar, gstin, tan.");
        RuleFor(x => x.TransactionId).NotEmpty().WithMessage("transactionId is required.");
        RuleFor(x => x.Otp).NotEmpty().WithMessage("otp is required.");
    }
}

/// <summary>Handles <see cref="ConfirmDocumentOtpCommand"/>.</summary>
public sealed class ConfirmDocumentOtpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IDocumentVerificationProvider verificationProvider)
    : ICommandHandler<ConfirmDocumentOtpCommand, ConfirmDocumentOtpResponse>
{
    /// <inheritdoc />
    public async Task<Result<ConfirmDocumentOtpResponse>> Handle(
        ConfirmDocumentOtpCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var kind   = KycKind.Parse(request.Kind)!;

        // Find the PENDING record for this user + kind + transactionId
        var record = await db.KycVerifications
            .FirstOrDefaultAsync(
                k => k.UserId == userId
                     && k.Kind == kind
                     && k.ProviderRef == request.TransactionId
                     && k.Status == KycStatus.Pending
                     && k.DeletedAt == null,
                cancellationToken);

        if (record is null)
            return Error.NotFound("Document.TransactionNotFound",
                "No pending document verification found for this transaction ID and kind.");

        // Call provider to verify OTP
        var verifyResult = await verificationProvider.VerifyOtpAsync(
            kind, request.TransactionId, request.Otp, cancellationToken);

        var otpAccepted = verifyResult.Status == KycStatus.Verified;

        if (otpAccepted)
        {
            // Happy path: move to VERIFIED and stamp the timestamp.
            var verifiedAt = DateTime.UtcNow;
            record.Status     = KycStatus.Verified;
            record.VerifiedAt = verifiedAt;
            await db.SaveChangesAsync(cancellationToken);
            return new ConfirmDocumentOtpResponse(kind, KycStatus.Verified, verifiedAt, true);
        }

        // Wrong OTP (user error): leave the record PENDING so the user can retry.
        // Do NOT set status = FAILED and do NOT persist any change — the transaction
        // remains valid and the next confirm attempt (or a fresh send) will work.
        // FAILED is reserved for genuine provider rejection of the document number itself.
        return new ConfirmDocumentOtpResponse(kind, KycStatus.Pending, null, false);
    }
}
