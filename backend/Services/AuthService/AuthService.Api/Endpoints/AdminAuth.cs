using AuthService.Application.Auth.Commands.AdminLogin;
using AuthService.Application.Auth.Commands.AdminRefresh;
using AuthService.Application.Auth.Commands.PasswordAuth;
using AuthService.Application.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// GAP-051: Admin browser authentication — httpOnly cookie refresh flow.
///
/// Endpoints:
///   POST /auth/admin/login   — Authenticate with phone+password; on success sets an httpOnly
///                              refresh cookie (<c>sa_admin_rt</c>) and returns access token.
///   POST /auth/admin/refresh — Reads <c>sa_admin_rt</c> from cookie, rotates it, returns new access token.
///   POST /auth/admin/logout  — Revokes the refresh token, clears the cookie.
///
/// CSRF protection strategy: SameSite=Strict + custom header <c>X-Requested-With: XMLHttpRequest</c>.
/// - SameSite=Strict prevents cross-site delivery of the refresh cookie (primary protection).
/// - Custom-header requirement adds defence-in-depth for older browsers/proxies that may strip
///   SameSite attributes. The header is a secret not included by simple CORS pre-flight requests,
///   preventing legacy CSRF attack vectors (double-submit pattern not used because SameSite=Strict
///   alone covers all modern browsers and the custom-header check covers the legacy gap).
/// - Endpoints return 400 if <c>X-Requested-With</c> header is absent (documented requirement).
///
/// Mobile flow: 100% unchanged — uses POST /auth/token/refresh (body-based opaque token).
/// </summary>
public sealed class AdminAuth : EndpointGroupBase
{
    private const string AdminRefreshCookieName = "sa_admin_rt";
    private const string CsrfHeaderName = "X-Requested-With";
    private const string CsrfHeaderExpectedValue = "XMLHttpRequest";

    /// <inheritdoc />
    public override string? GroupName => "/auth/admin";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // POST /auth/admin/login — admin login returning access token in body + refresh cookie
        // Anonymous; rate-limited via "otp" (5 req/10min per IP — same as password login).
        groupBuilder.MapPost("/login", AdminLogin)
            .RequireRateLimiting("otp")
            .WithName("AdminLogin")
            .WithSummary("Admin browser login — returns short-lived access token in body + sets httpOnly refresh cookie.")
            .WithDescription(
                "GAP-051: Body: { phoneNumber, password }. " +
                "On success: JSON { accessToken, expiresAt } + Set-Cookie: sa_admin_rt=...; HttpOnly; Secure; SameSite=Strict. " +
                "CSRF: requires X-Requested-With: XMLHttpRequest header. " +
                "Rate limit: otp tier (5 req/10 min per IP).");

        // POST /auth/admin/refresh — rotate refresh cookie, return new access token
        // Anonymous (token in cookie); rate-limited standard.
        groupBuilder.MapPost("/refresh", AdminRefresh)
            .RequireRateLimiting("standard")
            .WithName("AdminRefresh")
            .WithSummary("Admin browser token refresh — reads httpOnly refresh cookie, rotates it, returns new access token.")
            .WithDescription(
                "GAP-051 CSRF protection: SameSite=Strict + X-Requested-With: XMLHttpRequest required. " +
                "Returns JSON { accessToken, expiresAt } in body. " +
                "Rotates the refresh token — old cookie is invalidated, new cookie is set. " +
                "Returns 401 if cookie is missing, invalid, or expired. " +
                "Mobile flow (POST /auth/token/refresh) is 100% unchanged.");

        // POST /auth/admin/logout — revoke cookie, clear it
        // Anonymous; always succeeds (idempotent).
        groupBuilder.MapPost("/logout", AdminLogout)
            .RequireRateLimiting("standard")
            .WithName("AdminLogout")
            .WithSummary("Admin browser logout — revokes the refresh token and clears the httpOnly cookie.")
            .WithDescription(
                "GAP-051: Idempotent — always returns 204 even when cookie is absent. " +
                "CSRF: X-Requested-With: XMLHttpRequest required.");
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    private static async Task<IResult> AdminLogin(
        AdminLoginRequest req,
        ISender sender,
        HttpContext http,
        IConfiguration configuration,
        CancellationToken ct)
    {
        // CSRF: custom-header check (defence-in-depth alongside SameSite=Strict)
        if (!IsValidCsrfHeader(http))
            return Results.BadRequest(new
            {
                error = $"Header '{CsrfHeaderName}: {CsrfHeaderExpectedValue}' is required for admin auth endpoints.",
                code = "AdminAuth.MissingCsrfHeader"
            });

        // Reuse the existing password login command (phone + password — no OTP)
        var result = await sender.Send(new LoginWithPasswordCommand(req.PhoneNumber, req.Password), ct);
        if (result.IsFailure)
        {
            var status = result.Error.Type == ErrorType.Unauthorized ? 401 : 400;
            return Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: status);
        }

