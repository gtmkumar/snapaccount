using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// SendGrid email adapter.
/// Sends transactional emails via SendGrid v3 Mail Send API.
/// Includes unsubscribe header and bounce-safe patterns.
/// Note: SPF/DKIM DNS authentication on SnapAccount domain required for deliverability
/// — flag P6-FLAG-06 has been raised to team lead.
/// </summary>
public sealed class SendGridEmailAdapter(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<SendGridEmailAdapter> logger) : IChannelAdapter
{
    private const string ApiUrl = "https://api.sendgrid.com/v3/mail/send";

    /// <inheritdoc />
    public NotificationChannel Channel => NotificationChannel.Email;

    /// <inheritdoc />
    public async Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(context.RecipientEmail))
            throw new InvalidOperationException("RecipientEmail is required for email dispatch.");

        var apiKey = configuration["SendGrid:ApiKey"]
            ?? throw new InvalidOperationException("SendGrid:ApiKey not configured.");
        var fromEmail = configuration["SendGrid:FromEmail"] ?? "noreply@snapaccount.in";
        var fromName = configuration["SendGrid:FromName"] ?? "SnapAccount";

        var client = httpClientFactory.CreateClient("SendGrid");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var payload = new
        {
            personalizations = new[]
            {
                new { to = new[] { new { email = context.RecipientEmail } } }
            },
            from = new { email = fromEmail, name = fromName },
            subject = string.IsNullOrEmpty(context.RenderedSubject) ? "SnapAccount Notification" : context.RenderedSubject,
            content = new[]
            {
                new { type = "text/plain", value = context.RenderedBody }
            },
            // Unsubscribe group header for deliverability compliance
            asm = new { group_id = 1 }
        };

        var response = await client.PostAsJsonAsync(ApiUrl, payload, ct);

        if (response.StatusCode == HttpStatusCode.Accepted)
        {
            var msgId = response.Headers.TryGetValues("X-Message-Id", out var ids) ? ids.First() : Guid.NewGuid().ToString();
            logger.LogInformation("SendGrid email sent to {Email} for event {EventCode}: {MsgId}",
                context.RecipientEmail.Split('@')[0] + "@****",
                context.EventCode, msgId);
            return msgId;
        }

        var body = await response.Content.ReadAsStringAsync(ct);
        throw new HttpRequestException($"SendGrid returned {response.StatusCode}: {body}");
    }
}
