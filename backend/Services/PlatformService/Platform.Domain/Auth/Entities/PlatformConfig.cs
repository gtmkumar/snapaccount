using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// Generic key-value config store in <c>auth.platform_config</c>.
/// Stores JSON blobs keyed by <see cref="ConfigKey"/>.
/// Used for language settings, WhatsApp integration config, and similar
/// platform-wide settings that don't warrant dedicated entities.
/// SEC-056: backed entity for GET/PATCH /auth/config/language and /auth/config/whatsapp.
/// </summary>
public class PlatformConfig : BaseAuditableEntity
{
    /// <summary>
    /// Unique config key, e.g. <c>"language"</c>, <c>"whatsapp"</c>.
    /// Max 100 chars.
    /// </summary>
    public string ConfigKey { get; private set; } = string.Empty;

    /// <summary>
    /// JSON blob containing the config value.
    /// Stored as JSONB in Postgres for efficient partial updates via GIN indexing.
    /// </summary>
    public string ConfigValueJson { get; private set; } = "{}";

    private PlatformConfig() { }

    /// <summary>Creates a new platform config row.</summary>
    public static PlatformConfig Create(string configKey, string configValueJson)
        => new() { ConfigKey = configKey, ConfigValueJson = configValueJson };

    /// <summary>Updates the JSON blob value.</summary>
    public void SetValue(string configValueJson) => ConfigValueJson = configValueJson;
}
