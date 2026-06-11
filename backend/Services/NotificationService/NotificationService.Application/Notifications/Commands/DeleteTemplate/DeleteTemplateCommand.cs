using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Commands.DeleteTemplate;

/// <summary>
/// Soft-deletes a notification template.
/// Active (IsCurrent) templates cannot be deleted — retire them first by creating a new version.
/// RBAC: requires notification.templates.manage (admin-only).
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record DeleteTemplateCommand(Guid TemplateId) : ICommand<DeleteTemplateResponse>;

/// <summary>Response after deleting.</summary>
public record DeleteTemplateResponse(Guid TemplateId, bool WasActive);

/// <summary>Validates DeleteTemplateCommand.</summary>
public sealed class DeleteTemplateCommandValidator : AbstractValidator<DeleteTemplateCommand>
{
    public DeleteTemplateCommandValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
    }
}

/// <summary>Handles DeleteTemplateCommand — soft-deletes a non-active template.</summary>
public sealed class DeleteTemplateCommandHandler(
    INotificationDbContext db) : ICommandHandler<DeleteTemplateCommand, DeleteTemplateResponse>
{
    /// <inheritdoc />
    public async Task<Result<DeleteTemplateResponse>> Handle(
        DeleteTemplateCommand request,
        CancellationToken cancellationToken)
    {
        var template = await db.NotificationTemplates
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, cancellationToken);

        if (template == null)
            return Result<DeleteTemplateResponse>.Failure(Error.NotFound("Template.NotFound", "Notification template not found."));

        var wasActive = template.IsCurrent;
        template.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Result<DeleteTemplateResponse>.Success(new DeleteTemplateResponse(template.Id, wasActive));
    }
}
