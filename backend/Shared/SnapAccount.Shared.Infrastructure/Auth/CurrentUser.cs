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
    public IReadOnlyList<string> Roles => ParseStringList(Claims, "roles");

    /// <summary>
    /// Permission names granted to the current user. Populated from the "permissions"
    /// claim (LOCAL_AUTH JWT) or, for Firebase tokens, left empty unless present.
    /// A single "*" entry grants all permissions (dev super-admin).
    /// </summary>
    public IReadOnlyList<string> Permissions => ParseStringList(Claims, "permissions");

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
    public bool HasPermission(string permission)
    {
        var permissions = Permissions;
        if (permissions.Contains("*"))
            return true;
        if (permissions.Any(p => p.Equals(permission, StringComparison.OrdinalIgnoreCase)))
            return true;
        // Back-compat: some tokens carry permission strings directly in the roles claim.
        return Roles.Any(r => r.Equals(permission, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Reads a claim that may be a JSON array, a JSON string, a CLR string collection,
    /// or a comma-separated string, and normalises it to a list of non-empty strings.
    /// Handles both Firebase-decoded claims (JsonElement) and LOCAL_AUTH claims.
    /// </summary>
    private static IReadOnlyList<string> ParseStringList(IReadOnlyDictionary<string, object>? claims, string key)
    {
        if (claims is null || !claims.TryGetValue(key, out var value) || value is null)
            return [];

        switch (value)
        {
            case System.Text.Json.JsonElement { ValueKind: System.Text.Json.JsonValueKind.Array } array:
                return array.EnumerateArray()
                    .Select(e => e.ValueKind == System.Text.Json.JsonValueKind.String ? e.GetString() ?? "" : e.ToString())
                    .Where(s => s.Length > 0)
                    .ToList();
            case System.Text.Json.JsonElement { ValueKind: System.Text.Json.JsonValueKind.String } str:
                return SplitCsv(str.GetString());
            case string s:
                return SplitCsv(s);
            case IEnumerable<string> strings:
                return strings.Where(s => !string.IsNullOrEmpty(s)).ToList();
            case System.Collections.IEnumerable items:
                return items.Cast<object?>().Select(o => o?.ToString() ?? "").Where(s => s.Length > 0).ToList();
            default:
                return [];
        }
    }

    private static IReadOnlyList<string> SplitCsv(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
