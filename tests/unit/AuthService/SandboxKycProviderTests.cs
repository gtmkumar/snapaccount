using System.Net;
using System.Text;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Configuration;
using AuthService.Infrastructure.Services;
using AuthService.Infrastructure.Services.Kyc;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for the real Sandbox (Quicko) KYC adapter and its supporting pieces.
/// HTTP is faked with a stub <see cref="HttpMessageHandler"/>; no network access.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SandboxKycProviderTests
{
    private const string AuthOk = """{"code":200,"data":{"access_token":"jwt-token-abc"},"transaction_id":"auth-tx"}""";

    // ── Stub HTTP plumbing ────────────────────────────────────────────────────

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public readonly List<string> Paths = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Paths.Add(request.RequestUri!.AbsolutePath);
            return Task.FromResult(responder(request));
        }
    }

    private static HttpResponseMessage Json(int code, string body) =>
        new((HttpStatusCode)code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static KycProviderOptions Options(bool withCreds = true, string tanEndpoint = "") => new()
    {
        Provider   = "sandbox",
        BaseUrl    = "https://test-api.sandbox.co.in",
        ApiVersion = "1.0",
        ApiKey     = withCreds ? "key-123" : string.Empty,
        ApiSecret  = withCreds ? "secret-123" : string.Empty,
        VerificationTokenTtlMinutes = 15,
        Endpoints  = new KycEndpointOptions { TanVerify = tanEndpoint },
    };

    private static (SandboxKycProvider provider, StubHandler handler) Build(
        Func<HttpRequestMessage, HttpResponseMessage> responder, KycProviderOptions? options = null)
    {
        var opts = options ?? Options();
        var handler = new StubHandler(responder);
        var client = new HttpClient(handler) { BaseAddress = new Uri(opts.BaseUrl) };

        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);

        var encryption = new AesEncryptionService(
            new ConfigurationBuilder().Build(), NullLogger<AesEncryptionService>.Instance);
        var codec = new KycVerdictTokenCodec(encryption, TimeProvider.System);
        var tokenProvider = new SandboxAccessTokenProvider(
            factory.Object, opts, NullLogger<SandboxAccessTokenProvider>.Instance);

        var provider = new SandboxKycProvider(
            factory.Object, tokenProvider, codec, opts, NullLogger<SandboxKycProvider>.Instance);
        return (provider, handler);
    }

    private static HttpResponseMessage Route(HttpRequestMessage req, Dictionary<string, HttpResponseMessage> byPath)
    {
        var path = req.RequestUri!.AbsolutePath;
        return byPath.TryGetValue(path, out var resp) ? resp : Json(404, "{}");
    }

    // ── Metadata ──────────────────────────────────────────────────────────────

    [Fact]
    public void ProviderName_IsSandbox()
    {
        var (provider, _) = Build(_ => Json(200, AuthOk));
        provider.ProviderName.Should().Be("sandbox");
    }

    // ── Aadhaar (genuine two-step OTP) ─────────────────────────────────────────

    [Fact]
    public async Task SendOtp_Aadhaar_ReturnsProviderReferenceId()
    {
        var (provider, handler) = Build(req => Route(req, new()
        {
            ["/authenticate"]            = Json(200, AuthOk),
            ["/kyc/aadhaar/okyc/otp"]    = Json(200,
                """{"code":200,"data":{"reference_id":"1234567","message":"OTP sent successfully"},"transaction_id":"tx-aad"}"""),
        }));

        var result = await provider.SendOtpAsync(KycKind.Aadhaar, "123456789012");

        result.TransactionId.Should().Be("1234567");
        handler.Paths.Should().Contain("/authenticate");
        handler.Paths.Should().Contain("/kyc/aadhaar/okyc/otp");
    }

    [Fact]
    public async Task VerifyOtp_Aadhaar_StatusValid_ReturnsVerified()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]                  = Json(200, AuthOk),
            ["/kyc/aadhaar/okyc/otp/verify"]   = Json(200,
                """{"code":200,"data":{"status":"VALID","name":"John Doe"},"transaction_id":"tx-v"}"""),
        }));

        var result = await provider.VerifyOtpAsync(KycKind.Aadhaar, "1234567", "123456");

        result.Status.Should().Be(KycStatus.Verified);
        result.ProviderRef.Should().Be("tx-v");
    }

    [Fact]
    public async Task VerifyOtp_Aadhaar_WrongOtp_4xx_ReturnsFailed()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]                = Json(200, AuthOk),
            ["/kyc/aadhaar/okyc/otp/verify"] = Json(422,
                """{"code":422,"message":"Invalid OTP"}"""),
        }));

        var result = await provider.VerifyOtpAsync(KycKind.Aadhaar, "1234567", "000000");

        result.Status.Should().Be(KycStatus.Failed);
    }

    // ── PAN / GSTIN / TAN (direct verify, verdict carried in the token) ────────

    [Fact]
    public async Task Pan_ValidDocument_SendThenVerify_RoundTripsToVerified()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]   = Json(200, AuthOk),
            ["/kyc/pan/verify"] = Json(200,
                """{"code":200,"transaction_id":"pan-tx","data":{"status":"valid","name_as_per_pan_match":true}}"""),
        }));

        var send = await provider.SendOtpAsync(KycKind.Pan, "ABCDE1234F");
        send.TransactionId.Should().NotBeNullOrEmpty();
        send.TransactionId.Length.Should().BeLessThanOrEqualTo(100, "token must fit the provider_ref column");

        // OTP value is irrelevant for non-OTP kinds — verdict was sealed at send time.
        var verify = await provider.VerifyOtpAsync(KycKind.Pan, send.TransactionId, "any-otp");
        verify.Status.Should().Be(KycStatus.Verified);
    }

    [Fact]
    public async Task Pan_InvalidDocument_RoundTripsToFailed()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]   = Json(200, AuthOk),
            ["/kyc/pan/verify"] = Json(200,
                """{"code":200,"transaction_id":"pan-tx","data":{"status":"invalid"}}"""),
        }));

        var send   = await provider.SendOtpAsync(KycKind.Pan, "ABCDE1234F");
        var verify = await provider.VerifyOtpAsync(KycKind.Pan, send.TransactionId, "any-otp");

        verify.Status.Should().Be(KycStatus.Failed);
    }

    [Fact]
    public async Task Pan_4xxFromProvider_TreatedAsNotVerified()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]   = Json(200, AuthOk),
            ["/kyc/pan/verify"] = Json(422, """{"code":422,"message":"name_as_per_pan required"}"""),
        }));

        var send   = await provider.SendOtpAsync(KycKind.Pan, "ABCDE1234F");
        var verify = await provider.VerifyOtpAsync(KycKind.Pan, send.TransactionId, "x");

        verify.Status.Should().Be(KycStatus.Failed);
    }

    [Fact]
    public async Task Gstin_ActiveStatus_RoundTripsToVerified()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]                          = Json(200, AuthOk),
            ["/gst/compliance/public/gstin/search"]    = Json(200,
                """{"code":200,"transaction_id":"gst-tx","data":{"gstin":"29ABCDE1234F1Z5","sts":"Active","lgnm":"Vicky Pvt Ltd"}}"""),
        }));

        var send   = await provider.SendOtpAsync(KycKind.Gstin, "29ABCDE1234F1Z5");
        var verify = await provider.VerifyOtpAsync(KycKind.Gstin, send.TransactionId, "any");

        verify.Status.Should().Be(KycStatus.Verified);
    }

    [Fact]
    public async Task Tan_NoEndpointConfigured_NotVerified_AndMakesNoHttpCall()
    {
        var (provider, handler) = Build(_ => Json(200, AuthOk), Options(tanEndpoint: ""));

        var send   = await provider.SendOtpAsync(KycKind.Tan, "PNES03028F");
        var verify = await provider.VerifyOtpAsync(KycKind.Tan, send.TransactionId, "x");

        verify.Status.Should().Be(KycStatus.Failed);
        handler.Paths.Should().BeEmpty("TAN with no endpoint must not hit the network");
    }

    [Fact]
    public async Task Tan_EndpointConfigured_ValidStatus_Verified()
    {
        var opts = Options(tanEndpoint: "/kyc/tan/verify");
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]    = Json(200, AuthOk),
            ["/kyc/tan/verify"]  = Json(200, """{"code":200,"transaction_id":"tan-tx","data":{"status":"valid"}}"""),
        }), opts);

        var send   = await provider.SendOtpAsync(KycKind.Tan, "PNES03028F");
        var verify = await provider.VerifyOtpAsync(KycKind.Tan, send.TransactionId, "x");

        verify.Status.Should().Be(KycStatus.Verified);
    }

    // ── Verdict-token integrity ────────────────────────────────────────────────

    [Fact]
    public async Task VerifyOtp_NonOtpKind_TamperedTransactionId_ReturnsFailed()
    {
        var (provider, _) = Build(_ => Json(200, AuthOk));

        var verify = await provider.VerifyOtpAsync(KycKind.Pan, "not-a-real-token!!", "x");

        verify.Status.Should().Be(KycStatus.Failed);
    }

    // ── Auth token caching & 401 refresh ───────────────────────────────────────

    [Fact]
    public async Task AccessToken_IsCachedAcrossCalls_AuthenticateOnce()
    {
        var (provider, handler) = Build(req => Route(req, new()
        {
            ["/authenticate"]         = Json(200, AuthOk),
            ["/kyc/aadhaar/okyc/otp"] = Json(200,
                """{"code":200,"data":{"reference_id":"111"},"transaction_id":"t"}"""),
        }));

        await provider.SendOtpAsync(KycKind.Aadhaar, "123456789012");
        await provider.SendOtpAsync(KycKind.Aadhaar, "123456789012");

        handler.Paths.Count(p => p == "/authenticate").Should().Be(1, "token cached after first auth");
    }

    [Fact]
    public async Task Unauthorized_TriggersTokenRefreshAndRetry()
    {
        var panCalls = 0;
        var (provider, handler) = Build(req =>
        {
            var path = req.RequestUri!.AbsolutePath;
            if (path == "/authenticate") return Json(200, AuthOk);
            if (path == "/kyc/pan/verify")
            {
                panCalls++;
                return panCalls == 1
                    ? Json(401, """{"code":401,"message":"expired"}""")
                    : Json(200, """{"code":200,"transaction_id":"t","data":{"status":"valid"}}""");
            }
            return Json(404, "{}");
        });

        var send   = await provider.SendOtpAsync(KycKind.Pan, "ABCDE1234F");
        var verify = await provider.VerifyOtpAsync(KycKind.Pan, send.TransactionId, "x");

        verify.Status.Should().Be(KycStatus.Verified);
        panCalls.Should().Be(2, "first 401 forces a refresh + one retry");
        handler.Paths.Count(p => p == "/authenticate").Should().Be(2, "401 forced a second authenticate");
    }

    // ── Misconfiguration ───────────────────────────────────────────────────────

    [Fact]
    public async Task MissingCredentials_Throws()
    {
        var (provider, _) = Build(_ => Json(200, AuthOk), Options(withCreds: false));

        var act = async () => await provider.SendOtpAsync(KycKind.Pan, "ABCDE1234F");

        await act.Should().ThrowAsync<KycProviderException>();
    }

    // ── Legacy IKycProvider surface ────────────────────────────────────────────

    [Fact]
    public async Task LegacyVerifyPan_ValidStatus_ReturnsVerified()
    {
        var (provider, _) = Build(req => Route(req, new()
        {
            ["/authenticate"]   = Json(200, AuthOk),
            ["/kyc/pan/verify"] = Json(200, """{"code":200,"transaction_id":"t","data":{"status":"valid"}}"""),
        }));

        var result = await ((IKycProvider)provider).VerifyPanAsync("ABCDE1234F", "John Doe");

        result.Status.Should().Be(KycStatus.Verified);
    }
}

