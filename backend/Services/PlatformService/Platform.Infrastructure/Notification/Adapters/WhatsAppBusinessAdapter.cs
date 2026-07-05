using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using System.Net.Http.Json;
using System.Text.Json;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// GAP-045: WhatsApp Business Cloud API adapter.
/// Decision #2: "full implementation, flagged off by default."
///
/// Configuration keys (all from GCP Secret Manager / appsettings):
///   WhatsApp:Enabled         — "true" to activate (default: false)
///   WhatsApp:AccessToken     — Meta permanent/temp token for the WABA
///   WhatsApp:PhoneNumberId   — WhatsApp Business Account phone number ID
///   WhatsApp:ApiVersion      — Graph API version (default: v19.0)
///
/// Message strategy:
///   - Uses Template messages (the only approved type for business-initiated conversations).
///   - TemplateId is sourced from <see cref="NotificationDispatchContext.DltTemplateId"/>
///     (repurposed as WhatsApp template name — the UI uses the same field for all channel templates).
///   - Falls back to a free-form text message when TemplateId is null, using the
///     RenderedBody field. Free-form only works within a 24-hour user-initiated window.
///
/// When WhatsApp is disabled (WhatsApp:Enabled != "true"):
///   - Returns "WHATSAPP_DISABLED" immediately.
///   - Logs a warning so the skip is observable (GAP-053 pattern).
///
/// Rate limits: Meta enforces per-WABA limits (~1000 messages/day on trial).
///   Production limits require business verification (TL-gated).
/// </summary>
public sealed class WhatsAppBusinessAdapter(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<WhatsAppBusinessAdapter> logger) : IChannelAdapter
{
    private const string DefaultApiVersion = "v19.0";
    private const string GraphApiBase = "https://graph.facebook.com";

    /// <inheritdoc />
    public NotificationChannel Channel => NotificationChannel.WhatsApp;

    /// <inheritdoc />
    public async Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default)
    {
        // GAP-045: Feature flag guard — WhatsApp is OFF by default (Decision #2)
        var enabled = string.Equals(
            configuration["WhatsApp:Enabled"], "true",
            StringComparison.OrdinalIgnoreCase);

        if (!enabled)
        {
            logger.LogWarning(
                "WhatsAppBusinessAdapter: skipped for event {EventCode} user {UserId} — " +
                "WhatsApp is disabled (set WhatsApp:Enabled=true to activate).",
                context.EventCode, context.UserId);
            return "WHATSAPP_DISABLED";
        }

        if (string.IsNullOrEmpty(context.RecipientPhone))
            throw new InvalidOperationException(
                "RecipientPhone is required for WhatsApp dispatch.");

        var accessToken = configuration["WhatsApp:AccessToken"]
            ?? throw new InvalidOperationException(
                "WhatsApp:AccessToken is not configured. " +
                "Provision via GCP Secret Manager (WhatsApp__AccessToken).");

        var phoneNumberId = configuration["WhatsApp:PhoneNumberId"]
            ?? throw new InvalidOperationException(
                "WhatsApp:PhoneNumberId is not configured.");

        var apiVersion = configuration["WhatsApp:ApiVersion"] ?? DefaultApiVersion;
        var url = $"{GraphApiBase}/{apiVersion}/{phoneNumberId}/messages";

        // Build the message payload
        object payload;
        if (!string.IsNullOrEmpty(context.DltTemplateId))
        {
            // Template-based message (preferred — works outside 24h window)
            payload = new
            {
                messaging_product = "whatsapp",
                to = NormalizePhone(context.RecipientPhone),
                type = "template",
                template = new
                {
                    name = context.DltTemplateId,
                    language = new { code = MapLocale(context.Locale) },
                    components = new[]
                    {
                        new
                        {
                            type = "body",
                            parameters = new[]
                            {
                                new { type = "text", text = context.RenderedBody }
                            }
                        }
                    }
                }
            };
        }
        else
        {
            // Free-form text (only valid within 24h user session)
            logger.LogDebug(
                "WhatsAppBusinessAdapter: sending free-form text (no template) for event {EventCode}",
                context.EventCode);
            payload = new
            {
                messaging_product = "whatsapp",
                to = NormalizePhone(context.RecipientPhone),
                type = "text",
                text = new { body = context.RenderedBody }
            };
        }

        var client = httpClientFactory.CreateClient("WhatsApp");
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        HttpResponseMessage response;
        var attempt = 0;
        const int maxAttempts = 3;

        while (true)
        {
            try
            {
                attempt++;
                response = await client.PostAsJsonAsync(url, payload, ct);

                if (response.IsSuccessStatusCode) break;

                // Retry on 5xx only
                if ((int)response.StatusCode >= 500 && attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), ct);
                    continue;
                }

                var errorBody = await response.Content.ReadAsStringAsync(ct);
                logger.LogError(
                    "WhatsApp API error {StatusCode} for event {EventCode} user {UserId}: {Body}",
                    response.StatusCode, context.EventCode, context.UserId, errorBody);
                throw new HttpRequestException(
                    $"WhatsApp API returned {response.StatusCode}: {errorBody}");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested && attempt < maxAttempts)
            {
                logger.LogWarning(
                    "WhatsApp request timeout on attempt {Attempt} for event {EventCode}, retrying...",
                    attempt, context.EventCode);
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), ct);
            }
        }

        var responseBody = await response.Content.ReadAsStringAsync(ct);

        // Extract the WhatsApp message ID from the response
        string? whatsappMessageId = null;
        try
        {
            using var doc = JsonDocument.Parse(responseBody);
            whatsappMessageId = doc.RootElement
                .GetProperty("messages")[0]
                .GetProperty("id")
                .GetString();
        }
        catch
        {
            // Message ID extraction is best-effort; log the full response for debugging
        }

        logger.LogInformation(
            "WhatsApp sent for event {EventCode} user {UserId}: messageId={MessageId}",
            context.EventCode, context.UserId, whatsappMessageId ?? "unknown");

        return whatsappMessageId ?? responseBody;
    }

    /// <summary>
    /// Normalises a phone number for the WhatsApp Cloud API:
    /// strips leading '+' and removes spaces/dashes.
    /// India numbers should be in format 91XXXXXXXXXX (country code + 10 digits).
    /// </summary>
    private static string NormalizePhone(string phone)
        => phone.TrimStart('+').Replace(" ", "").Replace("-", "");

    /// <summary>
    /// Maps a BCP-47 locale string to a WhatsApp-supported language code.
    /// WhatsApp uses underscore-separated codes (e.g. "en_US", "hi").
    /// </summary>
    private static string MapLocale(string locale) => locale switch
    {
        "hi" => "hi",
        "hi-IN" => "hi",
        "bn" => "bn",
        "bn-IN" => "bn",
        "en-IN" => "en_IN",
        "en-US" => "en_US",
        "en" or _ => "en"
    };
}
