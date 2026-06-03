using AuthService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// SendGrid v3 Mail Send API implementation of <see cref="IEmailSender"/>.
/// Configured via <c>SendGrid:ApiKey</c> and <c>SendGrid:FromEmail</c>/<c>SendGrid:FromName</c>.
/// When the API key is absent, falls back to <see cref="LoggingEmailSender"/> behaviour —
/// emails are logged rather than sent so local dev works without SendGrid setup.
/// </summary>
public sealed class SendGridEmailSender(
    IConfiguration configuration,
    ILogger<SendGridEmailSender> logger) : IEmailSender
{
    private static readonly HttpClient Http = new();

    public async Task SendAsync(
        string to, string subject, string bodyText, string? bodyHtml = null, CancellationToken ct = default)
    {
        var apiKey = configuration["SendGrid:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("SendGrid:ApiKey not configured — email not sent. To={To} Subject={Subject} Body={Body}",
                to, subject, bodyText);
            return;
        }

        var fromEmail = configuration["SendGrid:FromEmail"] ?? "no-reply@snapaccount.in";
        var fromName = configuration["SendGrid:FromName"] ?? "SnapAccount";

        var payload = new
        {
            personalizations = new[] { new { to = new[] { new { email = to } } } },
            from = new { email = fromEmail, name = fromName },
            subject,
            content = new[]
            {
                new { type = "text/plain", value = bodyText },
                new { type = "text/html", value = bodyHtml ?? $"<pre>{bodyText}</pre>" }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.sendgrid.com/v3/mail/send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        var response = await Http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogError("SendGrid email failed: {StatusCode} — {Body}", response.StatusCode, body);
        }
        else
        {
            logger.LogInformation("SendGrid: email sent to {To}.", to);
        }
    }
}
