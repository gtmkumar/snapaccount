using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Commands.AssignNoticeToCa;

/// <summary>
/// Assigns a GST notice to a Chartered Accountant for response.
/// Emits <c>GstNoticeAssignedToCaEvent</c> domain event which the NotificationService listens to.
/// Phase 6B: replaces the 501 stub for POST /gst/notices/{id}/assign-ca.
/// </summary>
[RequiresPermission("gst.notices.assign")]
public record AssignNoticeToCaCommand(Guid NoticeId, Guid CaUserId) : ICommand;

/// <summary>Validator for assign-to-CA command.</summary>
public sealed class AssignNoticeToCaCommandValidator : AbstractValidator<AssignNoticeToCaCommand>
{
    public AssignNoticeToCaCommandValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
        RuleFor(x => x.CaUserId).NotEmpty();
    }
}

/// <summary>Handler for <see cref="AssignNoticeToCaCommand"/>.</summary>
public sealed class AssignNoticeToCaCommandHandler(IGstDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<AssignNoticeToCaCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(AssignNoticeToCaCommand request, CancellationToken cancellationToken)
    {
        var notice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstNotices.Where(n => n.Id == request.NoticeId && n.DeletedAt == null),
                cancellationToken);

        if (notice is null)
            return Result.Failure(Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found."));

        // SEC-038: post-fetch org ownership check — NotFound (not Forbidden) to avoid existence leak
        if (notice.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found."));

        if (notice.Status is "RESPONDED" or "CLOSED")
            return Result.Failure(Error.Conflict("GstNotice.Closed", "Cannot assign a responded or closed notice."));

        notice.AssignToCa(request.CaUserId);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
