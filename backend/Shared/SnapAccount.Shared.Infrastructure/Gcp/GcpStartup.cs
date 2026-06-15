using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

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
///
/// GAP-053: Previously, call-sites that checked <see cref="IsEnabled"/> and branched
/// silently gave no indication in logs that GCP services were being skipped. Use
/// <see cref="IsEnabledWithLogging"/> in DI registrations that conditionally register
/// hosted services (Pub/Sub subscribers, DPDP erasure jobs, etc.) so that the disabled
/// path is always visible in the service startup log.
/// </summary>
public static class GcpStartup
{
    /// <summary>Returns true when GCP-dependent services should start.</summary>
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

    /// <summary>
    /// GAP-053: Same as <see cref="IsEnabled"/>, but emits a structured warning log
    /// via <paramref name="logger"/> when GCP is disabled so that the silent-skip path
    /// is always observable in service startup logs.
    /// </summary>
    /// <param name="configuration">The service's configuration root.</param>
    /// <param name="logger">Logger for the calling service's DI bootstrap context.</param>
    /// <param name="serviceName">
    ///   Human-readable name of the hosted service being conditionally skipped
    ///   (e.g. "GstRecurringJobsSubscriber"). Included in the warning message.
    /// </param>
    /// <returns>True when GCP is active; false when skipped.</returns>
    public static bool IsEnabledWithLogging(
        IConfiguration configuration,
        ILogger logger,
        string serviceName)
    {
        var enabled = IsEnabled(configuration);
        if (!enabled)
        {
            logger.LogWarning(
                "GAP-053 GcpStartup: {ServiceName} skipped — GCP is disabled " +
                "(DISABLE_GCP=true or Development environment without Firebase credentials). " +
                "Set GCP_ENABLED=true or provide Firebase:ServiceAccountJson to activate.",
                serviceName);
        }
        return enabled;
    }
}
