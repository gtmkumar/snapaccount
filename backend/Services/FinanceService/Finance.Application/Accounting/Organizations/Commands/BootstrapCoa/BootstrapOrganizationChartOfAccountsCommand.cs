using AccountingService.Application.Interfaces;
using AccountingService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Organizations.Commands.BootstrapCoa;

/// <summary>
/// Materialises <c>accounting.coa_template</c> seed rows into per-org
/// <c>accounting.chart_of_accounts</c> entries for a new organisation.
/// <para>P6-HANDOFF-02: <see cref="ChartOfAccount.OrgId"/> is NOT NULL;
/// seeds cannot live in the chart_of_accounts table — they live in coa_template.
/// This command materialises them once per org at onboarding time.</para>
/// </summary>
public record BootstrapOrganizationChartOfAccountsCommand(Guid OrgId) : ICommand<BootstrapCoaResponse>;

/// <summary>Response after COA bootstrap.</summary>
public record BootstrapCoaResponse(Guid OrgId, int AccountsCreated);

/// <summary>Validates the bootstrap command.</summary>
public sealed class BootstrapOrganizationChartOfAccountsCommandValidator
    : AbstractValidator<BootstrapOrganizationChartOfAccountsCommand>
{
    public BootstrapOrganizationChartOfAccountsCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
    }
}

/// <summary>
/// Handles <see cref="BootstrapOrganizationChartOfAccountsCommand"/>.
/// Reads COA templates and materialises them for the org. Idempotent — skips
/// accounts that already exist for the org.
/// </summary>
public sealed class BootstrapOrganizationChartOfAccountsCommandHandler(
    ICoaTemplateRepository templateRepository,
    IChartOfAccountRepository coaRepository,
    ICurrentUser currentUser)
    : ICommandHandler<BootstrapOrganizationChartOfAccountsCommand, BootstrapCoaResponse>
{
    /// <inheritdoc />
    public async Task<Result<BootstrapCoaResponse>> Handle(
        BootstrapOrganizationChartOfAccountsCommand request,
        CancellationToken cancellationToken)
    {
        // SEC-032: caller must be authenticated and request.OrgId must match their org.
        // NotFound (not Forbidden) to avoid leaking org existence.
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null
            || currentUser.OrganizationId.Value != request.OrgId)
            return Error.NotFound("Organization.NotFound", $"Organization {request.OrgId} not found.");

        var templates = await templateRepository.GetAllTemplatesAsync(cancellationToken);
        var existing = await coaRepository.GetByOrganizationAsync(request.OrgId, cancellationToken);
        var existingCodes = existing.Select(a => a.AccountCode).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Build every new account first, then persist them in a single batched write. This used
        // to call AddAsync (one SaveChanges round trip) per template — dozens of round trips on
        // every org bootstrap; now it is one batched insert.
        var accounts = templates
            .Where(t => !existingCodes.Contains(t.AccountCode))
            .Select(template => ChartOfAccount.CreateFromTemplate(
                request.OrgId,
                template.AccountCode,
                template.AccountName,
                template.AccountType,
                template.AccountSubtype,
                // BUG-ACCT-COA-TEMPLATE-CODE: no separate template_code column exists; the source
                // account_code is the traceability identifier (ChartOfAccount.TemplateCode is EF-ignored).
                templateCode: template.AccountCode))
            .ToList();

        if (accounts.Count > 0)
            await coaRepository.AddRangeAsync(accounts, cancellationToken);

        return new BootstrapCoaResponse(request.OrgId, accounts.Count);
    }
}
