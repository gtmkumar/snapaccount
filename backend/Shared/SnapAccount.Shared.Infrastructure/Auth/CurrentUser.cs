using Microsoft.AspNetCore.Http;
using SnapAccount.Shared.Application;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Reads the current user's identity from Firebase JWT claims that were
/// populated by <see cref="FirebaseAuthMiddleware"/> into HttpContext.Items.
/// Registered as a scoped dependency in every microservice's DI container
/// so handlers can resolve <see cref="ICurrentUser"/> without importing
/// per-service assemblies.
/// </summary>
public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private IReadOnlyDictionary<string, object>? Claims =>
        httpContextAccessor.HttpContext?.Items["FirebaseClaims"] as IReadOnlyDictionary<string, object>;

    /// <inheritdoc />
    public Guid UserId
    {
        get
        {
            var claims = Claims;
            if (claims is not null && claims.TryGetValue("userId", out var userId))
                return Guid.Parse(userId.ToString()!);
            return Guid.Empty;
        }
    }

    /// <inheritdoc />
    public Guid? OrganizationId
    {
        get
        {
            var claims = Claims;
            if (claims is not null && claims.TryGetValue("organizationId", out var orgId))
                return Guid.TryParse(orgId?.ToString(), out var parsed) ? parsed : null;
            return null;
        }
    }

    /// <inheritdoc />
    public IReadOnlyList<string> Roles
    {
        get
        {
            var claims = Claims;
            if (claims is not null && claims.TryGetValue("roles", out var roles))
            {
                if (roles is System.Text.Json.JsonElement element)
                    return element.EnumerateArray().Select(r => r.GetString() ?? "").ToList();
            }
            return [];
        }
    }

    /// <inheritdoc />
    public bool IsAuthenticated =>
        httpContextAccessor.HttpContext?.Items.ContainsKey("FirebaseUid") == true;

    /// <inheritdoc />
    public string? FirebaseUid =>
        httpContextAccessor.HttpContext?.Items["FirebaseUid"] as string;

    /// <inheritdoc />
    public string? PhoneNumber
    {
        get
        {
            var claims = Claims;
            if (claims is not null && claims.TryGetValue("phone_number", out var phone))
                return phone?.ToString();
            return null;
        }
    }

    /// <inheritdoc />
    public string? Email
    {
        get
        {
            var claims = Claims;
            if (claims is not null && claims.TryGetValue("email", out var email))
                return email?.ToString();
            return null;
        }
    }

    /// <inheritdoc />
    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.OrdinalIgnoreCase);

    /// <inheritdoc />
    public bool HasPermission(string permission) =>
        Roles.Any(r => r.Equals(permission, StringComparison.OrdinalIgnoreCase));
}
