using System.Security.Cryptography;

namespace AuthService.Infrastructure.Auth;

/// <summary>
/// PBKDF2 (SHA-256) password hashing for LOCAL_AUTH dev login.
/// Format: pbkdf2${iterations}${saltB64}${keyB64}
/// </summary>
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 100_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"pbkdf2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string? stored)
    {
        if (string.IsNullOrEmpty(stored))
            return false;

        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2")
            return false;

        if (!int.TryParse(parts[1], out var iterations))
            return false;

        byte[] salt, key;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            key = Convert.FromBase64String(parts[3]);
        }
        catch
        {
            return false;
        }

        var candidate = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, key.Length);
        return CryptographicOperations.FixedTimeEquals(candidate, key);
    }
}
