using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// AuthenticationHandler that defers to <see cref="FirebaseAuthMiddleware"/>.
///
/// The middleware sets <c>HttpContext.User</c> directly from the Firebase JWT
/// before the authorization pipeline runs, so by the time this handler is
/// invoked the principal is already populated. We simply echo it back so
/// <c>RequireAuthorization()</c> succeeds when the middleware has authenticated
/// the request, and fails (NoResult) otherwise.
///
/// Without this handler, ASP.NET Core throws InvalidOperationException at
/// request time because <c>AddAuthorization()</c> requires at least one
/// registered <c>IAuthenticationService</c> scheme.
/// </summary>
public sealed class PassthroughAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public PassthroughAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var principal = Context.User;
        if (principal?.Identity?.IsAuthenticated == true)
        {
            var ticket = new AuthenticationTicket(principal, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }

        return Task.FromResult(AuthenticateResult.NoResult());
    }
}
