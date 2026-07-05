using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.MarkEVerified;

/// <summary>
/// Marks a filing as e-verified (MVP: manual acknowledgment or EVC code).
/// P6-HANDOFF-20: ITR-V upload sets itr_v_object_key, not the signed URL.
/// </summary>
[RequiresPermission("itr.filings.verify")]
public record MarkEVerifiedCommand(Guid FilingId, string VerificationMethod, string? ItrVObjectKey = null) : ICommand;

public sealed class MarkEVerifiedCommandValidator : AbstractValidator<MarkEVerifiedCommand>
{
    private static readonly string[] ValidMethods = ["ITR_V_UPLOAD", "EVC", "AADHAAR_OTP", "BANK_ATM"];

    public MarkEVerifiedCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.VerificationMethod)
            .Must(m => ValidMethods.Contains(m))
            .WithMessage($"VerificationMethod must be one of: {string.Join(", ", ValidMethods)}.");
    }
}

public sealed class MarkEVerifiedCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser) : ICommandHandler<MarkEVerifiedCommand>
{
    public async Task<Result> Handle(MarkEVerifiedCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null) return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // P6-HANDOFF-20: store object key, not signed URL
        if (request.ItrVObjectKey is not null)
            filing.SetItrVObjectKey(request.ItrVObjectKey);

        var result = filing.MarkEVerified(request.VerificationMethod);
        if (result.IsFailure) return result;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
