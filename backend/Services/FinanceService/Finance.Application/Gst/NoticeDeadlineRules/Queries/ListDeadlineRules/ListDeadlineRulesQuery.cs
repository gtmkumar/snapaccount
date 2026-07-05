using GstService.Application.Interfaces;
using GstService.Domain.Enums;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.NoticeDeadlineRules.Queries.ListDeadlineRules;

/// <summary>
/// Returns all active GST notice statutory deadline rules.
/// Config-driven and FY-versioned per house compliance rule.
/// GAP-108: exposed so admin operators can view and reason about the deadline engine config.
/// </summary>
[RequiresPermission("gst.notices.read")]
public record ListDeadlineRulesQuery(string? FinancialYear = null)
    : IQuery<IReadOnlyList<DeadlineRuleDto>>;

/// <summary>Deadline rule DTO for API consumers.</summary>
public record DeadlineRuleDto(
    Guid Id,
    string FinancialYear,
    string FormType,
    int ResponseWindowDays,
    bool AllowsNoticeTextOverride,
    string? LegalBasis,
    bool IsActive);

/// <summary>Handler for <see cref="ListDeadlineRulesQuery"/>.</summary>
public sealed class ListDeadlineRulesQueryHandler(IGstNoticeDeadlineService deadlineService)
    : IQueryHandler<ListDeadlineRulesQuery, IReadOnlyList<DeadlineRuleDto>>
{
    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<DeadlineRuleDto>>> Handle(
        ListDeadlineRulesQuery request,
        CancellationToken cancellationToken)
    {
        var rules = await deadlineService.GetActiveRulesAsync(request.FinancialYear, cancellationToken);

        var dtos = rules.Select(r => new DeadlineRuleDto(
            r.Id,
            r.FinancialYear,
            r.FormType.ToString(),
            r.ResponseWindowDays,
            r.AllowsNoticeTextOverride,
            r.LegalBasis,
            r.IsActive)).ToList();

        return Result<IReadOnlyList<DeadlineRuleDto>>.Success(dtos);
    }
}
