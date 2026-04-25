using LoanService.Domain.Entities;

namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Factory for resolving the correct <see cref="IPartnerBankAdapter"/> by adapter type.
/// DI registration maps BankAdapterType → concrete adapter.
/// </summary>
public interface IPartnerBankAdapterFactory
{
    /// <summary>Returns the adapter for the given bank adapter type.</summary>
    IPartnerBankAdapter GetAdapter(BankAdapterType adapterType);
}
