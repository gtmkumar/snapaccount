using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Refunds.Queries.GetRefundStatus;

/// <summary>Returns the latest refund status for a filing.</summary>
public record GetRefundStatusQuery(Guid FilingId) : IQuery<RefundStatusDto>;

public record RefundStatusDto(
    Guid FilingId, string RefundStatus, decimal? RefundAmount,
    DateOnly? RefundDate, string? TransactionReference, string? StatusMessage, DateTime LastPolledAt);

public sealed class GetRefundStatusQueryValidator : AbstractValidator<GetRefundStatusQuery>
{
    public GetRefundStatusQueryValidator() { RuleFor(x => x.FilingId).NotEmpty(); }
}

public sealed class GetRefundStatusQueryHandler(IItrDbContext dbContext) : IQueryHandler<GetRefundStatusQuery, RefundStatusDto>
{
    public async Task<Result<RefundStatusDto>> Handle(GetRefundStatusQuery request, CancellationToken cancellationToken)
    {
        var entry = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.RefundStatusEntries.Where(r => r.FilingId == request.FilingId && r.DeletedAt == null)
                    .OrderByDescending(r => r.LastPolledAt),
                cancellationToken);

        if (entry is null)
            return Error.NotFound("RefundStatus.NotFound", $"No refund status found for filing {request.FilingId}.");

        return new RefundStatusDto(entry.FilingId, entry.RefundStatus, entry.RefundAmount,
            entry.RefundDate, entry.TransactionReference, entry.StatusMessage, entry.LastPolledAt);
    }
}
