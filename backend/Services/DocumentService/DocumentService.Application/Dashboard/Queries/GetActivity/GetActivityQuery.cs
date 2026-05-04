using DocumentService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Dashboard.Queries.GetActivity;

/// <summary>
/// Daily document-creation counts for the admin dashboard activity chart.
/// "Range" controls the lookback: 7D / 30D / 90D. SYSTEM_ADMIN only.
/// </summary>
[RequiresPermission("admin.dashboard.read")]
public record GetActivityQuery(string Range = "7D") : IQuery<IReadOnlyList<DailyActivityPoint>>;

public record DailyActivityPoint(DateOnly Date, int Count);

public sealed class GetActivityQueryValidator : AbstractValidator<GetActivityQuery>
{
    private static readonly string[] ValidRanges = ["7D", "30D", "90D"];
    public GetActivityQueryValidator()
    {
        RuleFor(x => x.Range).Must(r => ValidRanges.Contains(r))
            .WithMessage($"Range must be one of: {string.Join(", ", ValidRanges)}");
    }
}

public sealed class GetActivityQueryHandler(IDocumentDbContext db)
    : IQueryHandler<GetActivityQuery, IReadOnlyList<DailyActivityPoint>>
{
    public async Task<Result<IReadOnlyList<DailyActivityPoint>>> Handle(GetActivityQuery request, CancellationToken ct)
    {
        var days = request.Range switch { "30D" => 30, "90D" => 90, _ => 7 };
        var since = DateTime.UtcNow.AddDays(-days);

        var rows = await db.Documents
            .Where(d => d.UploadedAt >= since && d.DeletedAt == null)
            .GroupBy(d => DateOnly.FromDateTime(d.UploadedAt))
            .Select(g => new DailyActivityPoint(g.Key, g.Count()))
            .ToListAsync(ct);

        return Result<IReadOnlyList<DailyActivityPoint>>.Success(
            rows.OrderBy(p => p.Date).ToList());
    }
}
