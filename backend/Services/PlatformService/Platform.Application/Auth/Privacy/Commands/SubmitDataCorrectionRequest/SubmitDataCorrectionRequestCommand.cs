using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Privacy.Commands.SubmitDataCorrectionRequest;

/// <summary>
/// Submits a DPDP Act 2023 data-correction request on behalf of the authenticated user.
///
/// The created request starts in Status = "submitted" and must be reviewed by staff
/// within 30 days (statutory deadline under the DPDP Act unless extended).
/// </summary>
/// <param name="DataCategory">The data field/category to be corrected.</param>
/// <param name="Description">User's description of the inaccuracy and desired correction.</param>
public record SubmitDataCorrectionRequestCommand(
    string DataCategory,
    string Description) : ICommand<SubmitDataCorrectionResult>;

/// <summary>Result returned after submitting the correction request.</summary>
public sealed record SubmitDataCorrectionResult(Guid RequestId, string Status);

/// <summary>FluentValidation validator for <see cref="SubmitDataCorrectionRequestCommand"/>.</summary>
public sealed class SubmitDataCorrectionRequestCommandValidator
    : AbstractValidator<SubmitDataCorrectionRequestCommand>
{
    private static readonly string[] ValidCategories =
    [
        "name", "date_of_birth", "pan_number", "aadhaar_number",
        "email", "phone_number", "address", "gstin", "bank_account", "other"
    ];

    public SubmitDataCorrectionRequestCommandValidator()
    {
        RuleFor(x => x.DataCategory)
            .NotEmpty()
            .MaximumLength(100)
            .Must(c => ValidCategories.Contains(c, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"DataCategory must be one of: {string.Join(", ", ValidCategories)}.");

        RuleFor(x => x.Description)
            .NotEmpty()
            .MaximumLength(2000)
            .WithMessage("Description must be between 1 and 2000 characters.");
    }
}

/// <summary>Persists a new data-correction request for the authenticated user.</summary>
public sealed class SubmitDataCorrectionRequestCommandHandler(
    IAuthDbContext db,
    ICurrentUser currentUser)
    : ICommandHandler<SubmitDataCorrectionRequestCommand, SubmitDataCorrectionResult>
{
    /// <inheritdoc />
    public async Task<Result<SubmitDataCorrectionResult>> Handle(
        SubmitDataCorrectionRequestCommand request,
        CancellationToken cancellationToken)
    {
        var correctionRequest = DataCorrectionRequest.Create(
            currentUser.UserId,
            request.DataCategory,
            request.Description);

        db.DataCorrectionRequests.Add(correctionRequest);
        await db.SaveChangesAsync(cancellationToken);

        return Result<SubmitDataCorrectionResult>.Success(
            new SubmitDataCorrectionResult(correctionRequest.Id, correctionRequest.Status));
    }
}
