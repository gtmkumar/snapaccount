using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Commands.BulkActOnImsInvoices;

/// <summary>
/// Applies an IMS action to multiple invoices in a single request.
/// Each invoice action is idempotent (same-action on same-status is a no-op).
/// All invoices must belong to the requesting organisation (IDOR guard).
/// Appends <see cref="ImsActionLog"/> entries for every changed invoice.
/// </summary>
[RequiresPermission("gst.ims.action")]
public record BulkActOnImsInvoicesCommand(
    Guid OrganizationId,
    Guid ActionedBy,
    IReadOnlyList<BulkImsActionItem> Items) : ICommand<BulkActOnImsInvoicesResponse>;

/// <summary>One item in a bulk action request.</summary>
public record BulkImsActionItem(
    Guid InvoiceId,
    string Action,
    string? Reason);

/// <summary>Response containing per-invoice results.</summary>
public record BulkActOnImsInvoicesResponse(
    int TotalRequested,
    int Changed,
    int Skipped,
    int Failed,
    IReadOnlyList<BulkImsInvoiceResult> Results);

/// <summary>Result for a single invoice in the bulk operation.</summary>
public record BulkImsInvoiceResult(
    Guid InvoiceId,
    bool Success,
    bool Changed,
    string? NewStatus,
    string? ErrorCode,
    string? ErrorMessage);

/// <summary>Validator for <see cref="BulkActOnImsInvoicesCommand"/>.</summary>
public sealed class BulkActOnImsInvoicesCommandValidator : AbstractValidator<BulkActOnImsInvoicesCommand>
{
    private static readonly HashSet<string> ValidActions =
        ["ACCEPTED", "REJECTED", "PENDING_KEPT"];

    public BulkActOnImsInvoicesCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.ActionedBy).NotEmpty();
        RuleFor(x => x.Items)
            .NotEmpty()
            .WithMessage("At least one invoice action is required.")
            .Must(items => items.Count <= 100)
            .WithMessage("Bulk action is limited to 100 invoices per request (GSTN rate limit).");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.InvoiceId).NotEmpty();
            item.RuleFor(i => i.Action)
                .NotEmpty()
                .Must(a => ValidActions.Contains(a))
                .WithMessage("Action must be one of: ACCEPTED, REJECTED, PENDING_KEPT.");
            item.RuleFor(i => i.Reason)
                .MaximumLength(500)
                .When(i => i.Reason is not null);
        });
    }
}

/// <summary>Handler for <see cref="BulkActOnImsInvoicesCommand"/>.</summary>
public sealed class BulkActOnImsInvoicesCommandHandler(
    IGstDbContext dbContext,
    IImsGstnClient imsClient) : ICommandHandler<BulkActOnImsInvoicesCommand, BulkActOnImsInvoicesResponse>
{
    /// <inheritdoc />
    public async Task<Result<BulkActOnImsInvoicesResponse>> Handle(
        BulkActOnImsInvoicesCommand request,
        CancellationToken cancellationToken)
    {
        var invoiceIds = request.Items.Select(i => i.InvoiceId).ToList();

        // Load all target invoices in one query — IDOR guard: org-scoped
        var invoices = await dbContext.ImsInvoices
            .Where(i => invoiceIds.Contains(i.Id)
                     && i.OrganizationId == request.OrganizationId
                     && i.DeletedAt == null)
            .ToDictionaryAsync(i => i.Id, cancellationToken);

        var results = new List<BulkImsInvoiceResult>(request.Items.Count);
        var changed = 0;
        var skipped = 0;
        var failed = 0;
        var gstnBulkItems = new List<ImsBulkActionItem>();

        foreach (var item in request.Items)
        {
            if (!invoices.TryGetValue(item.InvoiceId, out var invoice))
            {
                failed++;
                results.Add(new BulkImsInvoiceResult(
                    item.InvoiceId, false, false, null,
                    "ImsInvoice.NotFound", $"Invoice {item.InvoiceId} not found or access denied."));
                continue;
            }

            var previousStatus = invoice.Status;

            var actionResult = item.Action switch
            {
                "ACCEPTED"     => invoice.Accept(request.ActionedBy),
                "REJECTED"     => invoice.Reject(request.ActionedBy, item.Reason),
                "PENDING_KEPT" => invoice.KeepPending(request.ActionedBy),
                _              => Result.Failure(Error.Validation("ImsInvoice.UnknownAction", "Unknown action."))
            };

            if (!actionResult.IsSuccess)
            {
                failed++;
                results.Add(new BulkImsInvoiceResult(
                    item.InvoiceId, false, false, previousStatus,
                    actionResult.Error.Code, actionResult.Error.Message));
                continue;
            }

            var didChange = invoice.Status != previousStatus;
            if (didChange)
            {
                changed++;
                var logEntry = ImsActionLog.Create(
                    imsInvoiceId: invoice.Id,
                    organizationId: invoice.OrganizationId,
                    action: item.Action,
                    previousStatus: previousStatus,
                    newStatus: invoice.Status,
                    actedBy: request.ActionedBy,
                    reason: item.Reason,
                    isBulk: true);
                dbContext.ImsActionLogs.Add(logEntry);
                gstnBulkItems.Add(new ImsBulkActionItem(invoice.InvoiceNumber, invoice.SupplierGstin, item.Action, item.Reason));
            }
            else
            {
                skipped++;
            }

            results.Add(new BulkImsInvoiceResult(
                item.InvoiceId, true, didChange, invoice.Status, null, null));
        }

        if (changed > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);

            // Submit bulk to GSTN — best effort; local state is already saved
            if (gstnBulkItems.Count > 0 && invoices.Count > 0)
            {
                var firstPeriod = invoices.Values.First().Period;
                var firstGstin = invoices.Values.First().SupplierGstin;
                await imsClient.SubmitBulkActionsAsync(firstGstin, firstPeriod, gstnBulkItems, cancellationToken);
            }
        }

        return new BulkActOnImsInvoicesResponse(
            TotalRequested: request.Items.Count,
            Changed: changed,
            Skipped: skipped,
            Failed: failed,
            Results: results);
    }
}
