using System.Net.Http.Json;
using System.Text.Json;
using AuthService.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services.Kyc;

/// <summary>
/// Acquires and caches the Sandbox JWT access token.
///
/// The token is obtained from <c>POST /authenticate</c> (headers <c>x-api-key</c>,
/// <c>x-api-secret</c>, <c>x-api-version</c>) and is valid for 24 hours. We cache it
/// process-wide (singleton) and refresh slightly early. Concurrent callers are serialised
/// with a semaphore so only one authenticate round-trip happens per refresh window.
///
/// Registered as a <b>singleton</b>; the per-request <see cref="SandboxKycProvider"/> resolves it.
/// </summary>
public sealed class SandboxAccessTokenProvider(
    IHttpClientFactory httpClientFactory,
    KycProviderOptions options,
    ILogger<SandboxAccessTokenProvider> logger)
{
    /// <summary>Refresh this long before the nominal 24h expiry to avoid edge-of-expiry failures.</summary>
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(23);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _token;
    private DateTimeOffset _expiresAt = DateTimeOffset.MinValue;

    /// <summary>
    /// Returns a valid access token, fetching a fresh one if the cache is empty or expired.
    /// </summary>
    /// <param name="forceRefresh">Force a new token (used after a 401 from a downstream call).</param>
    public async Task<string> GetTokenAsync(CancellationToken ct, bool forceRefresh = false)
    {
        if (!forceRefresh && _token is not null && DateTimeOffset.UtcNow < _expiresAt)
            return _token;

        await _gate.WaitAsync(ct);
        try
        {
            // Double-check after acquiring the lock — another caller may have refreshed.
            if (!forceRefresh && _token is not null && DateTimeOffset.UtcNow < _expiresAt)
                return _token;

            var token = await AuthenticateAsync(ct);
            _token = token;
            _expiresAt = DateTimeOffset.UtcNow.Add(Lifetime);
            return token;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<string> AuthenticateAsync(CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(SandboxKycProvider.HttpClientName);

        using var req = new HttpRequestMessage(HttpMethod.Post, options.Endpoints.Authenticate);
        req.Headers.TryAddWithoutValidation("x-api-key", options.ApiKey);
        req.Headers.TryAddWithoutValidation("x-api-secret", options.ApiSecret);
        req.Headers.TryAddWithoutValidation("x-api-version", options.ApiVersion);

        using var resp = await client.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            var body = await SafeReadAsync(resp, ct);
            logger.LogError("Sandbox authenticate failed: HTTP {Status}. {Body}", (int)resp.StatusCode, body);
            throw new KycProviderException(
                $"Government verification provider authentication failed (HTTP {(int)resp.StatusCode}).");
        }

        using var doc = await resp.Content.ReadFromJsonAsync<JsonDocument>(cancellationToken: ct)
            ?? throw new KycProviderException("Empty authenticate response from verification provider.");

        if (doc.RootElement.TryGetProperty("data", out var data)
            && data.TryGetProperty("access_token", out var tokenEl)
            && tokenEl.GetString() is { Length: > 0 } token)
        {
            return token;
        }

        throw new KycProviderException("Verification provider authenticate response had no access_token.");
    }

    private static async Task<string> SafeReadAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        try { return await resp.Content.ReadAsStringAsync(ct); }
        catch { return "<unreadable body>"; }
    }
}

/// <summary>Raised when the external verification provider is misconfigured or unreachable.</summary>
public sealed class KycProviderException(string message) : Exception(message);
