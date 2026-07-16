using System.Diagnostics;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Trust the X-Forwarded-* headers added by Cloud Run / Google Cloud Load Balancer so the
// rate limiter partitions on the real client IP rather than the proxy hop. The proxy is not
// in the default known-networks list, so we must clear it (standard Cloud Run configuration).
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Expo web (:8081), admin Vite (:3000+), any local dev port on loopback.
            p.SetIsOriginAllowed(origin =>
                !string.IsNullOrEmpty(origin)
                && Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                && uri.Host is "localhost" or "127.0.0.1");
        }
        else
        {
            p.WithOrigins(
                builder.Configuration["AllowedOrigins:AdminPanel"] ?? "https://admin.snapaccount.in",
                builder.Configuration["AllowedOrigins:Mobile"] ?? "https://snapaccount.in");
        }

        p.AllowAnyMethod().AllowAnyHeader().AllowCredentials();
    }));

// ── Edge rate limiting (project-brief §6) ─────────────────────────────────────
// A global, per-client-IP sliding-window limiter at the gateway protects every
// downstream composite from floods/abuse before traffic fans out — complementing the
// per-endpoint OTP limits inside the services (SEC-011). All knobs are config-driven
// (RateLimiting:*) so ops can tune without a redeploy; /healthz and Aspire liveness
// endpoints are exempt so probes are never throttled.
var rateLimitEnabled = builder.Configuration.GetValue<bool?>("RateLimiting:Enabled") ?? true;
var permitLimit = builder.Configuration.GetValue<int?>("RateLimiting:PermitLimit") ?? 600;
var windowSeconds = builder.Configuration.GetValue<int?>("RateLimiting:WindowSeconds") ?? 60;
var segmentsPerWindow = builder.Configuration.GetValue<int?>("RateLimiting:SegmentsPerWindow") ?? 6;
var queueLimit = builder.Configuration.GetValue<int?>("RateLimiting:QueueLimit") ?? 0;

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
    {
        var path = httpContext.Request.Path;
        if (!rateLimitEnabled
            || path.StartsWithSegments("/healthz")
            || path.StartsWithSegments("/alive"))
        {
            return RateLimitPartition.GetNoLimiter("exempt");
        }

        var clientKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        return RateLimitPartition.GetSlidingWindowLimiter(clientKey, _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = TimeSpan.FromSeconds(windowSeconds),
            SegmentsPerWindow = segmentsPerWindow,
            QueueLimit = queueLimit,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
        });
    });

    options.OnRejected = async (context, cancellationToken) =>
    {
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString();

        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "rate_limited", message = "Too many requests. Please retry shortly." },
            cancellationToken);
    };
});

// ── Edge request logging & correlation-id propagation (project-brief §6, GAP-114) ──
// YARP copies inbound headers downstream by default, but it never *mints* a correlation id
// when the client omits one, so a request that fans out to several composites has no single
// id tying the edge access log to the per-service logs. This transform stamps the id the
// gateway minted (see the CorrelationId middleware below) onto every proxied request, so the
// composites' OpenTelemetry traces and our edge access log share one X-Correlation-Id.
const string CorrelationIdHeader = "X-Correlation-Id";

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(transformBuilderContext =>
    {
        transformBuilderContext.AddRequestTransform(transformContext =>
        {
            if (transformContext.HttpContext.Items.TryGetValue(CorrelationIdHeader, out var value)
                && value is string correlationId
                && !string.IsNullOrEmpty(correlationId))
            {
                transformContext.ProxyRequest.Headers.Remove(CorrelationIdHeader);
                transformContext.ProxyRequest.Headers.TryAddWithoutValidation(
                    CorrelationIdHeader, correlationId);
            }

            return ValueTask.CompletedTask;
        });
    });

var app = builder.Build();

app.UseForwardedHeaders();

// Compress the gateway's own responses (health, 429 bodies) and any proxied response that the
// origin composite left uncompressed. Origin-compressed responses already carry a Content-Encoding
// header, which this middleware detects and passes through untouched — no double-compression.
// Configured in ServiceDefaults.AddDefaultResponseCompression.
app.UseResponseCompression();

// Mint/honour a correlation id, echo it on the response, and emit one structured access-log
// line per request (method, path, status, latency, client-IP, correlation-id). Registered
// first so it wraps the rate limiter — throttled (429) requests are logged and correlated too.
app.Use(async (context, next) =>
{
    var correlationId = context.Request.Headers[CorrelationIdHeader].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(correlationId))
        correlationId = Guid.NewGuid().ToString("N");

    context.Items[CorrelationIdHeader] = correlationId;
    context.Response.Headers[CorrelationIdHeader] = correlationId;

    var stopwatch = Stopwatch.StartNew();
    try
    {
        await next();
    }
    finally
    {
        stopwatch.Stop();
        app.Logger.LogInformation(
            "gateway {Method} {Path} -> {StatusCode} in {ElapsedMs}ms cid={CorrelationId} ip={ClientIp}",
            context.Request.Method,
            context.Request.Path.Value,
            context.Response.StatusCode,
            stopwatch.ElapsedMilliseconds,
            correlationId,
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    }
});

app.MapDefaultEndpoints();

app.UseCors();

app.UseRateLimiter();

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", service = "api-gateway" }));

app.MapReverseProxy();

app.Run();
