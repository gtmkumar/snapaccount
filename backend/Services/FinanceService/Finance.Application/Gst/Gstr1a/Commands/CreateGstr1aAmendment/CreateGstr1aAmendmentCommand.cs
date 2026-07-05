using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Gstr1a.Commands.CreateGstr1aAmendment;

/// <summary>
/// Creates a GSTR-1A amendment in DRAFT status.
/// GSTR-1A is the only mechanism to correct GSTR-3B Table 3 after filing
/// (hard-locked since 1 Apr 2026 per GSTN IMS mandate).
///
/// Valid amendment types:
///   B2B_AMENDMENT  — amend a B2B supply already reported by the supplier
///   B2BA           — GSTN internal code for B2B amendment table
///   CDNR_AMENDMENT — amend a credit/debit note
///   CDNRA          — GSTN internal code for CDN amendment table
/// </summary>
[RequiresPermission("gst.gstr1a.create")]
public record CreateGstr1aAmendmentCommand(
    Guid OrganizationId,
    Guid? OriginalImsInvoiceId,
    string OriginalInvoiceNumber,
    string OriginalSupplierGstin,
    string AmendmentType,
    string AmendmentPayloadJson,
    string Period) : ICommand<CreateGstr1aAmendmentResponse>;

/// <summary>Response after creating an amendment draft.</summary>
public record CreateGstr1aAmendmentResponse(
    Guid AmendmentId,
    string Status,
    string Period,
    string AmendmentType);

/// <summary>Validator for <see cref="CreateGstr1aAmendmentCommand"/>.</summary>
public sealed class CreateGstr1aAmendmentCommandValidator : AbstractValidator<CreateGstr1aAmendmentCommand>
{
    private static readonly HashSet<string> ValidAmendmentTypes =
        ["B2B_AMENDMENT", "B2BA", "CDNR_AMENDMENT", "CDNRA"];

    public CreateGstr1aAmendmentCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.OriginalInvoiceNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.OriginalSupplierGstin)
            .NotEmpty()
            .Length(15)
            .Matches(@"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
            .WithMessage("Supplier GSTIN must be a valid 15-character GST identification number.");
        RuleFor(x => x.AmendmentType)
            .NotEmpty()
            .Must(t => ValidAmendmentTypes.Contains(t))
            .WithMessage("AmendmentType must be one of: B2B_AMENDMENT, B2BA, CDNR_AMENDMENT, CDNRA.");
        RuleFor(x => x.AmendmentPayloadJson)
            .NotEmpty()
            .MaximumLength(32_768)
            .WithMessage("AmendmentPayloadJson must not be empty and must be under 32 KB.");
        RuleFor(x => x.Period)
            .NotEmpty()
            .Matches(@"^\d{2}\d{4}$")
            .WithMessage("Period must be in MMYYYY format (e.g. '032026').");
    }
}

/// <summary>Handler for <see cref="CreateGstr1aAmendmentCommand"/>.</summary>
public sealed class CreateGstr1aAmendmentCommandHandler(IGstDbContext dbContext)
    : ICommandHandler<CreateGstr1aAmendmentCommand, CreateGstr1aAmendmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateGstr1aAmendmentResponse>> Handle(
        CreateGstr1aAmendmentCommand request,
        CancellationToken cancellationToken)
    {
        var amendment = Gstr1aAmendment.Create(
            organizationId: request.OrganizationId,
            originalImsInvoiceId: request.OriginalImsInvoiceId,
            originalInvoiceNumber: request.OriginalInvoiceNumber,
            originalSupplierGstin: request.OriginalSupplierGstin,
            amendmentType: request.AmendmentType,
            amendmentPayloadJson: request.AmendmentPayloadJson,
            period: request.Period);

        dbContext.Gstr1aAmendments.Add(amendment);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateGstr1aAmendmentResponse(
            AmendmentId: amendment.Id,
            Status: amendment.Status,
            Period: amendment.Period,
            AmendmentType: amendment.AmendmentType);
    }
}
