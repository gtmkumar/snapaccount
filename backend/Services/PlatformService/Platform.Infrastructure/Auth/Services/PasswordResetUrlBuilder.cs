using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Builds the password reset URL from <c>App:BaseUrl</c> config (default: http://localhost:3000).
/// In production, set <c>App:BaseUrl=https://app.snapaccount.in</c> (or via GCP Secret Manager).
/// </summary>
public sealed class PasswordResetUrlBuilder(IConfiguration configuration) : IPasswordResetUrlBuilder
{
    /// <inheritdoc />
    public string Build(string plaintextToken)
    {
        var baseUrl = configuration["App:BaseUrl"] ?? "http://localhost:3000";
        return $"{baseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(plaintextToken)}";
    }
}
