using GstService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Queries.GetImsInvoice;

/// <summary>
/// Returns full detail of a single IMS invoice including its action log history.
/// </summary>
[RequiresPermission("gst.ims.read")]
public record GetImsInvoiceQuery(
    Guid InvoiceId,
    Guid OrganizationId) : IQuery<ImsInvoiceDetail>;

/// <summary>Full detail DTO including action log.</summary>
public record ImsInvoiceDetail(
    Guid Id,
    string SupplierGstin,
    string SupplierName,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    decimal InvoiceValue,
    decimal TaxableValue,
    decimal IgstAmount,
    decimal CgstAmount,
    decimal SgstAmount,
    decimal CessAmount,
    string Period,
    string Source,
    string Status,
    bool DeemedAccepted,
    string? RejectionReason,
    DateTime? ActionedAt,
    Guid? ActionedBy,
    DateTime CreatedAt,
    IReadOnlyList<ImsActionLogEntry> ActionLog);

/// <summary>An entry in the action history.</summary>
public record ImsActionLogEntry(
    Guid Id,
    string Action,
    string PreviousStatus,
    string NewStatus,
    DateTime ActedAt,
    Guid? ActedBy,
    string? Reason,
    bool IsBulk);

/// <summary>Handler for <see cref="GetImsInvoiceQuery"/>.</summary>
public sealed class GetImsInvoiceQueryHandler(IGstDbContext dbContext)
    : IQueryHandler<GetImsInvoiceQuery, ImsInvoiceDetail>
{
    /// <inheritdoc />
    public async Task<Result<ImsInvoiceDetail>> Handle(
        GetImsInvoiceQuery request,
        CancellationToken cancellationToken)
    {
        var invoice = await dbContext.ImsInvoices
            .Where(i => i.Id == request.InvoiceId
                     && i.OrganizationId == request.OrganizationId
                     && i.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (invoice is null)
            return Result<ImsInvoiceDetail>.Failure(
                Error.NotFound("ImsInvoice.NotFound", $"Invoice {request.InvoiceId} not found."));

        var actionLog = await dbContext.ImsActionLogs
            .Where(l => l.ImsInvoiceId == request.InvoiceId)
            .OrderBy(l => l.ActedAt)
            .Select(l => new ImsActionLogEntry(l.Id, l.Action, l.PreviousStatus, l.NewStatus, l.ActedAt, l.ActedBy, l.Reason, l.IsBulk))
            .ToListAsync(cancellationToken);

        return new ImsInvoiceDetail(
            Id: invoice.Id,
            SupplierGstin: invoice.SupplierGstin,
            SupplierName: invoice.SupplierName,
            InvoiceNumber: invoice.InvoiceNumber,
            InvoiceDate: invoice.InvoiceDate,
            InvoiceValue: invoice.InvoiceValue,
            TaxableValue: invoice.TaxableValue,
            IgstAmount: invoice.IgstAmount,
            CgstAmount: invoice.CgstAmount,
            SgstAmount: invoice.SgstAmount,
            CessAmount: invoice.CessAmount,
            Period: invoice.Period,
            Source: invoice.Source,
            Status: invoice.Status,
            DeemedAccepted: invoice.DeemedAccepted,
            RejectionReason: invoice.RejectionReason,
            ActionedAt: invoice.ActionedAt,
            ActionedBy: invoice.ActionedBy,
            CreatedAt: invoice.CreatedAt,
            ActionLog: actionLog);
    }
}
