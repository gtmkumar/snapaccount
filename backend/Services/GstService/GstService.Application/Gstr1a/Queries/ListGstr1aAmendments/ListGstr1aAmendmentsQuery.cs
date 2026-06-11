using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Gstr1a.Queries.ListGstr1aAmendments;

/// <summary>
/// Returns a paginated list of GSTR-1A amendments for an organisation,
/// optionally filtered by period and status.
/// </summary>
[RequiresPermission("gst.gstr1a.read")]
public record ListGstr1aAmendmentsQuery(
    Guid OrganizationId,
    string? Period = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListGstr1aAmendmentsDto>;

/// <summary>Paginated result DTO.</summary>
public record ListGstr1aAmendmentsDto(
    IReadOnlyList<Gstr1aAmendmentSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Summary projection for list views.</summary>
public record Gstr1aAmendmentSummary(
    Guid Id,
    string OriginalInvoiceNumber,
    string OriginalSupplierGstin,
    Guid? OriginalImsInvoiceId,
    string AmendmentType,
    string Period,
    string Status,
    string? ArnNumber,
    DateTime? FiledAt,
    DateTime CreatedAt);

/// <summary>Validator for <see cref="ListGstr1aAmendmentsQuery"/>.</summary>
public sealed class ListGstr1aAmendmentsQueryValidator : AbstractValidator<ListGstr1aAmendmentsQuery>
{
    private static readonly HashSet<string> ValidStatuses = ["DRAFT", "SUBMITTED", "FILED"];

    public ListGstr1aAmendmentsQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Period)
            .Matches(@"^\d{2}\d{4}$")
            .When(x => x.Period is not null);
        RuleFor(x => x.Status)
            .Must(s => ValidStatuses.Contains(s!))
            .When(x => x.Status is not null);
    }
}

/// <summary>Handler for <see cref="ListGstr1aAmendmentsQuery"/>.</summary>
public sealed class ListGstr1aAmendmentsQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<ListGstr1aAmendmentsQuery, ListGstr1aAmendmentsDto>
{
    /// <inheritdoc />
    public async Task<Result<ListGstr1aAmendmentsDto>> Handle(
        ListGstr1aAmendmentsQuery request,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Gstr1aAmendments
            .Where(a => a.OrganizationId == request.OrganizationId && a.DeletedAt == null);

        if (!string.IsNullOrEmpty(request.Period))
            query = query.Where(a => a.Period == request.Period);

        if (!string.IsNullOrEmpty(request.Status))
            query = query.Where(a => a.Status == request.Status);

        var total = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(a => new Gstr1aAmendmentSummary(
                a.Id, a.OriginalInvoiceNumber, a.OriginalSupplierGstin,
                a.OriginalImsInvoiceId, a.AmendmentType, a.Period, a.Status,
                a.ArnNumber, a.FiledAt, a.CreatedAt))
            .ToListAsync(cancellationToken);

        return new ListGstr1aAmendmentsDto(items, total, request.Page, request.PageSize);
    }
}
