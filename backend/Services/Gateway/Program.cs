using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

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

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.UseForwardedHeaders();

app.MapDefaultEndpoints();

app.UseCors();

app.UseRateLimiter();

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", service = "api-gateway" }));

app.MapReverseProxy();

app.Run();
