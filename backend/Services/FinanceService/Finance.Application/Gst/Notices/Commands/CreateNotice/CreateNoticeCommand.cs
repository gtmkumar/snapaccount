using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Domain.ValueObjects;

namespace GstService.Application.Notices.Commands.CreateNotice;

/// <summary>
/// Creates a new GST notice record in RECEIVED status.
/// Attachment upload is done separately via UploadNoticeAttachmentCommand.
/// Phase 6B: new command.
/// GAP-108: FormType taxonomy added; statutory deadline computed on creation.
/// </summary>
[RequiresPermission("gst.notices.create")]
public record CreateNoticeCommand(
    Guid OrganizationId,
    string NoticeNumber,
    string NoticeType,
    string? IssuedBy,
    DateOnly IssuedDate,
    DateOnly? DueDate,
    string? Description,
    GstNoticeFormType FormType = GstNoticeFormType.OTHER,
    // BUG-GST-NOTICE-GSTIN: gst.notices.gstin is NOT NULL (migration 021). Optional here —
    // when omitted, the handler resolves the org's GSTIN from its latest GST return on file.
    string? Gstin = null) : ICommand<CreateNoticeResponse>;

/// <summary>Response after creating a notice.</summary>
public record CreateNoticeResponse(
    Guid NoticeId,
    string Status,
    string FormType,
    DateOnly? StatutoryDeadline,
    DateOnly? EffectiveDeadline);

/// <summary>Validator for create notice command.</summary>
public sealed class CreateNoticeCommandValidator : AbstractValidator<CreateNoticeCommand>
{
    public CreateNoticeCommandValidator()
    {
        RuleFor(x => x.OrganizationId).NotEmpty();
        RuleFor(x => x.NoticeNumber).NotEmpty().MaximumLength(100);
        RuleFor(x => x.NoticeType).NotEmpty().MaximumLength(100);
        RuleFor(x => x.IssuedDate).NotEmpty();
        RuleFor(x => x.Description).MaximumLength(2000).When(x => x.Description is not null);
        RuleFor(x => x.FormType).IsInEnum();
    }
}

/// <summary>Handler for <see cref="CreateNoticeCommand"/>.</summary>
public sealed class CreateNoticeCommandHandler(
    IGstDbContext dbContext,
    IGstNoticeDeadlineService deadlineService)
    : ICommandHandler<CreateNoticeCommand, CreateNoticeResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateNoticeResponse>> Handle(
        CreateNoticeCommand request,
        CancellationToken cancellationToken)
    {
        // BUG-GST-NOTICE-GSTIN: gst.notices.gstin is NOT NULL (migration 021). Source the GSTIN in
        // priority order: (1) explicit request.Gstin; (2) resolved from the org's most recent GST
        // return on file (org→GSTIN — aligns with admin P-37/BE-GST-01). Validate the 15-char format
        // before persisting so the DB CHECK constraint can never 23514.
        var gstinRaw = request.Gstin;
        if (string.IsNullOrWhiteSpace(gstinRaw))
        {
            gstinRaw = await dbContext.GstReturns
                .Where(r => r.OrganizationId == request.OrganizationId && r.Gstin != "")
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => r.Gstin)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(gstinRaw))
            return Error.Validation("Notice.GstinRequired",
                "GSTIN is required to create a notice and none could be resolved for the organisation. " +
                "Supply a gstin in the request.");

        var gstinResult = GstinNumber.Create(gstinRaw);
        if (gstinResult.IsFailure)
            return Result<CreateNoticeResponse>.Failure(gstinResult.Error);

        var notice = GstNotice.Create(
            request.OrganizationId,
            request.NoticeNumber,
            request.NoticeType,
            request.IssuedDate,
            request.DueDate,
            request.Description,
            request.FormType,
            gstin: gstinResult.Value.Value);

        notice.SetIssuedBy(request.IssuedBy);

        // GAP-108: Compute and stamp statutory deadline from config-driven rules
        var fy = IGstNoticeDeadlineService.GetFinancialYear(request.IssuedDate);
        var statutory = await deadlineService.ComputeDeadlineAsync(
            request.FormType, request.IssuedDate, fy, cancellationToken);
        notice.SetStatutoryDeadline(statutory);

        // If caller provided an explicit DueDate, mark as overridden
        if (request.DueDate.HasValue)
            notice.OverrideDeadline(request.DueDate.Value);

        dbContext.GstNotices.Add(notice);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateNoticeResponse(
            notice.Id,
            notice.Status,
            notice.FormType.ToString(),
            notice.StatutoryDeadline,
            notice.DueDate);
    }
}
