using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A runtime feature flag stored in <c>auth.feature_flag</c>.
/// Flags enable/disable product features without redeployment.
/// SEC-056: backed entity for PATCH /auth/feature-flags/{flag}.
/// </summary>
public class FeatureFlag : BaseAuditableEntity
{
    /// <summary>Lowercase dot-separated key, e.g. "ai.ocr", "loan.digital-lending".</summary>
    public string FlagKey { get; private set; } = string.Empty;

    /// <summary>Whether the feature is currently enabled.</summary>
    public bool IsEnabled { get; private set; }

    /// <summary>Optional human-readable description of what the flag controls.</summary>
    public string? Description { get; private set; }

    private FeatureFlag() { }

    /// <summary>Creates a new feature flag row.</summary>
    public static FeatureFlag Create(string flagKey, bool isEnabled, string? description = null)
        => new() { FlagKey = flagKey, IsEnabled = isEnabled, Description = description };

    /// <summary>Toggles the flag to <paramref name="enabled"/>.</summary>
    public void SetEnabled(bool enabled) => IsEnabled = enabled;
}
