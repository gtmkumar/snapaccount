using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Commands.CreateTemplate;

/// <summary>
/// Creates a new notification template for an (event_code × channel × locale) combination.
/// If an active template already exists for the same combination, it is retired (IsCurrent=false)
/// and this template becomes current.
/// RBAC: requires notification.templates.manage (admin-only).
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record CreateTemplateCommand(
    string EventCode,
    NotificationChannel Channel,
    string Locale,
    string Body,
    string? Subject = null,
    string? DltTemplateId = null,
    string? SenderName = null,
    string? Name = null) : ICommand<CreateTemplateResponse>;

/// <summary>Response after creating a template.</summary>
public record CreateTemplateResponse(
    Guid TemplateId,
    string Code,
    bool ReplacedPrevious);

/// <summary>Validates CreateTemplateCommand.</summary>
public sealed class CreateTemplateCommandValidator : AbstractValidator<CreateTemplateCommand>
{
    public CreateTemplateCommandValidator()
    {
        RuleFor(x => x.EventCode).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Channel).IsInEnum();
        RuleFor(x => x.Locale).NotEmpty().Must(l => l is "en" or "hi" or "bn")
            .WithMessage("Locale must be en, hi, or bn.");
        RuleFor(x => x.Body).NotEmpty().MaximumLength(10000);
        RuleFor(x => x.Subject).MaximumLength(500).When(x => x.Subject != null);
        RuleFor(x => x.DltTemplateId).MaximumLength(100).When(x => x.DltTemplateId != null);
        RuleFor(x => x.SenderName).MaximumLength(50).When(x => x.SenderName != null);
    }
}

/// <summary>Handles CreateTemplateCommand — retires existing current template and creates new one.</summary>
public sealed class CreateTemplateCommandHandler(
    INotificationDbContext db) : ICommandHandler<CreateTemplateCommand, CreateTemplateResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateTemplateResponse>> Handle(
        CreateTemplateCommand request,
        CancellationToken cancellationToken)
    {
        // Retire any existing current template for (event_code, channel, locale)
        var existing = await db.NotificationTemplates
            .Where(t => t.EventCode == request.EventCode
                     && t.Channel == request.Channel
                     && t.Locale == request.Locale
                     && t.IsCurrent)
            .ToListAsync(cancellationToken);

        bool replacedPrevious = existing.Count > 0;

        // Retire previous active templates
        foreach (var prev in existing)
            prev.Retire();

        // Create new template
        var template = NotificationTemplate.Create(
            request.EventCode,
            request.Channel,
            request.Locale,
            request.Body,
            request.Subject,
            request.DltTemplateId,
            request.SenderName);

        db.NotificationTemplates.Add(template);
        await db.SaveChangesAsync(cancellationToken);

        return Result<CreateTemplateResponse>.Success(
            new CreateTemplateResponse(template.Id, template.Code, replacedPrevious));
    }
}
