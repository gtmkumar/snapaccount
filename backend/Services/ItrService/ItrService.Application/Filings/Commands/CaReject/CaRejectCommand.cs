using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.CaReject;

/// <summary>CA rejects a filing, returning it to DRAFT with a reason.</summary>
[RequiresPermission("itr.filings.ca_review")]
public record CaRejectCommand(Guid FilingId, Guid CaUserId, string Reason) : ICommand;

public sealed class CaRejectCommandValidator : AbstractValidator<CaRejectCommand>
{
    public CaRejectCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.CaUserId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(2000);
    }
}

public sealed class CaRejectCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser) : ICommandHandler<CaRejectCommand>
{
    public async Task<Result> Handle(CaRejectCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null) return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // SEC-039: CA must belong to the same org as the filing's assessee — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        var result = filing.RejectByCa(request.CaUserId, request.Reason);
        if (result.IsFailure) return result;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
