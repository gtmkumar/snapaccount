using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// An encrypted API key for an AI provider (one row per provider). The raw key is NEVER stored
/// or returned in plaintext — only the AES-encrypted value plus a last-4 hint for display.
/// Platform-wide (SnapAccount's own provider accounts); managed by Super Admin.
/// </summary>
public class AiProviderKey : BaseAuditableEntity
{
    /// <summary>Provider id: gemini | openai | anthropic | document_ai.</summary>
    public string Provider { get; private set; } = string.Empty;

    /// <summary>AES-encrypted key (IV-prepended Base64). Write-only from the API's perspective.</summary>
    public string EncryptedKey { get; private set; } = string.Empty;

    /// <summary>Last 4 chars of the raw key for a masked display (e.g. ••••1234).</summary>
    public string? KeyLast4 { get; private set; }

    public bool IsConfigured => !string.IsNullOrEmpty(EncryptedKey);

    private AiProviderKey() { }

    public static AiProviderKey Create(string provider, string encryptedKey, string? last4) => new()
    {
        Provider = provider.Trim().ToLowerInvariant(),
        EncryptedKey = encryptedKey,
        KeyLast4 = last4,
    };

    public void SetKey(string encryptedKey, string? last4)
    {
        EncryptedKey = encryptedKey;
        KeyLast4 = last4;
    }
}
