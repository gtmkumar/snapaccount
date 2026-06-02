using AuthService.Application.Interfaces;

namespace AuthService.Infrastructure.Auth;

/// <summary>Wraps the static <see cref="PasswordHasher"/> as an injectable service.</summary>
public sealed class PasswordHasherAdapter : IPasswordHasher
{
    /// <inheritdoc />
    public string Hash(string password) => PasswordHasher.Hash(password);

    /// <inheritdoc />
    public bool Verify(string password, string? stored) => PasswordHasher.Verify(password, stored);
}
