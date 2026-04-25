using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Queries.GetUserPermissions;

/// <summary>Returns the list of permission codes held by the authenticated user.</summary>
public record GetUserPermissionsQuery : IQuery<IReadOnlyList<string>>;

/// <summary>
/// Returns the effective permission codes for the current user by expanding their roles.
/// The <see cref="IAuthDbContext"/> direct-query path would be used here in Phase 2
/// when roles are fully persisted; for now the claims from the Firebase JWT are returned.
/// </summary>
public sealed class GetUserPermissionsQueryHandler(ICurrentUser currentUser)
    : IQueryHandler<GetUserPermissionsQuery, IReadOnlyList<string>>
{
    /// <inheritdoc />
    public Task<Result<IReadOnlyList<string>>> Handle(
        GetUserPermissionsQuery request,
        CancellationToken cancellationToken)
    {
        // Returns role names as permissions. Phase 2 will expand roles → permission codes
        // via IAuthDbContext direct projection against auth.role_permissions.
        IReadOnlyList<string> permissions = currentUser.Roles.ToList();
        return Task.FromResult(Result<IReadOnlyList<string>>.Success(permissions));
    }
}
