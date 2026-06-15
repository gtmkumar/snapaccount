using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.FeatureFlags.Queries.GetFeatureFlags;

/// <summary>
/// Returns all non-deleted feature flags as a key→boolean dictionary.
/// SEC-056: backs GET /auth/feature-flags.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformFeatureFlagsRead)]
public record GetFeatureFlagsQuery : IQuery<Dictionary<string, bool>>;

public sealed class GetFeatureFlagsQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetFeatureFlagsQuery, Dictionary<string, bool>>
{
    public async Task<Result<Dictionary<string, bool>>> Handle(
        GetFeatureFlagsQuery request,
        CancellationToken cancellationToken)
    {
        var flags = await db.FeatureFlags
            .Where(f => f.DeletedAt == null)
            .Select(f => new { f.FlagKey, f.IsEnabled })
            .ToListAsync(cancellationToken);

        var dict = flags.ToDictionary(f => f.FlagKey, f => f.IsEnabled);
        return Result<Dictionary<string, bool>>.Success(dict);
    }
}
