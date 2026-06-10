using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using SubscriptionService.Application.Common.Interfaces;

namespace SubscriptionService.Infrastructure.Razorpay;

/// <summary>
/// Production Razorpay REST adapter.
/// Base URL: https://api.razorpay.com/v1
/// Auth: HTTP Basic (key_id:key_secret).
///
/// Registered in DI via named <c>IHttpClientFactory</c> ("Razorpay").
/// Credentials are injected from the admin-configured <see cref="RazorpayClientOptions"/>.
/// </summary>
public sealed class RazorpayHttpClient(
    IHttpClientFactory httpClientFactory,
    RazorpayClientOptions options,
    ILogger<RazorpayHttpClient> logger) : IRazorpayClient
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private HttpClient CreateClient()
    {
        var client = httpClientFactory.CreateClient("Razorpay");
        var credentials = Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"{options.KeyId}:{options.KeySecret}"));
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Basic", credentials);
        return client;
    }

    /// <inheritdoc />
    public async Task<RazorpayOrderResult> CreateOrderAsync(
        long amountPaise,
        string receiptId,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default)
    {
        var body = new
        {
            amount   = amountPaise,
            currency = "INR",
            receipt  = receiptId,
            notes    = notes ?? [],
        };

        using var client   = CreateClient();
        using var response = await client.PostAsync(
            "orders",
            new StringContent(JsonSerializer.Serialize(body, SerializerOptions),
                Encoding.UTF8, "application/json"),
            cancellationToken);

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);

        using var doc = JsonDocument.Parse(json);
        var root      = doc.RootElement;

        logger.LogInformation("Razorpay order created: {OrderId}", root.GetProperty("id").GetString());

        return new RazorpayOrderResult(
            OrderId:     root.GetProperty("id").GetString()!,
            Status:      root.GetProperty("status").GetString()!,
            AmountPaise: root.GetProperty("amount").GetInt64(),
            Currency:    root.GetProperty("currency").GetString()!,
            ReceiptId:   root.TryGetProperty("receipt", out var r) ? r.GetString() : null);
    }

    /// <inheritdoc />
    public async Task<RazorpaySubscriptionResult> CreateSubscriptionAsync(
        string planId,
        int totalCount,
        Dictionary<string, string>? notes = null,
        CancellationToken cancellationToken = default)
    {
        var body = new
        {
            plan_id     = planId,
            total_count = totalCount,
            notes       = notes ?? [],
        };

        using var client   = CreateClient();
        using var response = await client.PostAsync(
            "subscriptions",
            new StringContent(JsonSerializer.Serialize(body, SerializerOptions),
                Encoding.UTF8, "application/json"),
            cancellationToken);

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        var root      = doc.RootElement;

        return new RazorpaySubscriptionResult(
            SubscriptionId: root.GetProperty("id").GetString()!,
            Status:         root.GetProperty("status").GetString()!,
            TotalCount:     root.GetProperty("total_count").GetInt32(),
            PaidCount:      root.GetProperty("paid_count").GetInt32(),
            ShortUrl:       root.TryGetProperty("short_url", out var u) ? u.GetString() : null);
    }

    /// <inheritdoc />
    public async Task<RazorpayPlanResult> SyncPlanAsync(
        string planName,
        long intervalAmountPaise,
        string period,
        int interval = 1,
        CancellationToken cancellationToken = default)
    {
        var body = new
        {
            period         = period,
            interval       = interval,
            item = new
            {
                name     = planName,
                amount   = intervalAmountPaise,
                currency = "INR",
            },
        };

        using var client   = CreateClient();
        using var response = await client.PostAsync(
            "plans",
            new StringContent(JsonSerializer.Serialize(body, SerializerOptions),
                Encoding.UTF8, "application/json"),
            cancellationToken);

        response.EnsureSuccessStatusCode();
        var json  = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(json);
        var root  = doc.RootElement;
        var item  = root.GetProperty("item");

        return new RazorpayPlanResult(
            PlanId:              root.GetProperty("id").GetString()!,
            Name:                item.GetProperty("name").GetString()!,
            IntervalAmountPaise: item.GetProperty("amount").GetInt64(),
            Period:              root.GetProperty("period").GetString()!,
            Interval:            root.GetProperty("interval").GetInt32());
    }

    /// <inheritdoc />
    public bool VerifyWebhookSignature(string payload, string signature, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var computed   = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var computed64 = Convert.ToHexString(computed).ToLowerInvariant();
        return string.Equals(computed64, signature, StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>Runtime credentials injected from the admin-configured row.</summary>
public sealed record RazorpayClientOptions(string KeyId, string KeySecret);
