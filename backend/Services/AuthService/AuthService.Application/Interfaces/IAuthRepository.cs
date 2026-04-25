using AuthService.Domain.Entities;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// SEC-016: Loads the user within a SERIALIZABLE transaction scope.
    /// Use for operations that check-then-modify critical bounded counts (e.g., max device limit).
    /// </summary>
    Task<User?> GetByIdWithSerializableTransactionAsync(Guid id, CancellationToken ct = default);

    Task<User?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken ct = default);
    Task<User?> GetByFirebaseUidAsync(string firebaseUid, CancellationToken ct = default);
    Task<User> AddAsync(User user, CancellationToken ct = default);
    Task UpdateAsync(User user, CancellationToken ct = default);
    Task<IReadOnlyList<UserDevice>> GetDevicesAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<Organization>> GetOrganizationsAsync(Guid userId, CancellationToken ct = default);
}

public interface IOrganizationRepository
{
    Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Organization> AddAsync(Organization organization, CancellationToken ct = default);
    Task UpdateAsync(Organization organization, CancellationToken ct = default);
}

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken ct = default);
    Task<RefreshToken> AddAsync(RefreshToken token, CancellationToken ct = default);
    Task UpdateAsync(RefreshToken token, CancellationToken ct = default);
    Task RevokeAllForUserAsync(Guid userId, string reason, CancellationToken ct = default);
}
