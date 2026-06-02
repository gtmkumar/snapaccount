using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Authentication/authorization wiring shared by every microservice.
/// </summary>
public static class AuthServiceCollectionExtensions
{
    /// <summary>The scheme name backing <see cref="PassthroughAuthHandler"/>.</summary>
    public const string PassthroughScheme = "FirebaseMiddleware";

    /// <summary>
    /// Registers the passthrough authentication scheme plus authorization.
    /// <para>
    /// <see cref="FirebaseAuthMiddleware"/> sets <c>HttpContext.User</c> directly, but
    /// <c>RequireAuthorization()</c> still needs a registered <see cref="IAuthenticationService"/>
    /// scheme — otherwise the authorization pipeline throws <see cref="System.InvalidOperationException"/>
    /// ("Unable to find the required 'IAuthenticationService' service") at request time whenever an
    /// unauthenticated request hits a protected endpoint, surfacing as a 500 instead of a clean 401.
    /// </para>
    /// Every service must call this instead of a bare <c>AddAuthorization()</c>.
    /// </summary>
    public static IServiceCollection AddSnapAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(PassthroughScheme)
            .AddScheme<AuthenticationSchemeOptions, PassthroughAuthHandler>(PassthroughScheme, _ => { });
        services.AddAuthorization();
        return services;
    }
}
