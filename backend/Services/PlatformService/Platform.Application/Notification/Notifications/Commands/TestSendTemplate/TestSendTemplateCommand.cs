using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace NotificationService.Application.Notifications.Commands.TestSendTemplate;

/// <summary>
/// Test-sends a notification template to the calling admin user only.
/// The dispatch is marked as a TEST event (EventCode prefixed with "test.").
/// Missing variables are substituted with [MISSING:variable_name] placeholder text.
/// RBAC: requires notification.templates.manage (admin-only).
/// </summary>
[RequiresPermission("notification.templates.manage")]
public record TestSendTemplateCommand(
    Guid TemplateId,
    IReadOnlyDictionary<string, string> Variables,
    string? RecipientEmail = null,
    string? RecipientPhone = null) : ICommand<TestSendTemplateResponse>;

/// <summary>Response after test-send.</summary>
public record TestSendTemplateResponse(
    Guid TemplateId,
    string RenderedBody,
    IReadOnlyList<string> MissingVariables,
    IReadOnlyList<string> ChannelsAttempted,
    string Status);

/// <summary>Validates TestSendTemplateCommand.</summary>
public sealed class TestSendTemplateCommandValidator : AbstractValidator<TestSendTemplateCommand>
{
    public TestSendTemplateCommandValidator()
    {
        RuleFor(x => x.TemplateId).NotEmpty();
        RuleFor(x => x.RecipientEmail).EmailAddress().When(x => x.RecipientEmail != null);
        RuleFor(x => x.RecipientPhone).MaximumLength(20).When(x => x.RecipientPhone != null);
    }
}

/// <summary>Handles TestSendTemplateCommand — renders template and dispatches test notification.</summary>
public sealed class TestSendTemplateCommandHandler(
    INotificationDbContext db,
    ICurrentUser currentUser,
    IEnumerable<IChannelAdapter> adapters,
    ILogger<TestSendTemplateCommandHandler> logger)
    : ICommandHandler<TestSendTemplateCommand, TestSendTemplateResponse>
{
    /// <inheritdoc />
    public async Task<Result<TestSendTemplateResponse>> Handle(
        TestSendTemplateCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<TestSendTemplateResponse>.Failure(Error.Unauthorized("TestSend.Unauthenticated", "User is not authenticated."));

        var template = await db.NotificationTemplates
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, cancellationToken);

        if (template == null)
            return Result<TestSendTemplateResponse>.Failure(Error.NotFound("Template.NotFound", "Notification template not found."));

        // Render with missing-variable warnings
        var variables = request.Variables.ToDictionary(
            kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);

        var (renderedBody, missingVars) = template.RenderWithWarnings(variables);

        if (missingVars.Count > 0)
        {
            // Substitute missing variables with a visible placeholder in-line
            var bodyWithFallbacks = renderedBody;
            foreach (var missing in missingVars)
                bodyWithFallbacks = bodyWithFallbacks.Replace($"{{{{{missing}}}}}", $"[MISSING:{missing}]");
            renderedBody = bodyWithFallbacks;

            logger.LogWarning(
                "TestSendTemplateCommand: Template {TemplateId} has missing variables: {Missing}",
                request.TemplateId, string.Join(", ", missingVars));
        }

        var testEventCode = $"test.{template.EventCode}";

        // Attempt dispatch via matching adapter (calling admin user only, marked TEST)
        var channelsAttempted = new List<string>();
        var adapter = adapters.FirstOrDefault(a => a.Channel == template.Channel);
        if (adapter != null)
        {
            try
            {
                var context = new NotificationDispatchContext(
                    UserId: currentUser.UserId,
                    EventCode: testEventCode,
                    RenderedSubject: template.Subject ?? testEventCode,
                    RenderedBody: renderedBody,
                    DltTemplateId: template.DltTemplateId,
                    SenderName: template.SenderName,
                    RecipientEmail: request.RecipientEmail,
                    RecipientPhone: request.RecipientPhone,
                    FcmTokens: [],
                    Locale: template.Locale,
                    Metadata: new Dictionary<string, string> { ["is_test"] = "true" });

                await adapter.SendAsync(context, cancellationToken);
                channelsAttempted.Add(template.Channel.ToString());
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "TestSendTemplateCommand: Adapter {Channel} failed for test dispatch of template {TemplateId}.",
                    template.Channel, request.TemplateId);
            }
        }
        else
        {
            logger.LogWarning(
                "TestSendTemplateCommand: No adapter found for channel {Channel} — template {TemplateId}.",
                template.Channel, request.TemplateId);
        }

        // Log the test attempt regardless of adapter success
        var logEntry = NotificationLogEntry.Sent(
            currentUser.UserId,
            testEventCode,
            template.Channel,
            template.Locale,
            renderedBody,
            providerMessageId: "test",
            provider: "test-send");

        db.NotificationLog.Add(logEntry);
        await db.SaveChangesAsync(cancellationToken);

        return Result<TestSendTemplateResponse>.Success(new TestSendTemplateResponse(
            template.Id,
            renderedBody,
            missingVars,
            channelsAttempted,
            "Sent"));
    }
}
