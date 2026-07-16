using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.DependencyInjection;

namespace SnapAccount.Shared.Api;

// Response compression for the composite hosts (Platform/Finance/Assist). The thin YARP gateway
// configures the same thing via ServiceDefaults.AddDefaultResponseCompression — the gateway must
// stay dependency-light, so we intentionally do NOT reference Shared.Api from it. Keep the two in
// sync if you change providers/levels/MIME types.
public static class ResponseCompressionExtensions
{
    // Compresses JSON/text responses in transit (gzip + brotli), negotiated via the client's
    // Accept-Encoding header. API payloads (lists, reports, dashboards) are highly compressible
    // text, so this cuts transfer size ~70-90% — the largest win for the mobile app and admin
    // panel on India's mobile networks. Register in DI, then call app.UseResponseCompression()
    // as the first middleware so it wraps every response body.
    //
    // Design choices:
    //  - Brotli + Gzip providers; brotli preferred when the client advertises it (br > gzip).
    //  - CompressionLevel.Fastest for BOTH: these are dynamic, per-request responses, so we trade
    //    a few percent of ratio for far lower CPU/latency (Brotli 'Optimal' = quality 11 is a known
    //    footgun for on-the-fly content on Cloud Run). Fastest still yields the bulk of the savings.
    //  - EnableForHttps = true: our traffic is HTTPS end-to-end, so compression is useless unless we
    //    opt in. Auth is via bearer tokens in request headers, not compressed response bodies, so the
    //    BREACH threat model does not apply to these API responses.
    //  - MimeTypes: only text/JSON families. Already-compressed payloads (images, PDF, zip) are
    //    excluded, and the middleware also skips any response that already carries a Content-Encoding
    //    header — so origin-compressed responses proxied through the gateway are never double-compressed.
    public static IServiceCollection AddDefaultResponseCompression(this IServiceCollection services)
    {
        services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            options.MimeTypes =
            [
                "text/plain",
                "text/css",
                "text/html",
                "text/xml",
                "text/json",
                "text/csv",
                "text/javascript",
                "application/javascript",
                "application/xml",
                "application/json",
                "application/problem+json",
                "application/manifest+json",
                "application/wasm",
                "image/svg+xml",
            ];
        });

        services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
        services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

        return services;
    }
}
