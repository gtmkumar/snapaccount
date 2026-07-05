using FluentValidation;
using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Queries.GetImsSummary;

/// <summary>
/// Returns a count summary of IMS invoices by status for a given period,
/// along with the GSTR-2B generation deadline for that period.
///
/// The GSTR-2B deadline is the 14th of the month following the return period
/// (e.g. for March 2026 / "032026", deadline is 14 April 2026).
/// Taxpayers must action all PENDING invoices before this deadline to avoid
/// automatic deemed acceptance.
/// </summary>
[RequiresPermission("gst.ims.read")]
public record GetImsSummaryQuery(
    Guid OrganizationId,
    string Period) : IQuery<ImsSummaryDto>;

/// <summary>IMS summary counts and deadline information.</summary>
public record ImsSummaryDto(
    string Period,
    int Pending,
    int Accepted,
    int Rejected,
    int PendingKept,
    int Total,
    int DeemedAccepted,
    DateOnly Gstr2bGenerationDeadline,
    bool Gstr2bGenerationPast,
    decimal TotalPendingValue,
    decimal TotalAcceptedValue,
    decimal TotalRejectedValue);

/// <summary>Validator for <see cref="GetImsSummaryQuery"/>.</summary>
public sealed class GetImsSummaryQueryValidator : AbstractValidator<GetImsSummaryQuery>
{
    public GetImsSummaryQueryValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Period)
            .NotEmpty()
            .Matches(@"^\d{2}\d{4}$")
            .WithMessage("Period must be in MMYYYY format (e.g. '032026').");
    }
}

/// <summary>Handler for <see cref="GetImsSummaryQuery"/>.</summary>
public sealed class GetImsSummaryQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<GetImsSummaryQuery, ImsSummaryDto>
{
    /// <inheritdoc />
    public async Task<Result<ImsSummaryDto>> Handle(
        GetImsSummaryQuery request,
        CancellationToken cancellationToken)
    {
        var invoices = await dbContext.ImsInvoices
            .Where(i => i.OrganizationId == request.OrganizationId
                     && i.Period == request.Period
                     && i.DeletedAt == null)
            .Select(i => new { i.Status, i.DeemedAccepted, i.InvoiceValue })
            .ToListAsync(cancellationToken);

        var pending       = invoices.Count(i => i.Status == "PENDING");
        var accepted      = invoices.Count(i => i.Status == "ACCEPTED");
        var rejected      = invoices.Count(i => i.Status == "REJECTED");
        var pendingKept   = invoices.Count(i => i.Status == "PENDING_KEPT");
        var deemedAcc     = invoices.Count(i => i.DeemedAccepted);

        var totalPending  = invoices.Where(i => i.Status == "PENDING" || i.Status == "PENDING_KEPT").Sum(i => i.InvoiceValue);
        var totalAccepted = invoices.Where(i => i.Status == "ACCEPTED").Sum(i => i.InvoiceValue);
        var totalRejected = invoices.Where(i => i.Status == "REJECTED").Sum(i => i.InvoiceValue);

        var deadline = ComputeGstr2bDeadline(request.Period);

        return new ImsSummaryDto(
            Period: request.Period,
            Pending: pending,
            Accepted: accepted,
            Rejected: rejected,
            PendingKept: pendingKept,
            Total: invoices.Count,
            DeemedAccepted: deemedAcc,
            Gstr2bGenerationDeadline: deadline,
            Gstr2bGenerationPast: deadline < DateOnly.FromDateTime(DateTime.UtcNow),
            TotalPendingValue: totalPending,
            TotalAcceptedValue: totalAccepted,
            TotalRejectedValue: totalRejected);
    }

    /// <summary>
    /// GSTR-2B is generated on the 14th of the month following the return period.
    /// Period format: MMYYYY.
    /// </summary>
    private static DateOnly ComputeGstr2bDeadline(string period)
    {
        if (period.Length == 6
            && int.TryParse(period[..2], out var month)
            && int.TryParse(period[2..], out var year)
            && month is >= 1 and <= 12)
        {
            var nextMonth = month == 12 ? 1 : month + 1;
            var nextYear  = month == 12 ? year + 1 : year;
            return new DateOnly(nextYear, nextMonth, 14);
        }
        // Fallback: return current month + 14 if period is malformed
        return DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14));
    }
}
