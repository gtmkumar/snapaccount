using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Ims.Commands.ActOnImsInvoice;

/// <summary>
/// Applies an IMS action (ACCEPTED / REJECTED / PENDING_KEPT) to a single invoice.
/// Idempotent: repeating the same action on the same invoice is a no-op.
/// Appends an <see cref="ImsActionLog"/> entry on every state change.
/// Submits the action to the GSTN IMS API (or mock) after local persistence.
/// </summary>
[RequiresPermission("gst.ims.action")]
public record ActOnImsInvoiceCommand(
    Guid InvoiceId,
    Guid OrganizationId,
    string Action,
    string? Reason,
    Guid ActionedBy) : ICommand<ActOnImsInvoiceResponse>;

/// <summary>Response confirming the action was applied.</summary>
public record ActOnImsInvoiceResponse(
    Guid InvoiceId,
    string PreviousStatus,
    string NewStatus,
    bool Changed,
    string? GstnRef);

/// <summary>Validator for <see cref="ActOnImsInvoiceCommand"/>.</summary>
public sealed class ActOnImsInvoiceCommandValidator : AbstractValidator<ActOnImsInvoiceCommand>
{
    private static readonly HashSet<string> ValidActions =
        ["ACCEPTED", "REJECTED", "PENDING_KEPT"];

    public ActOnImsInvoiceCommandValidator()
    {
        RuleFor(x => x.InvoiceId).NotEmpty();
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.Action)
            .NotEmpty()
            .Must(a => ValidActions.Contains(a))
            .WithMessage("Action must be one of: ACCEPTED, REJECTED, PENDING_KEPT.");
        RuleFor(x => x.Reason)
            .MaximumLength(500)
            .When(x => x.Reason is not null);
        RuleFor(x => x.ActionedBy).NotEmpty();
    }
}

/// <summary>Handler for <see cref="ActOnImsInvoiceCommand"/>.</summary>
public sealed class ActOnImsInvoiceCommandHandler(
    IGstDbContext dbContext,
    IImsGstnClient imsClient) : ICommandHandler<ActOnImsInvoiceCommand, ActOnImsInvoiceResponse>
{
    /// <inheritdoc />
    public async Task<Result<ActOnImsInvoiceResponse>> Handle(
        ActOnImsInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var invoice = await dbContext.ImsInvoices
            .FirstOrDefaultAsync(
                i => i.Id == request.InvoiceId
                  && i.OrganizationId == request.OrganizationId
                  && i.DeletedAt == null,
                cancellationToken);

        if (invoice is null)
            return Result<ActOnImsInvoiceResponse>.Failure(
                Error.NotFound("ImsInvoice.NotFound", $"Invoice {request.InvoiceId} not found."));

        var previousStatus = invoice.Status;

        var actionResult = request.Action switch
        {
            "ACCEPTED"     => invoice.Accept(request.ActionedBy),
            "REJECTED"     => invoice.Reject(request.ActionedBy, request.Reason),
            "PENDING_KEPT" => invoice.KeepPending(request.ActionedBy),
            _              => Result.Failure(Error.Validation("ImsInvoice.UnknownAction", "Unknown action."))
        };

        if (!actionResult.IsSuccess)
            return Result<ActOnImsInvoiceResponse>.Failure(actionResult.Error);

        var changed = invoice.Status != previousStatus;

        if (changed)
        {
            var logEntry = ImsActionLog.Create(
                imsInvoiceId: invoice.Id,
                organizationId: invoice.OrganizationId,
                action: request.Action,
                previousStatus: previousStatus,
                newStatus: invoice.Status,
                actedBy: request.ActionedBy,
                reason: request.Reason,
                isBulk: false);
            dbContext.ImsActionLogs.Add(logEntry);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        // Submit to GSTN (fire-and-forget on non-change; always submit when changed)
        string? gstnRef = null;
        if (changed)
        {
            var gstnResult = await imsClient.SubmitActionAsync(
                gstin: invoice.SupplierGstin, // note: for outbound action we send from the org's GSTIN
                period: invoice.Period,
                invoiceNumber: invoice.InvoiceNumber,
                supplierGstin: invoice.SupplierGstin,
                action: request.Action,
                reason: request.Reason,
                ct: cancellationToken);
            gstnRef = gstnResult.Data;
        }

        return new ActOnImsInvoiceResponse(
            InvoiceId: invoice.Id,
            PreviousStatus: previousStatus,
            NewStatus: invoice.Status,
            Changed: changed,
            GstnRef: gstnRef);
    }
}
