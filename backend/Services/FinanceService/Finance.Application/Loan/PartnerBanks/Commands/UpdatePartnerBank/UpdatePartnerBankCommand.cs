using FluentValidation;
using LoanService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.PartnerBanks.Commands.UpdatePartnerBank;

/// <summary>Updates a partner bank configuration. Admin-only operation.</summary>
[RequiresPermission("loan.bank.update")]
public record UpdatePartnerBankCommand(
    Guid BankId,
    string? Name,
    string? LogoUrl,
    string? ContactEmail,
    string? ApiConfigJson,
    bool? IsActive) : ICommand<UpdatePartnerBankResponse>;

/// <summary>Response after updating a partner bank.</summary>
public record UpdatePartnerBankResponse(Guid BankId, string Name, bool IsActive);

/// <summary>Validates UpdatePartnerBankCommand.</summary>
public sealed class UpdatePartnerBankCommandValidator : AbstractValidator<UpdatePartnerBankCommand>
{
    public UpdatePartnerBankCommandValidator()
    {
        RuleFor(x => x.BankId).NotEmpty();
        When(x => x.Name != null, () => RuleFor(x => x.Name).MaximumLength(200));
        When(x => x.ContactEmail != null, () => RuleFor(x => x.ContactEmail).EmailAddress());
    }
}

/// <summary>Handler: updates partner bank fields.</summary>
public sealed class UpdatePartnerBankCommandHandler(
    ILoanServiceDbContext db,
    ICredentialEncryptionService credentialEncryption) : ICommandHandler<UpdatePartnerBankCommand, UpdatePartnerBankResponse>
{
    /// <inheritdoc />
    public async Task<Result<UpdatePartnerBankResponse>> Handle(
        UpdatePartnerBankCommand request,
        CancellationToken cancellationToken)
    {
        var bank = await db.PartnerBanks
            .Where(b => b.Id == request.BankId && b.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (bank == null)
            return Error.NotFound("PartnerBank", request.BankId);

        if (request.Name != null) bank.Name = request.Name;
        if (request.LogoUrl != null) bank.LogoUrl = request.LogoUrl;
        if (request.ContactEmail != null) bank.ContactEmail = request.ContactEmail;
        if (request.IsActive.HasValue) bank.IsActive = request.IsActive.Value;

        if (!string.IsNullOrEmpty(request.ApiConfigJson) && !string.IsNullOrEmpty(bank.ApiConfigKeyRef))
        {
            // SWEEP-FIX WEB-03: ApiConfigEncrypted is string? (jsonb in DB) — convert byte[] to Base64.
            var encryptedBytes = await credentialEncryption.EncryptAsync(
                request.ApiConfigJson, bank.ApiConfigKeyRef, cancellationToken);
            bank.ApiConfigEncrypted = Convert.ToBase64String(encryptedBytes);
        }

        await db.SaveChangesAsync(cancellationToken);
        return new UpdatePartnerBankResponse(bank.Id, bank.Name, bank.IsActive);
    }
}
