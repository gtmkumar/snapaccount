using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Domain.ValueObjects;

namespace AuthService.Application.Documents.Commands.SendDocumentOtp;

/// <summary>
/// Response after initiating OTP dispatch for a document.
/// </summary>
/// <param name="TransactionId">Opaque transaction id — pass to the confirm endpoint.</param>
public record SendDocumentOtpResponse(string TransactionId);

/// <summary>
/// POST /auth/me/documents/{kind}/verify/otp/send { number } (RequireAuthorization)
///
/// Validates the document number format, upserts a PENDING kyc_verification record,
/// calls the document verification provider to dispatch an OTP, and returns the transaction id.
///
/// Only meaningful when the user's organization has GovernmentVerificationEnabled=true.
/// Callers SHOULD check /auth/me/organization/verification-policy first.
/// </summary>
public record SendDocumentOtpCommand(string Kind, string Number) : ICommand<SendDocumentOtpResponse>;

/// <summary>FluentValidation validator for <see cref="SendDocumentOtpCommand"/>.</summary>
public sealed class SendDocumentOtpCommandValidator : AbstractValidator<SendDocumentOtpCommand>
{
    public SendDocumentOtpCommandValidator()
    {
        RuleFor(x => x.Kind)
            .Must(k => KycKind.Parse(k) is not null)
            .WithMessage("Kind must be one of: pan, aadhaar, gstin, tan.");

        RuleFor(x => x.Number).NotEmpty();

        When(x => KycKind.Parse(x.Kind) is not null, () =>
        {
            RuleFor(x => x)
                .Must(x => ValidateNumberForKind(x.Kind, x.Number))
                .WithMessage(x => FormatErrorMessage(x.Kind));
        });
    }

    private static bool ValidateNumberForKind(string kind, string number) =>
        KycKind.Parse(kind) switch
        {
            KycKind.Pan     => PanNumber.Create(number ?? string.Empty).IsSuccess,
            KycKind.Aadhaar => System.Text.RegularExpressions.Regex.IsMatch(number ?? string.Empty, @"^\d{12}$"),
            KycKind.Gstin   => GstinNumber.Create(number ?? string.Empty).IsSuccess,
            KycKind.Tan     => TanNumber.Create(number ?? string.Empty).IsSuccess,
            _               => false
        };

    private static string FormatErrorMessage(string kind) =>
        KycKind.Parse(kind) switch
        {
            KycKind.Pan     => "PAN must be in format XXXXX9999X.",
            KycKind.Aadhaar => "Aadhaar must be exactly 12 digits.",
            KycKind.Gstin   => "GSTIN must be a valid 15-character GST identification number.",
            KycKind.Tan     => "TAN must be in format AAAA99999A.",
            _               => "Invalid document number format."
        };
}

/// <summary>Handles <see cref="SendDocumentOtpCommand"/>.</summary>
public sealed class SendDocumentOtpCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IDocumentVerificationProvider verificationProvider)
    : ICommandHandler<SendDocumentOtpCommand, SendDocumentOtpResponse>
{
    /// <inheritdoc />
    public async Task<Result<SendDocumentOtpResponse>> Handle(
        SendDocumentOtpCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var kind   = KycKind.Parse(request.Kind)!;

        // Derive the stored reference number (mask Aadhaar; normalise others)
        var storedRef = kind == KycKind.Aadhaar
            ? $"XXXX-XXXX-{request.Number[^4..]}"
            : request.Number.Trim().ToUpperInvariant();

        // Call provider to dispatch OTP (mock logs it + returns transaction id)
        var otpResult = await verificationProvider.SendOtpAsync(kind, request.Number, cancellationToken);

        // Upsert: soft-delete existing record, insert PENDING with new transactionId
        var existing = await db.KycVerifications
            .FirstOrDefaultAsync(
                k => k.UserId == userId && k.Kind == kind && k.DeletedAt == null,
                cancellationToken);

        if (existing is not null)
        {
            existing.DeletedAt = DateTime.UtcNow;
        }

        var record = new KycVerification
        {
            UserId          = userId,
            Kind            = kind,
            ReferenceNumber = storedRef,
            Status          = KycStatus.Pending,
            Provider        = "mock",
            ProviderRef     = otpResult.TransactionId
        };
        db.KycVerifications.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        return new SendDocumentOtpResponse(otpResult.TransactionId);
    }
}
