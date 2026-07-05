using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Commands.UpdateTemplate;

/// <summary>
/// Updates an existing notification template's body, subject, and provider metadata.
/// In-place update (no versioning) — use CreateTemplate for a new version.
/// RBAC: requires notification.templates.manage (admin-only).
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record UpdateTemplateCommand(
    Guid TemplateId,
    string Body,
    string? Subject = null,
    string? DltTemplateId = null,
    string? SenderName = null,
    bool? IsActive = null) : ICommand<UpdateTemplateResponse>;

/// <summary>Response after updating.</summary>
public record UpdateTemplateResponse(Guid TemplateId, DateTime UpdatedAt);

/// <summary>Validates UpdateTemplateCommand.</summary>
public sealed class UpdateTemplateCommandValidator : AbstractValidator<UpdateTemplateCommand>
{
    public UpdateTemplateCommandValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
        RuleFor(x => x.Body).NotEmpty().MaximumLength(10000);
        RuleFor(x => x.Subject).MaximumLength(500).When(x => x.Subject != null);
        RuleFor(x => x.DltTemplateId).MaximumLength(100).When(x => x.DltTemplateId != null);
        RuleFor(x => x.SenderName).MaximumLength(50).When(x => x.SenderName != null);
    }
}

/// <summary>Handles UpdateTemplateCommand — in-place body/metadata update.</summary>
public sealed class UpdateTemplateCommandHandler(
    INotificationDbContext db) : ICommandHandler<UpdateTemplateCommand, UpdateTemplateResponse>
{
    /// <inheritdoc />
    public async Task<Result<UpdateTemplateResponse>> Handle(
        UpdateTemplateCommand request,
        CancellationToken cancellationToken)
    {
        var template = await db.NotificationTemplates
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, cancellationToken);

        if (template == null)
            return Result<UpdateTemplateResponse>.Failure(Error.NotFound("Template.NotFound", "Notification template not found."));

        template.Update(request.Body, request.Subject, request.DltTemplateId, request.SenderName);

        // CG-11: an admin can flip a template active/inactive. Only applied when the
        // caller supplies IsActive, so body-only updates leave the active state untouched.
        if (request.IsActive.HasValue)
            template.SetActive(request.IsActive.Value);

        await db.SaveChangesAsync(cancellationToken);

        return Result<UpdateTemplateResponse>.Success(new UpdateTemplateResponse(template.Id, template.UpdatedAt));
    }
}
