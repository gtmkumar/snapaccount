using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using System.Net.Http.Json;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// MSG91 SMS adapter with DLT template ID gating.
/// REGULATORY: India TRAI DLT registration is mandatory — dispatch is blocked if
/// <see cref="NotificationDispatchContext.DltTemplateId"/> is null or empty.
/// The <see cref="SendNotificationCommandHandler"/> enforces this gate before calling this adapter.
/// Retries with exponential backoff on transient failures (5xx, timeout).
/// </summary>
public sealed class Msg91SmsAdapter(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<Msg91SmsAdapter> logger) : IChannelAdapter
{
    private const string ApiBase = "https://api.msg91.com/api/v5/";

    /// <inheritdoc />
    public NotificationChannel Channel => NotificationChannel.Sms;

    /// <inheritdoc />
    public async Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(context.RecipientPhone))
            throw new InvalidOperationException("RecipientPhone is required for SMS dispatch.");

        // DLT gate is enforced in the fan-out pipeline before reaching here;
        // this is a defensive check.
        if (string.IsNullOrEmpty(context.DltTemplateId))
            throw new InvalidOperationException(
                "MSG91 SMS blocked: DLT template ID not registered. Register with TRAI DLT portal.");

        var apiKey = configuration["Msg91:ApiKey"]
            ?? throw new InvalidOperationException("Msg91:ApiKey not configured.");

        var client = httpClientFactory.CreateClient("Msg91");

        var payload = new
        {
            sender = context.SenderName ?? "SNAPAC",
            route = "4", // promotional=1, transactional=4
            country = "91",
            sms = new[]
            {
                new
                {
                    message = context.RenderedBody,
                    to = new[] { context.RecipientPhone.TrimStart('+') }
                }
            },
            DLT_TE_ID = context.DltTemplateId
        };

        HttpResponseMessage response;
        var attempt = 0;
        const int maxAttempts = 3;

        while (true)
        {
            try
            {
                attempt++;
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}flow/");
                req.Headers.Add("authkey", apiKey);
                req.Content = JsonContent.Create(payload);

                response = await client.SendAsync(req, ct);
                if (response.IsSuccessStatusCode) break;

                if ((int)response.StatusCode >= 500 && attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), ct);
                    continue;
                }

                var body = await response.Content.ReadAsStringAsync(ct);
                throw new HttpRequestException($"MSG91 returned {response.StatusCode}: {body}");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested && attempt < maxAttempts)
            {
                logger.LogWarning("MSG91 timeout on attempt {Attempt}, retrying...", attempt);
                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt)), ct);
            }
        }

        var result = await response.Content.ReadAsStringAsync(ct);
        logger.LogInformation("MSG91 SMS sent to {Phone} for event {EventCode}: {Result}",
            context.RecipientPhone[..Math.Min(6, context.RecipientPhone.Length)] + "****",
            context.EventCode, result);

        return result;
    }
}
