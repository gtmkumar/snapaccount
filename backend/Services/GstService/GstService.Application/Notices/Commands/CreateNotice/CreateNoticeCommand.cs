using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Commands.CreateNotice;

/// <summary>
/// Creates a new GST notice record in RECEIVED status.
/// Attachment upload is done separately via UploadNoticeAttachmentCommand.
/// Phase 6B: new command.
/// </summary>
[RequiresPermission("gst.notices.create")]
public record CreateNoticeCommand(
    Guid OrganizationId,
    string NoticeNumber,
    string NoticeType,
    string? IssuedBy,
    DateOnly IssuedDate,
    DateOnly? DueDate,
    string? Description) : ICommand<CreateNoticeResponse>;

/// <summary>Response after creating a notice.</summary>
public record CreateNoticeResponse(Guid NoticeId, string Status);

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
    }
}

/// <summary>Handler for <see cref="CreateNoticeCommand"/>.</summary>
public sealed class CreateNoticeCommandHandler(IGstDbContext dbContext)
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
            request.Description);

        notice.SetIssuedBy(request.IssuedBy);
        dbContext.GstNotices.Add(notice);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateNoticeResponse(notice.Id, notice.Status);
    }
}
