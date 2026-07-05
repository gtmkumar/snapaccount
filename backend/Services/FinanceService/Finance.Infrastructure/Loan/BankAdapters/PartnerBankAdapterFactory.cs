using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.Extensions.DependencyInjection;

namespace LoanService.Infrastructure.BankAdapters;

/// <summary>
/// Factory that resolves the correct IPartnerBankAdapter by adapter type.
/// Registered as a keyed DI resolution using IServiceProvider.
/// </summary>
public sealed class PartnerBankAdapterFactory(IServiceProvider serviceProvider) : IPartnerBankAdapterFactory
{
    /// <inheritdoc />
    public IPartnerBankAdapter GetAdapter(BankAdapterType adapterType)
        => adapterType switch
        {
            BankAdapterType.Email => serviceProvider.GetRequiredKeyedService<IPartnerBankAdapter>("email"),
            BankAdapterType.Rest or BankAdapterType.OAuth =>
                serviceProvider.GetRequiredKeyedService<IPartnerBankAdapter>("rest"),
            _ => throw new NotSupportedException($"Bank adapter type '{adapterType}' is not supported.")
        };
}
