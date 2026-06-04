using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services.Kyc;

/// <summary>
/// Real government document-verification adapter backed by the Sandbox (Quicko) KYC API.
/// Selected when <c>KYC_PROVIDER=sandbox</c>. Implements both <see cref="IDocumentVerificationProvider"/>
/// (the four-kind document flow) and <see cref="IKycProvider"/> (legacy /auth/me/kyc/* endpoints).
///
/// <para>OTP semantics per kind:</para>
/// <list type="bullet">
///   <item><b>AADHAAR</b> — genuine two-step UIDAI OKYC: <c>SendOtp</c> generates an OTP to the
///         Aadhaar-registered mobile (returns the provider <c>reference_id</c> as the transaction id);
///         <c>VerifyOtp</c> submits the real OTP.</item>
///   <item><b>PAN / GSTIN / TAN</b> — direct government lookups with <b>no OTP</b>. The real
///         verification runs at <c>SendOtp</c> time (where the document number is available) and its
///         verdict is carried to <c>VerifyOtp</c> inside an encrypted, expiring verdict token
///         (see <see cref="KycVerdictTokenCodec"/>). The OTP value is ignored for these kinds.</item>
/// </list>
///
/// All calls require a JWT obtained from <see cref="SandboxAccessTokenProvider"/>; a 401 triggers one
/// forced token refresh + retry. Document numbers are masked in logs (DPDP Act 2023).
/// </summary>
public sealed class SandboxKycProvider(
    IHttpClientFactory httpClientFactory,
    SandboxAccessTokenProvider tokenProvider,
    KycVerdictTokenCodec verdictCodec,
    KycProviderOptions options,
    ILogger<SandboxKycProvider> logger)
    : IDocumentVerificationProvider, IKycProvider
{
    /// <summary>Named HttpClient configured with the provider base address + timeout in DI.</summary>
    public const string HttpClientName = "SandboxKyc";

    /// <inheritdoc />
    public string ProviderName => "sandbox";

    // ── IDocumentVerificationProvider ────────────────────────────────────────

    /// <inheritdoc />
    public async Task<KycOtpSendResult> SendOtpAsync(string kind, string documentNumber, CancellationToken ct = default)
    {
        if (kind == KycKind.Aadhaar)
        {
            var referenceId = await GenerateAadhaarOtpAsync(documentNumber, ct);
            return new KycOtpSendResult(referenceId);
        }

        // Non-OTP kinds: verify now, carry the verdict forward in an encrypted token.
        var (verified, providerRef) = await VerifyDirectAsync(kind, documentNumber, ct);
        var token = verdictCodec.Encode(
            kind, verified, providerRef, TimeSpan.FromMinutes(options.VerificationTokenTtlMinutes));
        logger.LogInformation(
            "Sandbox direct verify kind={Kind} number={Number} -> verified={Verified}",
            kind, MaskForLog(kind, documentNumber), verified);
        return new KycOtpSendResult(token);
    }

    /// <inheritdoc />
    public async Task<KycVerifyResult> VerifyOtpAsync(string kind, string transactionId, string otp, CancellationToken ct = default)
    {
        if (kind == KycKind.Aadhaar)
            return await VerifyAadhaarOtpAsync(transactionId, otp, ct);

        // Non-OTP kinds: the verdict was decided at send time and sealed into the token.
        var decoded = verdictCodec.Decode(transactionId, kind);
        if (!decoded.IsValid)
        {
            // Forged / tampered / expired token — not verified (handler keeps the record PENDING).
            logger.LogWarning("Sandbox verdict token invalid or expired for kind={Kind}.", kind);
            return new KycVerifyResult(KycStatus.Failed);
        }

        return decoded.Verified
            ? new KycVerifyResult(KycStatus.Verified, decoded.ProviderRef)
            : new KycVerifyResult(KycStatus.Failed);
    }

    // ── IKycProvider (legacy /auth/me/kyc/*) ─────────────────────────────────

    /// <inheritdoc />
    public async Task<KycVerifyResult> VerifyPanAsync(string pan, string? nameOnPan, CancellationToken ct = default)
    {
        var (verified, providerRef) = await VerifyPanInternalAsync(pan, nameOnPan, ct);
        return verified
            ? new KycVerifyResult(KycStatus.Verified, providerRef)
            : new KycVerifyResult(KycStatus.Failed);
    }

    /// <inheritdoc />
    public async Task<KycOtpSendResult> SendAadhaarOtpAsync(string aadhaar, CancellationToken ct = default)
        => new(await GenerateAadhaarOtpAsync(aadhaar, ct));

    /// <inheritdoc />
    public Task<KycVerifyResult> VerifyAadhaarOtpAsync(string transactionId, string otp, CancellationToken ct = default)
        => VerifyAadhaarOtpInternalAsync(transactionId, otp, ct);

    // ── Per-kind verification ─────────────────────────────────────────────────

    private Task<(bool verified, string? providerRef)> VerifyDirectAsync(
        string kind, string documentNumber, CancellationToken ct) => kind switch
    {
        KycKind.Pan   => VerifyPanInternalAsync(documentNumber, nameOnPan: null, ct),
        KycKind.Gstin => VerifyGstinInternalAsync(documentNumber, ct),
        KycKind.Tan   => VerifyTanInternalAsync(documentNumber, ct),
        _             => throw new KycProviderException($"Unsupported document kind '{kind}'.")
    };

    private async Task<(bool verified, string? providerRef)> VerifyPanInternalAsync(
        string pan, string? nameOnPan, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["@entity"]  = "in.co.sandbox.kyc.pan_verification.request",
            ["pan"]      = pan.Trim().ToUpperInvariant(),
            ["consent"]  = options.Consent,
            ["reason"]   = options.Reason,
        };
        if (!string.IsNullOrWhiteSpace(nameOnPan))
            body["name_as_per_pan"] = nameOnPan;

        var (ok, doc, status) = await SendAsync(HttpMethod.Post, options.Endpoints.PanVerify, body, ct);
        if (!ok || doc is null)
        {
            logger.LogInformation("Sandbox PAN verify returned HTTP {Status} -> not verified.", status);
            return (false, null);
        }

        using (doc)
        {
            var verified = ReadStatusString(doc, "status") is { } s
                           && s.Equals("valid", StringComparison.OrdinalIgnoreCase);
            return (verified, ReadTransactionId(doc));
        }
    }

    private async Task<(bool verified, string? providerRef)> VerifyGstinInternalAsync(
        string gstin, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["@entity"] = "in.co.sandbox.kyc.gstin.request",
            ["gstin"]   = gstin.Trim().ToUpperInvariant(),
        };

        var (ok, doc, status) = await SendAsync(HttpMethod.Post, options.Endpoints.GstinVerify, body, ct);
        if (!ok || doc is null)
        {
            logger.LogInformation("Sandbox GSTIN verify returned HTTP {Status} -> not verified.", status);
            return (false, null);
        }

        using (doc)
        {
            // GSTN payload reports operating status in "sts" (e.g. "Active").
            var verified = ReadStatusString(doc, "sts") is { } s
                           && s.Equals("Active", StringComparison.OrdinalIgnoreCase);
            return (verified, ReadTransactionId(doc));
        }
    }

    private async Task<(bool verified, string? providerRef)> VerifyTanInternalAsync(
        string tan, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(options.Endpoints.TanVerify))
        {
            logger.LogWarning(
                "TAN verification requested but no Kyc:Endpoints:TanVerify is configured for provider '{Provider}'. " +
                "TAN cannot be government-verified — returning not verified.", options.Provider);
            return (false, null);
        }

        var body = new Dictionary<string, object?>
        {
            ["@entity"] = "in.co.sandbox.kyc.tan.request",
            ["tan"]     = tan.Trim().ToUpperInvariant(),
            ["consent"] = options.Consent,
            ["reason"]  = options.Reason,
        };

        var (ok, doc, status) = await SendAsync(HttpMethod.Post, options.Endpoints.TanVerify, body, ct);
        if (!ok || doc is null)
        {
            logger.LogInformation("Sandbox TAN verify returned HTTP {Status} -> not verified.", status);
            return (false, null);
        }

        using (doc)
        {
            var verified = ReadStatusString(doc, "status") is { } s
                           && (s.Equals("valid", StringComparison.OrdinalIgnoreCase)
                               || s.Equals("Active", StringComparison.OrdinalIgnoreCase));
            return (verified, ReadTransactionId(doc));
        }
    }

    private async Task<string> GenerateAadhaarOtpAsync(string aadhaar, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["@entity"]        = "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
            ["aadhaar_number"] = aadhaar.Trim(),
            ["consent"]        = options.Consent,
            ["reason"]         = options.Reason,
        };

        var (ok, doc, status) = await SendAsync(HttpMethod.Post, options.Endpoints.AadhaarOtpSend, body, ct);
        if (!ok || doc is null)
            throw new KycProviderException($"Aadhaar OTP generation failed (HTTP {status}).");

        using (doc)
        {
            // Response carries the reference id under data.reference_id (UIDAI OKYC).
            if (doc.RootElement.TryGetProperty("data", out var data)
                && TryReadString(data, "reference_id") is { Length: > 0 } refId)
            {
                logger.LogInformation(
                    "Sandbox Aadhaar OTP sent for number={Number} refId={RefId}.",
                    MaskForLog(KycKind.Aadhaar, aadhaar), refId);
                return refId;
            }
        }

        throw new KycProviderException("Aadhaar OTP response did not contain a reference_id.");
    }

    private async Task<KycVerifyResult> VerifyAadhaarOtpInternalAsync(
        string referenceId, string otp, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["@entity"]      = "in.co.sandbox.kyc.aadhaar.okyc.request",
            ["reference_id"] = referenceId,
            ["otp"]          = otp,
        };

        var (ok, doc, status) = await SendAsync(HttpMethod.Post, options.Endpoints.AadhaarOtpVerify, body, ct);
        if (!ok || doc is null)
        {
            // 4xx here is typically a wrong/expired OTP — a retryable user error, not a hard failure.
            logger.LogInformation("Sandbox Aadhaar OTP verify returned HTTP {Status}.", status);
            return new KycVerifyResult(KycStatus.Failed);
        }

        using (doc)
        {
            var verified = ReadStatusString(doc, "status") is { } s
                           && s.Equals("VALID", StringComparison.OrdinalIgnoreCase);
            return verified
                ? new KycVerifyResult(KycStatus.Verified, ReadTransactionId(doc))
                : new KycVerifyResult(KycStatus.Failed);
        }
    }

    // ── HTTP plumbing ─────────────────────────────────────────────────────────

    /// <summary>
    /// Sends an authorized JSON request. On a 401 it forces one token refresh and retries.
    /// Returns (is2xx, parsed JSON document or null, status code). 4xx returns ok=false WITHOUT
    /// throwing (caller maps to not-verified); 5xx / network errors throw <see cref="KycProviderException"/>.
    /// </summary>
    private async Task<(bool ok, JsonDocument? doc, int status)> SendAsync(
        HttpMethod method, string path, object body, CancellationToken ct)
    {
        if (!options.HasCredentials)
            throw new KycProviderException(
                "KYC provider credentials are not configured (set Kyc:ApiKey / Kyc:ApiSecret or KYC_API_KEY / KYC_API_SECRET).");

        var resp = await SendOnceAsync(method, path, body, forceRefresh: false, ct);
        if (resp.StatusCode == HttpStatusCode.Unauthorized)
        {
            resp.Dispose();
            resp = await SendOnceAsync(method, path, body, forceRefresh: true, ct);
        }

        using (resp)
        {
            var code = (int)resp.StatusCode;
            if (resp.IsSuccessStatusCode)
            {
                var doc = await resp.Content.ReadFromJsonAsync<JsonDocument>(cancellationToken: ct);
                return (true, doc, code);
            }

            if ((int)resp.StatusCode >= 500)
            {
                var serverBody = await SafeReadAsync(resp, ct);
                logger.LogError("Sandbox {Path} failed: HTTP {Status}. {Body}", path, code, serverBody);
                throw new KycProviderException($"Verification provider error (HTTP {code}).");
            }

            // 4xx (other than 401, already retried): treat as a negative verification result.
            return (false, null, code);
        }
    }

    private async Task<HttpResponseMessage> SendOnceAsync(
        HttpMethod method, string path, object body, bool forceRefresh, CancellationToken ct)
    {
        var token = await tokenProvider.GetTokenAsync(ct, forceRefresh);
        var client = httpClientFactory.CreateClient(HttpClientName);

        var req = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body),
        };
        // Sandbox: the access token is passed in Authorization WITHOUT the "Bearer" scheme.
        req.Headers.TryAddWithoutValidation("Authorization", token);
        req.Headers.TryAddWithoutValidation("x-api-key", options.ApiKey);
        req.Headers.TryAddWithoutValidation("x-api-version", options.ApiVersion);

        return await client.SendAsync(req, ct);
    }

    // ── JSON helpers ──────────────────────────────────────────────────────────

    private static string? ReadStatusString(JsonDocument doc, string field) =>
        doc.RootElement.TryGetProperty("data", out var data) ? TryReadString(data, field) : null;

    private static string? ReadTransactionId(JsonDocument doc) =>
        TryReadString(doc.RootElement, "transaction_id");

    private static string? TryReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var prop)
        && prop.ValueKind == JsonValueKind.String
            ? prop.GetString()
            : null;

    private static async Task<string> SafeReadAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        try { return await resp.Content.ReadAsStringAsync(ct); }
        catch { return "<unreadable body>"; }
    }

    /// <summary>Masks the document number before logging (DPDP Act 2023 — never log a full Aadhaar).</summary>
    private static string MaskForLog(string kind, string documentNumber) =>
        kind == KycKind.Aadhaar && documentNumber.Length == 12
            ? $"XXXX-XXXX-{documentNumber[^4..]}"
            : documentNumber;
}
