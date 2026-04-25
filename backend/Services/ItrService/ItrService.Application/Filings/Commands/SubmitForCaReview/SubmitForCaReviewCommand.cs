using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.SubmitForCaReview;

/// <summary>Submits a filing for CA review. Requires computation to be pinned.</summary>
[RequiresPermission("itr.filings.submit")]
public record SubmitForCaReviewCommand(Guid FilingId) : ICommand;

public sealed class SubmitForCaReviewCommandValidator : AbstractValidator<SubmitForCaReviewCommand>
{
    public SubmitForCaReviewCommandValidator() { RuleFor(x => x.FilingId).NotEmpty(); }
}

public sealed class SubmitForCaReviewCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<SubmitForCaReviewCommand>
{
    public async Task<Result> Handle(SubmitForCaReviewCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null) return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        var result = filing.SubmitForCaReview();
        if (result.IsFailure) return result;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