        var loginResponse = result.Value;

        // For admin login: if 2FA is required, surface the challenge (admin must handle 2FA)
        if (loginResponse.Requires2fa)
            return Results.Json(new
            {
                requires2fa = true,
                challengeToken = loginResponse.ChallengeToken
            }, statusCode: 200);

        if (loginResponse.Token is null || loginResponse.RefreshToken is null)
            return Results.Json(new { error = "Authentication incomplete.", code = "AdminAuth.IncompleteAuth" }, statusCode: 400);

        // Write httpOnly refresh cookie (admin-scoped)
        SetRefreshCookie(http, loginResponse.RefreshToken, configuration);

        // Return only the access token in the body — never return the refresh token in JSON
        var cookieExpiresAt = loginResponse.RefreshExpiresAt ?? DateTime.UtcNow.AddHours(1);
        return Results.Ok(new AdminAccessTokenResponse(loginResponse.Token, cookieExpiresAt));
    }

    private static async Task<IResult> AdminRefresh(
        ISender sender,
        HttpContext http,
        IConfiguration configuration,
        CancellationToken ct)
    {
        // CSRF: custom-header check
        if (!IsValidCsrfHeader(http))
            return Results.BadRequest(new
            {
                error = $"Header '{CsrfHeaderName}: {CsrfHeaderExpectedValue}' is required.",
                code = "AdminAuth.MissingCsrfHeader"
            });

        // Read refresh token from httpOnly cookie
        var cookieToken = http.Request.Cookies[AdminRefreshCookieName];
        if (string.IsNullOrWhiteSpace(cookieToken))
            return Results.Unauthorized();

        var result = await sender.Send(new AdminRefreshCommand(cookieToken), ct);
        if (result.IsFailure)
            return Results.Json(
                new { error = result.Error.Message, code = result.Error.Code },
                statusCode: result.Error.Type == ErrorType.Unauthorized ? 401 : 400);

        // Write the rotated refresh token as a new httpOnly cookie
        SetRefreshCookie(http, result.Value.NewCookieRefreshToken, configuration);

        // Body: access token only — never expose the refresh token in JSON
        return Results.Ok(new AdminAccessTokenResponse(result.Value.AccessToken, result.Value.ExpiresAt));
    }

    private static async Task<IResult> AdminLogout(
        ISender sender,
        HttpContext http,
        CancellationToken ct)
    {
        // CSRF: custom-header check
        if (!IsValidCsrfHeader(http))
            return Results.BadRequest(new
            {
                error = $"Header '{CsrfHeaderName}: {CsrfHeaderExpectedValue}' is required.",
                code = "AdminAuth.MissingCsrfHeader"
            });

        var cookieToken = http.Request.Cookies[AdminRefreshCookieName];
        await sender.Send(new AdminLogoutCommand(cookieToken), ct);

        // Always clear the cookie — even if revocation failed (best-effort)
        http.Response.Cookies.Delete(AdminRefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/auth/admin"
        });

        return Results.NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Validates the custom CSRF header.
    /// SameSite=Strict is the primary protection; this is defence-in-depth.
    /// </summary>
    private static bool IsValidCsrfHeader(HttpContext http)
    {
        var headerValue = http.Request.Headers[CsrfHeaderName].FirstOrDefault();
        return string.Equals(headerValue, CsrfHeaderExpectedValue, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Writes the admin refresh token as an httpOnly+Secure+SameSite=Strict cookie.
    /// Path scoped to /auth/admin so the cookie is only sent to the refresh/logout endpoints.
    /// </summary>
    private static void SetRefreshCookie(HttpContext http, string refreshToken, IConfiguration configuration)
    {
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development",
            StringComparison.OrdinalIgnoreCase);

        http.Response.Cookies.Append(AdminRefreshCookieName, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            // Secure=false only in Development (localhost doesn't use HTTPS).
            // MUST be true in Staging/Production (Cloud Run is always HTTPS).
            Secure = !isDevelopment,
            SameSite = SameSiteMode.Strict,
            Path = "/auth/admin",           // Scoped — browser only sends on /auth/admin/* paths
            MaxAge = TimeSpan.FromDays(7),  // Matches refresh token DB expiry
            IsEssential = true
        });
    }
}

// ── Request / Response DTOs ───────────────────────────────────────────────────

/// <summary>Request body for POST /auth/admin/login.</summary>
internal record AdminLoginRequest(string PhoneNumber, string Password);

/// <summary>
/// Admin access token response — access token in body ONLY.
/// The refresh token is set as an httpOnly cookie and never included here.
/// </summary>
internal record AdminAccessTokenResponse(string AccessToken, DateTime ExpiresAt);
