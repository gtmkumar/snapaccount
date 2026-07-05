namespace AuthService.Application.Interfaces;

/// <summary>
/// Application-layer abstraction over the PBKDF2 password hasher so that
/// <c>CreateUserAdminCommandHandler</c> (Application layer) can hash passwords
/// without taking a dependency on <c>AuthService.Infrastructure</c>.
/// </summary>
public interface IPasswordHasher
{
    /// <summary>Produces a <c>pbkdf2$iterations$salt$key</c> hash of <paramref name="password"/>.</summary>
    string Hash(string password);

    /// <summary>Verifies <paramref name="password"/> against a stored hash. False if the hash is null/empty.</summary>
    bool Verify(string password, string? stored);
}
