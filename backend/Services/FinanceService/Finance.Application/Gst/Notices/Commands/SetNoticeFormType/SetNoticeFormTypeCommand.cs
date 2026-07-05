using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Commands.SetNoticeFormType;

/// <summary>
/// Sets (or corrects) the form-type taxonomy on a notice and stamps the statutory deadline.
/// After form-type is set the deadline engine runs automatically to compute
/// <see cref="GstService.Domain.Entities.GstNotice.StatutoryDeadline"/>.
/// GAP-108: migration 084.
/// SEC-038: org-scoped fetch prevents cross-org IDOR.
/// </summary>
[RequiresPermission("gst.notices.update")]
public record SetNoticeFormTypeCommand(
    Guid NoticeId,
    GstNoticeFormType FormType,
    DateOnly? ExplicitDeadlineOverride) : ICommand<SetNoticeFormTypeResponse>;

/// <summary>Response after setting form type.</summary>
public record SetNoticeFormTypeResponse(
    Guid NoticeId,
    string FormType,
    DateOnly? StatutoryDeadline,
    DateOnly? EffectiveDeadline,
    bool DeadlineOverridden);

/// <summary>Validator for <see cref="SetNoticeFormTypeCommand"/>.</summary>
public sealed class SetNoticeFormTypeCommandValidator : AbstractValidator<SetNoticeFormTypeCommand>
{
    public SetNoticeFormTypeCommandValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
        RuleFor(x => x.FormType).IsInEnum();
    }
}

/// <summary>Handler for <see cref="SetNoticeFormTypeCommand"/>.</summary>
public sealed class SetNoticeFormTypeCommandHandler(
    IGstDbContext dbContext,
    IGstNoticeDeadlineService deadlineService,
    ICurrentUser currentUser)
    : ICommandHandler<SetNoticeFormTypeCommand, SetNoticeFormTypeResponse>
{
    /// <inheritdoc />
    public async Task<Result<SetNoticeFormTypeResponse>> Handle(
        SetNoticeFormTypeCommand request,
        CancellationToken cancellationToken)
    {
        // SEC-038: org-scoped fetch — NotFound on mismatch (no existence leak)
        var notice = await dbContext.GstNotices
            .Where(n => n.Id == request.NoticeId
                     && n.OrganizationId == currentUser.OrganizationId
                     && n.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (notice is null)
            return Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found.");

        // Set form type
        notice.SetFormType(request.FormType);

        // Compute statutory deadline from config-driven rules
        var fy = IGstNoticeDeadlineService.GetFinancialYear(notice.IssuedDate);
        var statutory = await deadlineService.ComputeDeadlineAsync(
            request.FormType, notice.IssuedDate, fy, cancellationToken);
        notice.SetStatutoryDeadline(statutory);

        // Apply operator override if provided
        if (request.ExplicitDeadlineOverride.HasValue)
            notice.OverrideDeadline(request.ExplicitDeadlineOverride.Value);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new SetNoticeFormTypeResponse(
            notice.Id,
            notice.FormType.ToString(),
            notice.StatutoryDeadline,
            notice.DueDate,
            notice.DeadlineOverridden);
    }
}
