using AuthService.Application.Interfaces;

namespace AuthService.Infrastructure.Services.Kyc;

/// <summary>
/// Encodes a non-OTP (PAN / GSTIN / TAN) verification verdict into an opaque, AES-encrypted,
/// time-limited token that doubles as the flow's <c>transactionId</c>.
///
/// <para>Why this exists: PAN/GSTIN/TAN are <b>direct lookups</b> (no real OTP). The two-step
/// send → confirm contract only passes <c>(kind, transactionId, otp)</c> to confirm — the document
/// number is gone by then. So the real verification happens at <b>send</b> time (where the number
/// is available) and its verdict is carried forward inside the <c>transactionId</c> itself.</para>
///
/// <para>Security: the payload is encrypted with the service AES key (<c>ENCRYPTION_KEY</c>), so a
/// client cannot forge a "verified" verdict; tampering yields a decrypt/parse failure which is
/// treated as not-verified. An embedded expiry bounds replay, and the confirm handler additionally
/// binds the token to a specific PENDING record (user + kind + provider_ref).</para>
///
/// Payload (pipe-delimited, pre-encryption): <c>v1|KIND|verifiedFlag|shortProviderRef|expiryUnixSeconds</c>.
/// The encrypted base64 fits inside the 100-char <c>kyc_verification.provider_ref</c> column.
/// </summary>
public sealed class KycVerdictTokenCodec(IEncryptionService encryption, TimeProvider timeProvider)
{
    private const string Version = "v1";
    private const int MaxProviderRefLength = 16;

    /// <summary>Builds an encrypted verdict token for a completed direct verification.</summary>
    public string Encode(string kind, bool verified, string? providerRef, TimeSpan ttl)
    {
        var expiry = timeProvider.GetUtcNow().Add(ttl).ToUnixTimeSeconds();
        var shortRef = Sanitize(providerRef);
        var payload = $"{Version}|{kind}|{(verified ? 1 : 0)}|{shortRef}|{expiry}";
        return encryption.Encrypt(payload);
    }

    /// <summary>
    /// Decodes a verdict token. Returns <c>valid=false</c> if the token cannot be decrypted,
    /// is malformed, is for the wrong kind, or has expired.
    /// </summary>
    public VerdictTokenResult Decode(string token, string expectedKind)
    {
        string plaintext;
        try
        {
            plaintext = encryption.Decrypt(token);
        }
        catch
        {
            // Not one of our tokens (or tampered) — caller treats as not-verified.
            return VerdictTokenResult.Invalid;
        }

        var parts = plaintext.Split('|');
        if (parts.Length != 5 || parts[0] != Version)
            return VerdictTokenResult.Invalid;

        var kind = parts[1];
        if (!string.Equals(kind, expectedKind, StringComparison.OrdinalIgnoreCase))
            return VerdictTokenResult.Invalid;

        if (!long.TryParse(parts[4], out var expiryUnix))
            return VerdictTokenResult.Invalid;

        if (timeProvider.GetUtcNow().ToUnixTimeSeconds() > expiryUnix)
            return VerdictTokenResult.Invalid;

        var verified = parts[2] == "1";
        var providerRef = string.IsNullOrEmpty(parts[3]) ? null : parts[3];
        return new VerdictTokenResult(IsValid: true, Verified: verified, ProviderRef: providerRef);
    }

    /// <summary>Strips delimiters and truncates the provider reference to keep the token compact.</summary>
    private static string Sanitize(string? providerRef)
    {
        if (string.IsNullOrEmpty(providerRef))
            return string.Empty;
        var cleaned = providerRef.Replace("|", string.Empty).Replace("-", string.Empty);
        return cleaned.Length <= MaxProviderRefLength ? cleaned : cleaned[..MaxProviderRefLength];
    }
}

/// <summary>Outcome of decoding a verdict token.</summary>
/// <param name="IsValid">False when the token is forged, malformed, wrong-kind, or expired.</param>
/// <param name="Verified">The verdict carried by a valid token.</param>
/// <param name="ProviderRef">Short provider reference embedded at encode time.</param>
public readonly record struct VerdictTokenResult(bool IsValid, bool Verified, string? ProviderRef)
{
    public static readonly VerdictTokenResult Invalid = new(false, false, null);
}
