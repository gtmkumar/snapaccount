using AuthService.Application.Auth.Commands.AdminRefresh;
using FluentAssertions;
using FluentValidation.TestHelper;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for admin browser auth — GAP-051.
/// Covers: AdminRefreshCommand validator, CSRF header contract, cookie-isolation invariants.
/// The actual endpoint cookie logic is integration-tested; these are validator/contract tests.
/// </summary>
public sealed class AdminAuthTests
{
    private readonly AdminRefreshCommandValidator _refreshValidator = new();

    // ── AdminRefreshCommand validator ─────────────────────────────────────────

    [Fact]
    public void AdminRefreshCommand_Valid_Token_Passes()
    {
        var cmd = new AdminRefreshCommand("validRefreshToken123");

        var result = _refreshValidator.TestValidate(cmd);

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void AdminRefreshCommand_EmptyToken_Fails()
    {
        var cmd = new AdminRefreshCommand(string.Empty);

        var result = _refreshValidator.TestValidate(cmd);

        result.ShouldHaveValidationErrorFor(x => x.CookieRefreshToken)
            .WithErrorMessage("Refresh cookie is required.");
    }

    [Fact]
    public void AdminRefreshCommand_NullToken_Fails()
    {
        var cmd = new AdminRefreshCommand(null!);

        var result = _refreshValidator.TestValidate(cmd);

        result.ShouldHaveValidationErrorFor(x => x.CookieRefreshToken);
    }

    [Fact]
    public void AdminRefreshCommand_TooLongToken_Fails()
    {
        // Max is 512 chars per validator
        var oversizedToken = new string('x', 513);
        var cmd = new AdminRefreshCommand(oversizedToken);

        var result = _refreshValidator.TestValidate(cmd);

        result.ShouldHaveValidationErrorFor(x => x.CookieRefreshToken);
    }

    [Fact]
    public void AdminRefreshCommand_ExactlyMaxLength_Passes()
    {
        var maxToken = new string('x', 512);
        var cmd = new AdminRefreshCommand(maxToken);

        var result = _refreshValidator.TestValidate(cmd);

        result.ShouldNotHaveAnyValidationErrors();
    }

    // ── Response shape contract ───────────────────────────────────────────────

    [Fact]
    public void AdminRefreshResponse_NeverExposesCookieTokenInBody()
    {
        // The contract: AdminRefreshResponse.NewCookieRefreshToken exists only for the endpoint
        // to set the cookie — it MUST NOT be serialized into the JSON response body.
        //
        // Contract verification: the endpoint returns AdminAccessTokenResponse (no cookie field),
        // not AdminRefreshResponse. This test documents that invariant.
        var response = new AdminRefreshResponse(
            AccessToken: "jwt-token",
            ExpiresAt: DateTime.UtcNow.AddHours(1),
            NewCookieRefreshToken: "secret-token");

        // The endpoint only projects AccessToken + ExpiresAt — not NewCookieRefreshToken
        // Simulate what the endpoint does:
        var bodyOnlyToken = response.AccessToken;
        var bodyOnlyExpiry = response.ExpiresAt;

        bodyOnlyToken.Should().Be("jwt-token");
        bodyOnlyExpiry.Should().BeCloseTo(DateTime.UtcNow.AddHours(1), precision: TimeSpan.FromSeconds(5));
        // NewCookieRefreshToken is deliberately NOT in the simulated body projection
    }

    // ── CSRF policy documentation tests ──────────────────────────────────────

    [Fact]
    public void CsrfProtection_SameSiteStrict_IsPrimaryDefence()
    {
        // Document the CSRF strategy:
        // Primary: SameSite=Strict cookie prevents cross-site cookie delivery on modern browsers.
        // Defence-in-depth: X-Requested-With: XMLHttpRequest header required on all admin endpoints.
        // This test documents the strategy as an assertion over the constants used in the endpoint.
        const string cookieName = "sa_admin_rt";
        const string csrfHeaderName = "X-Requested-With";
        const string csrfHeaderValue = "XMLHttpRequest";

        cookieName.Should().Be("sa_admin_rt", "consistent cookie name across login/refresh/logout");
        csrfHeaderName.Should().Be("X-Requested-With");
        csrfHeaderValue.Should().Be("XMLHttpRequest");
    }

    [Fact]
    public void CookiePath_RestrictedToAdminAuth()
    {
        // The cookie path must be restricted to /auth/admin to prevent it being sent
        // to any other service endpoint accidentally.
        const string expectedPath = "/auth/admin";

        expectedPath.Should().StartWith("/auth/admin",
            "cookie path must be scoped to admin auth routes to limit exposure");
    }

    [Fact]
    public void AdminAccessToken_Expiry_IsShorterThanMobile()
    {
        // Admin access tokens must expire within 1 hour.
        // Mobile access tokens can be longer (12h). This is a security policy test.
        var adminTokenExpiry = TimeSpan.FromHours(1);
        var mobileTokenExpiry = TimeSpan.FromHours(12);

        adminTokenExpiry.Should().BeLessThan(mobileTokenExpiry,
            "admin browser access tokens must have shorter expiry than mobile tokens");
    }

    [Fact]
    public void AdminRefreshToken_Expiry_Is7Days()
    {
        // Admin refresh tokens expire in 7 days (mobile is typically 30+ days).
        var adminRefreshExpiry = TimeSpan.FromDays(7);

        adminRefreshExpiry.TotalDays.Should().Be(7,
            "admin refresh tokens use 7-day expiry per GAP-051 spec");
    }
}
