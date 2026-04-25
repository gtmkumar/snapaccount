using Hangfire.Annotations;
using Hangfire.Dashboard;
using Hangfire.AspNetCore;

namespace AuthService.Api;

/// <summary>
/// Hangfire dashboard authorization filter that restricts access to users with a specific role.
/// SEC-003 fix: prevents unauthenticated/unauthorized access to /hangfire dashboard.
/// </summary>
public sealed class HangfireRoleAuthorizationFilter([NotNull] string requiredRole) : IDashboardAuthorizationFilter
{
    public bool Authorize([NotNull] DashboardContext context)
    {
        // Hangfire 1.x: use OwinContext or GetHttpContext depending on host
        // For ASP.NET Core: access via context.Request/Response wrappers
        // We deny access if the underlying HttpContext is not available or user not authenticated
        if (context is not AspNetCoreDashboardContext aspNetCoreContext)
            return false;

        var httpContext = aspNetCoreContext.HttpContext;

        // Must be authenticated
        if (httpContext.User?.Identity?.IsAuthenticated != true)
            return false;

        // Must have required role
        return httpContext.User.IsInRole(requiredRole);
    }
}