/// <summary>Unit tests for the encrypted verdict token codec.</summary>
[Trait("Category", "Unit")]
public sealed class KycVerdictTokenCodecTests
{
    private static KycVerdictTokenCodec Codec(TimeProvider? time = null)
    {
        var encryption = new AesEncryptionService(
            new ConfigurationBuilder().Build(), NullLogger<AesEncryptionService>.Instance);
        return new KycVerdictTokenCodec(encryption, time ?? TimeProvider.System);
    }

    [Fact]
    public void EncodeDecode_Verified_RoundTrips()
    {
        var codec = Codec();
        var token = codec.Encode(KycKind.Pan, verified: true, "pan-tx-123", TimeSpan.FromMinutes(15));

        var decoded = codec.Decode(token, KycKind.Pan);

        decoded.IsValid.Should().BeTrue();
        decoded.Verified.Should().BeTrue();
        token.Length.Should().BeLessThanOrEqualTo(100);
    }

    [Fact]
    public void Decode_WrongKind_IsInvalid()
    {
        var codec = Codec();
        var token = codec.Encode(KycKind.Pan, true, "x", TimeSpan.FromMinutes(15));

        codec.Decode(token, KycKind.Gstin).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Decode_Expired_IsInvalid()
    {
        var start = new FakeTimeProvider(DateTimeOffset.UnixEpoch.AddYears(56));
        var codec = Codec(start);
        var token = codec.Encode(KycKind.Pan, true, "x", TimeSpan.FromMinutes(5));

        start.Advance(TimeSpan.FromMinutes(6));

        codec.Decode(token, KycKind.Pan).IsValid.Should().BeFalse("token TTL elapsed");
    }

    [Fact]
    public void Decode_Garbage_IsInvalid()
    {
        Codec().Decode("not-a-token", KycKind.Pan).IsValid.Should().BeFalse();
    }

    /// <summary>Minimal controllable TimeProvider for expiry tests.</summary>
    private sealed class FakeTimeProvider(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;
        public void Advance(TimeSpan by) => _now = _now.Add(by);
        public override DateTimeOffset GetUtcNow() => _now;
    }
}
