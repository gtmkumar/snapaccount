using AuthService.Application.PasswordReset.Commands.ForgotPassword;
using AuthService.Application.PasswordReset.Commands.ResetPassword;
using MediatR;
using SnapAccount.Shared.Api;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Password reset endpoints — both are anonymous (no bearer token required).
/// Anti-enumeration: POST /forgot always returns 204 regardless of whether the email exists.
/// </summary>
public sealed class PasswordReset : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // POST /auth/password/forgot — initiate reset; always 204 (no enumeration); rate-limited
        groupBuilder.MapPost("/password/forgot", ForgotPassword).RequireRateLimiting("password-reset");

        // POST /auth/password/reset — consume token, set new password; rate-limited
        groupBuilder.MapPost("/password/reset", ResetPassword).RequireRateLimiting("password-reset");
    }

    // POST /auth/password/forgot [Anonymous] — always 204
    private static async Task<IResult> ForgotPassword(ForgotPasswordRequest req, ISender sender, CancellationToken ct)
    {
        // Result is discarded — always 204 to prevent user enumeration
        await sender.Send(new ForgotPasswordCommand(req.Email ?? string.Empty), ct);
        return Results.NoContent();
    }

    // POST /auth/password/reset [Anonymous]
    private static async Task<IResult> ResetPassword(ResetPasswordRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ResetPasswordCommand(req.Token, req.NewPassword), ct);
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }
}

// ── Request DTOs ─────────────────────────────────────────────────────────────
internal record ForgotPasswordRequest(string? Email);
internal record ResetPasswordRequest(string Token, string NewPassword);
