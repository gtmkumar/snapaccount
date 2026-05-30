using Microsoft.Extensions.Configuration;

namespace SnapAccount.Shared.Infrastructure.Gcp;

/// <summary>
/// Decides whether GCP-dependent startup work (Firebase Admin init, Pub/Sub
/// subscribers, etc.) should run. Lets services boot on a local machine WITHOUT
/// Google Application Default Credentials so the whole stack can be developed and
/// tested locally; real GCP is wired later (production / staging unaffected).
///
/// Rules (first match wins):
///   1. GCP_ENABLED=true            → enabled  (force-on, e.g. dev box with ADC)
///   2. DISABLE_GCP=true            → disabled (force-off)
///   3. Development + no Firebase creds → disabled (the default local-dev case)
///   4. otherwise                   → enabled  (staging/production)
///
/// When disabled, FirebaseAuthMiddleware is expected to be bypassed via
/// DEV_AUTH_BYPASS, and Pub/Sub publishers/subscribers are skipped.
/// </summary>
public static class GcpStartup
{
    public static bool IsEnabled(IConfiguration configuration)
    {
        if (configuration.GetValue<bool>("GCP_ENABLED")) return true;
        if (configuration.GetValue<bool>("DISABLE_GCP")) return false;

        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
        var hasFirebaseCreds = !string.IsNullOrEmpty(configuration["Firebase:ServiceAccountJson"]);

        // Local dev with no explicit Firebase credentials → run GCP-free.
        return !(isDevelopment && !hasFirebaseCreds);
    }
}
