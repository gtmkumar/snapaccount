using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Config.Queries.GetAppVersionPolicy;

/// <summary>
/// GAP-116 — Mobile force-update / minimum-supported-version kill-switch.
/// <para>
/// Returns the version policy for a given client platform so the mobile app can, at launch,
/// either soft-nudge ("update available") or hard-block ("update required") clients running
/// below the supported floor. This is the operational lever for pushing security fixes
/// (e.g. TLS-pin rotation, GAP-006) and retiring vulnerable client builds.
/// </para>
/// <para>
/// Config keys read from <c>appsettings.json</c> (or env / GCP Secret Manager override),
/// per platform (<c>Ios</c> / <c>Android</c>):
/// <code>
///   AppVersion:{Platform}:MinimumSupported  — versions below this are hard-blocked
///   AppVersion:{Platform}:Latest            — newest published build (drives the soft nudge)
///   AppVersion:{Platform}:StoreUrl          — deep link to the store listing
/// </code>
/// </para>
/// <para>
/// Design decisions:
/// <list type="bullet">
///   <item><description>No <c>[RequiresPermission]</c> — the endpoint is anonymous (it runs before
///         login, at app launch).</description></item>
///   <item><description>Never fails: unknown platform or unparseable client version → no block,
///         no nudge (fail-open so a bad input can never brick the app).</description></item>
///   <item><description>Development returns sensible defaults so local dev works without config.</description></item>
/// </list>
/// </para>
/// </summary>
/// <param name="Platform">Client platform — "ios" or "android" (case-insensitive).</param>
/// <param name="CurrentVersion">The client's current app version (e.g. "1.2.3"); optional.</param>
public record GetAppVersionPolicyQuery(string Platform, string? CurrentVersion)
    : IQuery<AppVersionPolicyDto>;

/// <summary>Version policy returned by <c>GET /app/min-version</c>.</summary>
/// <param name="Platform">Normalized platform key ("ios" / "android").</param>
/// <param name="MinimumSupportedVersion">Lowest version still allowed to run.</param>
/// <param name="LatestVersion">Newest published version.</param>
/// <param name="StoreUrl">Store listing URL for the update CTA.</param>
/// <param name="UpdateRequired">True when <c>CurrentVersion</c> is below the supported floor (hard block).</param>
/// <param name="UpdateAvailable">True when a newer version exists (soft nudge).</param>
public record AppVersionPolicyDto(
    string Platform,
    string MinimumSupportedVersion,
    string LatestVersion,
    string StoreUrl,
    bool UpdateRequired,
    bool UpdateAvailable);

/// <summary>
/// Reads <c>AppVersion:{Platform}:*</c> keys from <see cref="IConfiguration"/> and computes the
/// update verdict by comparing the supplied client version against the configured floor / latest.
/// </summary>
public sealed class GetAppVersionPolicyQueryHandler(IConfiguration configuration)
    : IQueryHandler<GetAppVersionPolicyQuery, AppVersionPolicyDto>
{
    private const string DefaultVersion = "1.0.0";

    /// <inheritdoc />
    public Task<Result<AppVersionPolicyDto>> Handle(
        GetAppVersionPolicyQuery request,
        CancellationToken cancellationToken)
    {
        // Normalize platform; anything other than ios/android is treated as "ios" defaults but
        // never blocks (we only block when the configured floor is genuinely above the client).
        var platform = (request.Platform ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "android" => "android",
            _         => "ios",
        };

        var section = $"AppVersion:{(platform == "android" ? "Android" : "Ios")}";

        var minimum = configuration[$"{section}:MinimumSupported"];
        var latest  = configuration[$"{section}:Latest"];
        var storeUrl = configuration[$"{section}:StoreUrl"];

        // Fail-open defaults so a missing config row can never hard-block the entire fleet.
        if (string.IsNullOrWhiteSpace(minimum)) minimum = DefaultVersion;
        if (string.IsNullOrWhiteSpace(latest))  latest  = minimum;
        if (string.IsNullOrWhiteSpace(storeUrl))
        {
            storeUrl = platform == "android"
                ? "https://play.google.com/store/apps/details?id=in.snapaccount.app"
                : "https://apps.apple.com/app/snapaccount/id000000000";
        }

        var updateRequired  = IsLowerThan(request.CurrentVersion, minimum);
        var updateAvailable = updateRequired || IsLowerThan(request.CurrentVersion, latest);

        return Task.FromResult(Result<AppVersionPolicyDto>.Success(
            new AppVersionPolicyDto(
                platform,
                minimum,
                latest,
                storeUrl,
                updateRequired,
                updateAvailable)));
    }

    /// <summary>
    /// True when <paramref name="current"/> parses as a version strictly below <paramref name="threshold"/>.
    /// Unparseable / absent client versions return false (fail-open — never block on bad input).
    /// </summary>
    private static bool IsLowerThan(string? current, string threshold)
    {
        if (string.IsNullOrWhiteSpace(current)
            || !Version.TryParse(Normalize(current), out var currentVersion)
            || !Version.TryParse(Normalize(threshold), out var thresholdVersion))
        {
            return false;
        }

        return currentVersion < thresholdVersion;
    }

    /// <summary>
    /// Strips a leading "v" and any build/pre-release suffix ("1.2.3-beta.1" → "1.2.3") so
    /// <see cref="Version.TryParse(string, out Version)"/> accepts common semver strings.
    /// </summary>
    private static string Normalize(string raw)
    {
        var value = raw.Trim().TrimStart('v', 'V');

        var dashIndex = value.IndexOf('-');
        if (dashIndex >= 0) value = value[..dashIndex];

        var plusIndex = value.IndexOf('+');
        if (plusIndex >= 0) value = value[..plusIndex];

        return value;
    }
}
