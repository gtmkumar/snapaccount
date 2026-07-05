using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Filings.Commands.MarkFiled;

/// <summary>Marks a filing as submitted to the IT department with an acknowledgement number.</summary>
[RequiresPermission("itr.filings.file")]
public record MarkFiledCommand(Guid FilingId, string AcknowledgementNumber) : ICommand;

public sealed class MarkFiledCommandValidator : AbstractValidator<MarkFiledCommand>
{
    public MarkFiledCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.AcknowledgementNumber).NotEmpty().MaximumLength(100);
    }
}

public sealed class MarkFiledCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser) : ICommandHandler<MarkFiledCommand>
{
    public async Task<Result> Handle(MarkFiledCommand request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null) return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found."));

        var result = filing.MarkFiled(request.AcknowledgementNumber);
        if (result.IsFailure) return result;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
