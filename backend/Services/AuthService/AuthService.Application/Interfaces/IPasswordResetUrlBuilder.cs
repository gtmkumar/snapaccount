namespace AuthService.Application.Interfaces;

/// <summary>
/// Builds the fully-qualified password reset URL for the given token.
/// Concrete implementation in Infrastructure reads <c>App:BaseUrl</c> from configuration.
/// Abstracted so the Application layer stays free of <c>IConfiguration</c>.
/// </summary>
public interface IPasswordResetUrlBuilder
{
    /// <summary>
    /// Returns a URL like <c>https://app.snapaccount.in/reset-password?token=...</c>.
    /// </summary>
    string Build(string plaintextToken);
}
