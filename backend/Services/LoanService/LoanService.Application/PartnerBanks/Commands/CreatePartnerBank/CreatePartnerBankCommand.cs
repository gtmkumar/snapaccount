using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.PartnerBanks.Commands.CreatePartnerBank;

/// <summary>Creates a new partner bank. Admin-only operation.</summary>
[RequiresPermission("loan.bank.create")]
public record CreatePartnerBankCommand(
    string Name,
    string? LogoUrl,
    BankAdapterType AdapterType,
    string? ContactEmail,
    string? ApiConfigJson,
    string? ApiConfigKeyRef,
    string? WebhookSecretRef) : ICommand<CreatePartnerBankResponse>;

/// <summary>Response after creating a partner bank.</summary>
public record CreatePartnerBankResponse(Guid BankId, string Name);

/// <summary>Validates CreatePartnerBankCommand.</summary>
public sealed class CreatePartnerBankCommandValidator : AbstractValidator<CreatePartnerBankCommand>
{
    public CreatePartnerBankCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AdapterType).IsInEnum();
        When(x => x.AdapterType == BankAdapterType.Email, () =>
            RuleFor(x => x.ContactEmail)
                .NotEmpty().EmailAddress()
                .WithMessage("Contact email is required for Email adapter type."));
        When(x => x.AdapterType == BankAdapterType.Rest, () =>
            RuleFor(x => x.ApiConfigKeyRef).NotEmpty()
                .WithMessage("API config key ref is required for REST adapter type."));
        // SEC-044: WebhookSecretRef is mandatory for REST and OAuth adapter types — the
        // DisbursementWebhookHandler hard-rejects any webhook from a bank without a configured
        // secret, so missing it at creation time means the bank can never receive disbursement
        // callbacks. Email adapter banks do not receive webhooks and are exempt.
        When(x => x.AdapterType == BankAdapterType.Rest || x.AdapterType == BankAdapterType.OAuth, () =>
            RuleFor(x => x.WebhookSecretRef)
                .NotEmpty()
                .WithMessage("WebhookSecretRef (GCP Secret Manager ref) is required for REST and OAuth adapter types. " +
                             "Configure a webhook secret before creating this bank."));
        RuleFor(x => x.LogoUrl).MaximumLength(500);
    }
}

/// <summary>Handler: creates partner bank with encrypted API config.</summary>
public sealed class CreatePartnerBankCommandHandler(
    ILoanServiceDbContext db,
    ICredentialEncryptionService credentialEncryption) : ICommandHandler<CreatePartnerBankCommand, CreatePartnerBankResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreatePartnerBankResponse>> Handle(
        CreatePartnerBankCommand request,
        CancellationToken cancellationToken)
    {
        byte[]? encryptedConfig = null;
        if (!string.IsNullOrEmpty(request.ApiConfigJson) && !string.IsNullOrEmpty(request.ApiConfigKeyRef))
        {
            // P6-HANDOFF-27: AES-GCM envelope encryption via ICredentialEncryptionService
            encryptedConfig = await credentialEncryption.EncryptAsync(
                request.ApiConfigJson, request.ApiConfigKeyRef, cancellationToken);
        }

        var bank = new PartnerBank
        {
            Name = request.Name,
            LogoUrl = request.LogoUrl,
            AdapterType = request.AdapterType,
            ContactEmail = request.ContactEmail,
            ApiConfigEncrypted = encryptedConfig,
            ApiConfigKeyRef = request.ApiConfigKeyRef,
            WebhookSecretRef = request.WebhookSecretRef,
            IsActive = true
        };

        db.PartnerBanks.Add(bank);
        await db.SaveChangesAsync(cancellationToken);
        return new CreatePartnerBankResponse(bank.Id, bank.Name);
    }
}
