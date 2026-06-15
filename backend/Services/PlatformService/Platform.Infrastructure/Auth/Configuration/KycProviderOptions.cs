using Microsoft.Extensions.Configuration;

namespace AuthService.Infrastructure.Configuration;

/// <summary>
/// Strongly-typed configuration for the real government document-verification provider.
///
/// Bound from the <c>Kyc</c> configuration section plus environment-variable overrides.
/// Secrets (<see cref="ApiKey"/> / <see cref="ApiSecret"/>) MUST come from user-secrets,
/// environment variables, or GCP Secret Manager — never from <c>appsettings.json</c> (SEC-018).
///
/// Defaults target the <b>Sandbox / Quicko</b> tax-API stack (api.sandbox.co.in), the
/// reference aggregator implemented by <c>SandboxKycProvider</c>. All endpoint paths are
/// configurable so the same adapter can be retargeted to another aggregator without a code change.
/// </summary>
public sealed class KycProviderOptions
{
    public const string SectionName = "Kyc";

    /// <summary>Provider key — selects the adapter at DI time. "mock" (default) or "sandbox".</summary>
    public string Provider { get; init; } = "mock";

    /// <summary>Base URL of the aggregator API (no trailing slash).</summary>
    public string BaseUrl { get; init; } = "https://api.sandbox.co.in";

    /// <summary>Value for the <c>x-api-version</c> header.</summary>
    public string ApiVersion { get; init; } = "1.0";

    /// <summary>API key (secret) — sent as <c>x-api-key</c>. Resolved from config/env, never appsettings.</summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>API secret (secret) — sent as <c>x-api-secret</c> on the authenticate call only.</summary>
    public string ApiSecret { get; init; } = string.Empty;

    /// <summary>Per-request HTTP timeout (seconds).</summary>
    public int TimeoutSeconds { get; init; } = 30;

    /// <summary>
    /// Lifetime of the encrypted verdict token used to carry a non-OTP (PAN/GSTIN/TAN)
    /// verification result from the send step to the confirm step. Short by design.
    /// </summary>
    public int VerificationTokenTtlMinutes { get; init; } = 15;

    /// <summary>
    /// "consent" value sent to the aggregator for KYC calls. Required by DPDP / UIDAI —
    /// the customer's consent is captured in the UI before any document is submitted.
    /// </summary>
    public string Consent { get; init; } = "Y";

    /// <summary>Human-readable purpose string sent as the verification "reason".</summary>
    public string Reason { get; init; } = "GST/ITR filing assistance and onboarding for SnapAccount.";

    public KycEndpointOptions Endpoints { get; init; } = new();

    /// <summary>True when both API credentials are present.</summary>
    public bool HasCredentials =>
        !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(ApiSecret);

    /// <summary>
    /// Builds the options from configuration. Reads the <c>Kyc:*</c> section and falls back to
    /// flat environment variables (<c>KYC_PROVIDER</c>, <c>KYC_API_KEY</c>, <c>KYC_API_SECRET</c>,
    /// <c>KYC_BASE_URL</c>) so secrets can be injected without touching appsettings.json.
    /// </summary>
    public static KycProviderOptions FromConfiguration(IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);

        string? Pick(string sectionKey, string? envKey = null) =>
            section[sectionKey]
            ?? (envKey is null ? null : configuration[envKey] ?? Environment.GetEnvironmentVariable(envKey));

        int PickInt(string sectionKey, int fallback) =>
            int.TryParse(section[sectionKey], out var v) ? v : fallback;

        var endpoints = section.GetSection("Endpoints");
        var defaults = new KycEndpointOptions();

        return new KycProviderOptions
        {
            Provider   = configuration["KYC_PROVIDER"]
                         ?? Environment.GetEnvironmentVariable("KYC_PROVIDER")
                         ?? Pick("Provider")
                         ?? "mock",
            BaseUrl    = (Pick("BaseUrl", "KYC_BASE_URL") ?? "https://api.sandbox.co.in").TrimEnd('/'),
            ApiVersion = Pick("ApiVersion") ?? "1.0",
            ApiKey     = Pick("ApiKey", "KYC_API_KEY") ?? string.Empty,
            ApiSecret  = Pick("ApiSecret", "KYC_API_SECRET") ?? string.Empty,
            TimeoutSeconds = PickInt("TimeoutSeconds", 30),
            VerificationTokenTtlMinutes = PickInt("VerificationTokenTtlMinutes", 15),
            Consent    = Pick("Consent") ?? "Y",
            Reason     = Pick("Reason") ?? "GST/ITR filing assistance and onboarding for SnapAccount.",
            Endpoints  = new KycEndpointOptions
            {
                Authenticate      = endpoints["Authenticate"]      ?? defaults.Authenticate,
                PanVerify         = endpoints["PanVerify"]         ?? defaults.PanVerify,
                GstinVerify       = endpoints["GstinVerify"]       ?? defaults.GstinVerify,
                TanVerify         = endpoints["TanVerify"]         ?? defaults.TanVerify,
                AadhaarOtpSend    = endpoints["AadhaarOtpSend"]    ?? defaults.AadhaarOtpSend,
                AadhaarOtpVerify  = endpoints["AadhaarOtpVerify"]  ?? defaults.AadhaarOtpVerify,
            }
        };
    }
}

/// <summary>
/// Endpoint path templates for the aggregator. Defaults match the Sandbox (Quicko) KYC API.
/// </summary>
public sealed class KycEndpointOptions
{
    public string Authenticate     { get; init; } = "/authenticate";
    public string PanVerify        { get; init; } = "/kyc/pan/verify";
    public string GstinVerify      { get; init; } = "/gst/compliance/public/gstin/search";
    /// <summary>Empty by default — Sandbox has no public KYC TAN endpoint; configure to enable.</summary>
    public string TanVerify        { get; init; } = string.Empty;
    public string AadhaarOtpSend   { get; init; } = "/kyc/aadhaar/okyc/otp";
    public string AadhaarOtpVerify { get; init; } = "/kyc/aadhaar/okyc/otp/verify";
}
