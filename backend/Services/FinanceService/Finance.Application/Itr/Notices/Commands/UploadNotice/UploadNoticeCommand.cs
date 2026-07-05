using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Notices.Commands.UploadNotice;

/// <summary>Creates a new ITR notice record and stores GCS URI metadata.</summary>
[RequiresPermission("itr.notices.create")]
public record UploadNoticeCommand(
    Guid FilingId, Guid AssesseeId,
    string NoticeNumber, string NoticeType,
    DateOnly IssuedDate, DateOnly? DueDate,
    string? Subject, string? AttachmentsJson) : ICommand<UploadNoticeResponse>;

public record UploadNoticeResponse(Guid NoticeId, string Status);

public sealed class UploadNoticeCommandValidator : AbstractValidator<UploadNoticeCommand>
{
    public UploadNoticeCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.NoticeNumber).NotEmpty().MaximumLength(100);
        RuleFor(x => x.NoticeType).NotEmpty().MaximumLength(50);
        RuleFor(x => x.IssuedDate).NotEmpty();
    }
}

public sealed class UploadNoticeCommandHandler(IItrDbContext dbContext)
    : ICommandHandler<UploadNoticeCommand, UploadNoticeResponse>
{
    public async Task<Result<UploadNoticeResponse>> Handle(UploadNoticeCommand request, CancellationToken cancellationToken)
    {
        var notice = ItrNotice.Create(request.FilingId, request.AssesseeId,
            request.NoticeNumber, request.NoticeType, request.IssuedDate, request.DueDate, request.Subject);

        if (request.AttachmentsJson is not null)
            notice.SetAttachments(request.AttachmentsJson);

        dbContext.ItrNotices.Add(notice);

        // Mark the linked filing as having a notice
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        filing?.MarkNoticeReceived();

        await dbContext.SaveChangesAsync(cancellationToken);
        return new UploadNoticeResponse(notice.Id, notice.Status);
    }
}
