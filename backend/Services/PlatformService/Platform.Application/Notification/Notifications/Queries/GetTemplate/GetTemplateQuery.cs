using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using FluentValidation;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Queries.GetTemplate;

/// <summary>Gets a single notification template by ID.</summary>
[RequiresPermission("notification.templates.manage")]
public record GetTemplateQuery(Guid TemplateId) : IQuery<TemplateDetailDto>;

/// <summary>Full template detail DTO.</summary>
public record TemplateDetailDto(
    Guid Id,
    string Code,
    string Name,
    string EventCode,
    string Channel,
    string Locale,
    string? Subject,
    string Body,
    string? DltTemplateId,
    string? SenderName,
    bool IsCurrent,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<string> PlaceholderNames)
{
    /// <summary>Alias of <see cref="IsCurrent"/> — the admin UI's active/inactive toggle field (CG-11).</summary>
    public bool IsActive => IsCurrent;
}

/// <summary>Validates GetTemplateQuery.</summary>
public sealed class GetTemplateQueryValidator : AbstractValidator<GetTemplateQuery>
{
    public GetTemplateQueryValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
    }
}

/// <summary>Handles GetTemplateQuery.</summary>
public sealed class GetTemplateQueryHandler(
    INotificationDbContext db) : IQueryHandler<GetTemplateQuery, TemplateDetailDto>
{
    /// <inheritdoc />
    public async Task<Result<TemplateDetailDto>> Handle(
        GetTemplateQuery request,
        CancellationToken cancellationToken)
    {
        var t = await db.NotificationTemplates
            .FirstOrDefaultAsync(x => x.Id == request.TemplateId, cancellationToken);

        if (t == null)
            return Result<TemplateDetailDto>.Failure(Error.NotFound("Template.NotFound", "Notification template not found."));

        // Extract {{placeholder}} names from body and subject
        var placeholders = ExtractPlaceholders(t.Body)
            .Concat(ExtractPlaceholders(t.Subject ?? ""))
            .Distinct()
            .ToList();

        return Result<TemplateDetailDto>.Success(new TemplateDetailDto(
            t.Id, t.Code, t.Name, t.EventCode,
            t.Channel.ToString(), t.Locale, t.Subject, t.Body,
            t.DltTemplateId, t.SenderName, t.IsCurrent,
            t.EffectiveFrom, t.EffectiveTo,
            t.CreatedAt, t.UpdatedAt, placeholders));
    }

    private static IEnumerable<string> ExtractPlaceholders(string text)
    {
        var matches = System.Text.RegularExpressions.Regex.Matches(text, @"\{\{(\w+)\}\}");
        return matches.Select(m => m.Groups[1].Value);
    }
}
