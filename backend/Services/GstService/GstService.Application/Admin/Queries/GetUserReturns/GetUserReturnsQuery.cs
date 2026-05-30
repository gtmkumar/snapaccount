using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Admin.Queries.GetUserReturns;

/// <summary>
/// Returns the most-recent N GST returns for a user — admin per-user detail
/// view. The user is mapped to their org via the OwnerUserId on
/// <c>auth.organizations</c>; the GstReturn carries OrganizationId.
/// SUPER_ADMIN only.
/// </summary>
[RequiresPermission("admin.users.read")]
public record GetUserReturnsQuery(Guid OrganizationId, int Limit = 20)
    : IQuery<IReadOnlyList<UserGstReturnDto>>;

public record UserGstReturnDto(
    Guid Id,
    string ReturnType,
    string FinancialYear,
    int? PeriodMonth,
    string Status,
    decimal NetTaxPayable,
    string? ArnNumber,
    DateTime CreatedAt);

public sealed class GetUserReturnsQueryValidator : AbstractValidator<GetUserReturnsQuery>
{
    public GetUserReturnsQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Limit).InclusiveBetween(1, 100);
    }
}

public sealed class GetUserReturnsQueryHandler(IGstDbContext db)
    : IQueryHandler<GetUserReturnsQuery, IReadOnlyList<UserGstReturnDto>>
{
    public async Task<Result<IReadOnlyList<UserGstReturnDto>>> Handle(
        GetUserReturnsQuery request, CancellationToken ct)
    {
        var rows = await db.GstReturns
            .Where(r => r.OrganizationId == request.OrganizationId && r.DeletedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .Take(request.Limit)
            .Select(r => new UserGstReturnDto(
                r.Id, r.ReturnType, r.FinancialYear, r.PeriodMonth,
                r.Status, r.NetTaxPayable, r.ArnNumber, r.CreatedAt))
            .ToListAsync(ct);

        return Result<IReadOnlyList<UserGstReturnDto>>.Success(rows);
    }
}
