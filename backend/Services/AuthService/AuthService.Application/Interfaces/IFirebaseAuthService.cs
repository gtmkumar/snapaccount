using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

public interface IFirebaseAuthService
{
    Task<Result<string>> VerifyIdTokenAsync(string idToken, CancellationToken ct = default);
    Task<Result<string>> CreateCustomTokenAsync(string uid, IDictionary<string, object>? claims = null, CancellationToken ct = default);
    Task<Result> SetCustomClaimsAsync(string uid, IDictionary<string, object> claims, CancellationToken ct = default);
    Task<Result> RevokeRefreshTokensAsync(string uid, CancellationToken ct = default);
}
