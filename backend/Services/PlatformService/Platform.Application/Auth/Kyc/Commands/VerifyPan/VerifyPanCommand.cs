using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Domain.ValueObjects;

namespace AuthService.Application.Kyc.Commands.VerifyPan;

/// <summary>KYC PAN verification result returned to the caller.</summary>
/// <param name="Status">Verification status: "VERIFIED" or "FAILED".</param>
/// <param name="VerifiedAt">UTC timestamp when VERIFIED, null otherwise.</param>
public record VerifyPanResponse(string Status, DateTime? VerifiedAt);

/// <summary>
/// POST /auth/me/kyc/pan/verify { pan, name } (RequireAuthorization)
/// Validates PAN format (XXXXX9999X), calls the KYC provider (mock by default),
/// and persists a kyc_verification record of kind=PAN.
/// </summary>
/// <param name="Pan">PAN number in format XXXXX9999X.</param>
/// <param name="Name">Name as on the PAN card (optional for mock provider).</param>
public record VerifyPanCommand(string Pan, string? Name) : ICommand<VerifyPanResponse>;

public sealed class VerifyPanCommandValidator : AbstractValidator<VerifyPanCommand>
{
    public VerifyPanCommandValidator()
    {
        RuleFor(x => x.Pan)
            .NotEmpty()
            .MaximumLength(10)
            .Must(pan => PanNumber.Create(pan ?? string.Empty).IsSuccess)
            .WithMessage("PAN must be in format XXXXX9999X (5 uppercase letters, 4 digits, 1 uppercase letter).");
    }
}

public sealed class VerifyPanCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser,
    IKycProvider kycProvider)
    : ICommandHandler<VerifyPanCommand, VerifyPanResponse>
{
    public async Task<Result<VerifyPanResponse>> Handle(
        VerifyPanCommand request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        // Create/validate the PAN value object (double-check after validator)
        var panResult = PanNumber.Create(request.Pan);
        if (panResult.IsFailure)
            return panResult.Error;

        var pan = panResult.Value.Value;

        // Call KYC provider
        var kycResult = await kycProvider.VerifyPanAsync(pan, request.Name, cancellationToken);

        var verifiedAt = kycResult.Status == KycStatus.Verified ? DateTime.UtcNow : (DateTime?)null;

        // Persist verification record
        var record = new KycVerification
        {
            UserId = userId,
            Kind = KycKind.Pan,
            ReferenceNumber = pan,
            Status = kycResult.Status,
            Provider = "mock",
            ProviderRef = kycResult.ProviderRef,
            VerifiedAt = verifiedAt
        };
        db.KycVerifications.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        return new VerifyPanResponse(kycResult.Status, verifiedAt);
    }
}
