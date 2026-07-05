using AccountingService.Domain.Entities;

namespace AccountingService.Application.Interfaces;

/// <summary>
/// Repository contract for the <see cref="Account"/> aggregate root (Chart of Accounts).
/// </summary>
public interface IAccountRepository
{
    /// <summary>Returns an account by its identifier, or null when not found.</summary>
    Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Returns all accounts for an organisation.</summary>
    Task<IReadOnlyList<Account>> GetByOrganizationAsync(Guid organizationId, CancellationToken ct = default);

    /// <summary>Persists a new account and returns the saved entity.</summary>
    Task<Account> AddAsync(Account account, CancellationToken ct = default);

    /// <summary>Persists changes to an existing account.</summary>
    Task UpdateAsync(Account account, CancellationToken ct = default);
}
