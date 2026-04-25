using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.CaApprove;

/// <summary>CA approves a filing under review.</summary>
[RequiresPermission("itr.filings.ca_review")]
public record CaApproveCommand(Guid FilingId, Guid CaUserId) : ICommand;

public sealed class CaApproveCommandValidator : AbstractValidator<CaApproveCommand>
{
    public CaApproveCommandValidator() { RuleFor(x => x.FilingId).NotEmpty(); RuleFor(x => x.CaUserId).NotEmpty(); }
}

public sealed class CaApproveCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser) : ICommandHandler<CaApproveCommand>
{
    public async Task<Result> Handle(CaApproveCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null) return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // SEC-039: CA must belong to the same org as the filing's assessee — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        var result = filing.ApproveByCa(request.CaUserId);
        if (result.IsFailure) return result;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
