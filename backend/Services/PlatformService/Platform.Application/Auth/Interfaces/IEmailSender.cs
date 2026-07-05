namespace AuthService.Application.Interfaces;

/// <summary>
/// Abstraction over the email delivery provider (SendGrid in production).
/// Implemented by <c>SendGridEmailSender</c> in Infrastructure.
/// When DEV_AUTH_BYPASS=true or no SendGrid key is configured, a no-op logger
/// implementation is substituted so local dev works without email setup.
/// </summary>
public interface IEmailSender
{
    /// <summary>Sends a plain-text + HTML email to the specified address.</summary>
    Task SendAsync(string to, string subject, string bodyText, string? bodyHtml = null, CancellationToken ct = default);
}
