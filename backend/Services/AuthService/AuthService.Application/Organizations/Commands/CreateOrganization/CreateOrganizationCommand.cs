using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Organizations.Commands.CreateOrganization;

/// <summary>Creates a new organization (business entity) for the authenticated user.</summary>
/// <param name="BusinessName">Legal or trade name of the business.</param>
/// <param name="Gstin">15-character GSTIN (optional — not all SMEs are GST-registered).</param>
/// <param name="PanNumber">PAN of the business entity (format: XXXXX9999X).</param>
/// <param name="BusinessType">E.g. SOLE_PROPRIETOR, PARTNERSHIP, PVT_LTD.</param>
/// <param name="IndustryType">Industry classification string.</param>
/// <param name="AnnualTurnoverInr">Annual turnover in INR (decimal, never float).</param>
public record CreateOrganizationCommand(
    string BusinessName,
    string? Gstin,
    string? PanNumber,
    string? BusinessType,
    string? IndustryType,
    decimal? AnnualTurnoverInr) : ICommand<CreateOrganizationResponse>;

/// <summary>Response returned after the organization is created.</summary>
public record CreateOrganizationResponse(Guid OrganizationId);

/// <summary>
/// FluentValidation validator for <see cref="CreateOrganizationCommand"/>.
/// Enforces Indian compliance: GSTIN 15-char format and PAN XXXXX9999X format.
/// </summary>
public sealed class CreateOrganizationCommandValidator : AbstractValidator<CreateOrganizationCommand>
{
    public CreateOrganizationCommandValidator()
    {
        RuleFor(x => x.BusinessName)
            .NotEmpty().WithMessage("Business name is required.")
            .MaximumLength(500);

        // GSTIN validation — only applied when provided (not all SMEs are GST-registered)
        When(x => !string.IsNullOrEmpty(x.Gstin), () =>
        {
            RuleFor(x => x.Gstin!)
                .Length(15).WithMessage("GSTIN must be exactly 15 characters.")
                .Matches(@"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
                .WithMessage("GSTIN format is invalid.");
        });

        // PAN validation — format: XXXXX9999X
        When(x => !string.IsNullOrEmpty(x.PanNumber), () =>
        {
            RuleFor(x => x.PanNumber!)
                .Matches(@"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
                .WithMessage("PAN number format is invalid (XXXXX9999X).");
        });
    }
}

/// <summary>
/// Creates the organization aggregate and persists it via the repository.
/// </summary>
public sealed class CreateOrganizationCommandHandler(
    IOrganizationRepository organizationRepository,
    ICurrentUser currentUser)
    : ICommandHandler<CreateOrganizationCommand, CreateOrganizationResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateOrganizationResponse>> Handle(
        CreateOrganizationCommand request,
        CancellationToken cancellationToken)
    {
        var org = new Organization
        {
            OwnerUserId = currentUser.UserId,
            BusinessName = request.BusinessName,
            Gstin = request.Gstin,
            PanNumber = request.PanNumber,
            IsGstRegistered = !string.IsNullOrEmpty(request.Gstin)
        };

        org.AddDomainEvent(new OrganizationCreatedEvent(org.Id, currentUser.UserId, request.BusinessName));
        await organizationRepository.AddAsync(org, cancellationToken);

        return new CreateOrganizationResponse(org.Id);
    }
}
