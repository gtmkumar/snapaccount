using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using GstService.Domain.Enums;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

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
    GstNoticeFormType FormType = GstNoticeFormType.OTHER) : ICommand<CreateNoticeResponse>;

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
        var notice = GstNotice.Create(
            request.OrganizationId,
            request.NoticeNumber,
            request.NoticeType,
            request.IssuedDate,
            request.DueDate,
            request.Description,
            request.FormType);

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
