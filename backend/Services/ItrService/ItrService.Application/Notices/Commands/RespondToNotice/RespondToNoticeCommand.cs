using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Notices.Commands.RespondToNotice;

/// <summary>Files a response to an ITR notice.</summary>
[RequiresPermission("itr.notices.respond")]
public record RespondToNoticeCommand(
    Guid NoticeId, Guid RespondedByUserId,
    string? ResponseText, string? ResponseAttachmentsJson) : ICommand;

public sealed class RespondToNoticeCommandValidator : AbstractValidator<RespondToNoticeCommand>
{
    public RespondToNoticeCommandValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
        RuleFor(x => x.RespondedByUserId).NotEmpty();
        RuleFor(x => x.ResponseText).MaximumLength(5000).When(x => x.ResponseText is not null);
    }
}

public sealed class RespondToNoticeCommandHandler(IItrDbContext dbContext, ICurrentUser currentUser) : ICommandHandler<RespondToNoticeCommand>
{
    public async Task<Result> Handle(RespondToNoticeCommand request, CancellationToken cancellationToken)
    {
        var notice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.ItrNotices.Where(n => n.Id == request.NoticeId && n.DeletedAt == null), cancellationToken);
        if (notice is null) return Result.Failure(Error.NotFound("ItrNotice.NotFound", $"Notice {request.NoticeId} not found."));

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == notice.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("ItrNotice.NotFound", $"Notice {request.NoticeId} not found."));

        if (notice.Status is "RESPONDED" or "CLOSED")
            return Result.Failure(Error.Conflict("ItrNotice.AlreadyResponded", "Notice already responded."));
        notice.FileResponse(request.RespondedByUserId, request.ResponseText, request.ResponseAttachmentsJson);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
