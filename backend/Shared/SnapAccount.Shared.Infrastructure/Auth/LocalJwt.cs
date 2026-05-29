using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SnapAccount.Shared.Infrastructure.Auth;

/// <summary>
/// Minimal, dependency-free HS256 JWT used ONLY by LOCAL_AUTH dev mode.
/// AuthService issues these on username/password login; the shared
/// <see cref="FirebaseAuthMiddleware"/> validates them when LOCAL_AUTH=true.
/// NEVER enabled in staging or production — those use Firebase ID tokens.
/// </summary>
public static class LocalJwt
{
    public static string Issue(IReadOnlyDictionary<string, object?> claims, string secret, TimeSpan lifetime)
    {
        var now = DateTimeOffset.UtcNow;
        var header = new Dictionary<string, object?> { ["alg"] = "HS256", ["typ"] = "JWT" };
        var payload = new Dictionary<string, object?>(claims)
        {
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = now.Add(lifetime).ToUnixTimeSeconds(),
            ["iss"] = "snapaccount-local",
        };

        var encodedHeader = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header));
        var encodedPayload = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload));
        var signingInput = $"{encodedHeader}.{encodedPayload}";
        var signature = Base64UrlEncode(Hmac(signingInput, secret));
        return $"{signingInput}.{signature}";
    }

    /// <summary>
    /// Validates signature and expiry. Returns the decoded payload, or null if invalid/expired.
    /// </summary>
    public static JsonElement? Validate(string token, string secret)
    {
        var parts = token.Split('.');
        if (parts.Length != 3)
            return null;

        var signingInput = $"{parts[0]}.{parts[1]}";
        var expectedSignature = Base64UrlEncode(Hmac(signingInput, secret));
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expectedSignature),
                Encoding.ASCII.GetBytes(parts[2])))
            return null;

        JsonElement payload;
        try
        {
            payload = JsonDocument.Parse(Base64UrlDecode(parts[1])).RootElement.Clone();
        }
        catch
        {
            return null;
        }

        if (payload.TryGetProperty("exp", out var exp) &&
            exp.TryGetInt64(out var expSeconds) &&
            DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expSeconds)
            return null;

        return payload;
    }

    private static byte[] Hmac(string input, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(input));
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        s += (s.Length % 4) switch { 2 => "==", 3 => "=", _ => "" };
        return Convert.FromBase64String(s);
    }
}
