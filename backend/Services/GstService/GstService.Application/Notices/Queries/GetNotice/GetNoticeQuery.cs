using FluentValidation;
using GstService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.Notices.Queries.GetNotice;

/// <summary>
/// Returns details of a single GST notice including attachments metadata.
/// Phase 6B: replaces the 501 stub for GET /gst/notices/{id}.
/// SEC-038: org-scoped EF filter prevents cross-org IDOR.
/// </summary>
public record GetNoticeQuery(Guid NoticeId) : IQuery<NoticeDetailDto>;

/// <summary>Full notice detail including attachments_jsonb metadata.</summary>
public record NoticeDetailDto(
    Guid Id,
    Guid OrganizationId,
    string NoticeNumber,
    string NoticeType,
    string? IssuedBy,
    string Status,
    DateOnly IssuedDate,
    DateOnly? DueDate,
    string? Description,
    Guid? AssignedCaId,
    DateTime? RespondedAt,
    Guid? RespondedBy,
    string? AttachmentsJson,
    string? ResponseAttachmentsJson);

/// <summary>Validator for get notice query.</summary>
public sealed class GetNoticeQueryValidator : AbstractValidator<GetNoticeQuery>
{
    public GetNoticeQueryValidator()
    {
        RuleFor(x => x.NoticeId).NotEmpty();
    }
}

/// <summary>Handler for <see cref="GetNoticeQuery"/>.</summary>
public sealed class GetNoticeQueryHandler(IGstDbContext dbContext, ICurrentUser currentUser)
    : IQueryHandler<GetNoticeQuery, NoticeDetailDto>
{
    /// <inheritdoc />
    public async Task<Result<NoticeDetailDto>> Handle(
        GetNoticeQuery request,
        CancellationToken cancellationToken)
    {
        // SEC-038: inline org filter — avoids existence leak (returns NotFound, not Forbidden)
        var notice = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstNotices.Where(n =>
                    n.Id == request.NoticeId &&
                    n.OrganizationId == currentUser.OrganizationId &&
                    n.DeletedAt == null),
                cancellationToken);

        if (notice is null)
            return Error.NotFound("GstNotice.NotFound", $"Notice {request.NoticeId} not found.");

        return new NoticeDetailDto(
            notice.Id,
            notice.OrganizationId,
            notice.NoticeNumber,
            notice.NoticeType,
            notice.IssuedBy,
            notice.Status,
            notice.IssuedDate,
            notice.DueDate,
            notice.Description,
            notice.AssignedCaId,
            notice.RespondedAt,
            notice.RespondedBy,
            notice.AttachmentsJson,
            notice.ResponseAttachmentsJson);
    }
}
