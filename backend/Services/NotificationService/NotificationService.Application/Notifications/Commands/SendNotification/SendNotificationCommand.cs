using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using System.Security.Cryptography;
using System.Text;

namespace NotificationService.Application.Notifications.Commands.SendNotification;

/// <summary>
/// Fan-out dispatcher: given a user ID + event code + variables, resolves channel preferences,
/// renders the correct template (locale-aware), and dispatches to each eligible channel.
/// Enforces: quiet hours, DND, dedupe window (6h), DLT template approval gate for SMS.
/// This is the single entry point called by all other services when they want to notify a user.
/// </summary>
public record SendNotificationCommand(
    Guid UserId,
    string EventCode,
    string Locale,
    IReadOnlyDictionary<string, string> Variables,
    string? RecipientEmail = null,
    string? RecipientPhone = null) : ICommand<SendNotificationResponse>;

/// <summary>Per-channel dispatch result.</summary>
public record ChannelResult(NotificationChannel Channel, DispatchStatus Status, string? MessageId, string? Error);

/// <summary>Response after fan-out dispatch.</summary>
public record SendNotificationResponse(
    IReadOnlyList<ChannelResult> Results,
    int DispatchedCount,
    int SuppressedCount);

/// <summary>Validates the send notification command.</summary>
public sealed class SendNotificationCommandValidator : AbstractValidator<SendNotificationCommand>
{
    public SendNotificationCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.EventCode).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Locale).NotEmpty().Must(l => l is "en" or "hi" or "bn")
            .WithMessage("Locale must be en, hi, or bn.");
    }
}

/// <summary>Handles <see cref="SendNotificationCommand"/> — fan-out pipeline.</summary>
public sealed class SendNotificationCommandHandler(
    INotificationDbContext dbContext,
    IEnumerable<IChannelAdapter> adapters,
    ILogger<SendNotificationCommandHandler> logger)
    : ICommandHandler<SendNotificationCommand, SendNotificationResponse>
{
    private static readonly TimeSpan DedupeWindow = TimeSpan.FromHours(6);

    /// <inheritdoc />
    public async Task<Result<SendNotificationResponse>> Handle(
        SendNotificationCommand request,
        CancellationToken cancellationToken)
    {
        // Load preferences for this user/event
        var prefs = await dbContext.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == request.UserId && p.EventCode == request.EventCode, cancellationToken);

        // Load FCM tokens
        var tokens = await dbContext.PushTokens
            .Where(t => t.UserId == request.UserId && t.IsActive && t.DeletedAt == null)
            .Select(t => t.Token)
            .ToListAsync(cancellationToken);

        var results = new List<ChannelResult>();
        var dispatched = 0;
        var suppressed = 0;

        foreach (var channelEnum in new[] { NotificationChannel.Push, NotificationChannel.Sms, NotificationChannel.Email, NotificationChannel.InApp })
        {
            if (!IsChannelEnabled(prefs, channelEnum)) { suppressed++; continue; }
            if (prefs?.DoNotDisturb == true) { suppressed++; continue; }
            if (IsQuietHours(prefs)) { suppressed++; continue; }

            // Dedupe check
            var dedupeKey = ComputeDedupeKey(request.UserId, request.EventCode, channelEnum);
            var recentlySent = await dbContext.NotificationLog
                .AnyAsync(l => l.DedupeKey == dedupeKey
                             && l.CreatedAt > DateTime.UtcNow.Subtract(DedupeWindow)
                             && l.Status == DispatchStatus.Sent, cancellationToken);

            if (recentlySent)
            {
                logger.LogDebug("Notification dedupe suppressed: user={UserId} event={EventCode} channel={Channel}",
                    request.UserId, request.EventCode, channelEnum);
                results.Add(new ChannelResult(channelEnum, DispatchStatus.Suppressed, null, "Deduplication window"));
                suppressed++;
                continue;
            }

            // Fetch template
            var template = await dbContext.NotificationTemplates
                .FirstOrDefaultAsync(t => t.EventCode == request.EventCode
                                       && t.Channel == channelEnum
                                       && t.Locale == request.Locale
                                       && t.IsCurrent
                                       && t.DeletedAt == null, cancellationToken);

            if (template is null)
            {
                logger.LogDebug("No template found for event={EventCode} channel={Channel} locale={Locale}",
                    request.EventCode, channelEnum, request.Locale);
                suppressed++;
                continue;
            }

            // DLT gate for SMS — regulatory requirement (TRAI India)
            if (channelEnum == NotificationChannel.Sms && string.IsNullOrEmpty(template.DltTemplateId))
            {
                logger.LogWarning("SMS dispatch blocked — DLT template ID not registered for event={EventCode}. " +
                    "Register templates with TRAI DLT portal before enabling SMS.", request.EventCode);
                results.Add(new ChannelResult(channelEnum, DispatchStatus.Suppressed, null, "DLT template not registered"));
                suppressed++;
                continue;
            }

            var renderedBody = template.Render(request.Variables);
            var renderedSubject = template.Subject != null ? template.Render(request.Variables) : string.Empty;

            var adapter = adapters.FirstOrDefault(a => a.Channel == channelEnum);
            if (adapter is null) { suppressed++; continue; }

            var context = new NotificationDispatchContext(
                request.UserId,
                request.EventCode,
                renderedSubject,
                renderedBody,
                template.DltTemplateId,
                template.SenderName,
                request.RecipientEmail,
                request.RecipientPhone,
                tokens,
                request.Locale,
                request.Variables);

            try
            {
                var msgId = await adapter.SendAsync(context, cancellationToken);
                var logEntry = NotificationLogEntry.Sent(
                    request.UserId, request.EventCode, channelEnum,
                    request.Locale, renderedBody, msgId, adapter.Channel.ToString(), dedupeKey: dedupeKey);
                dbContext.NotificationLog.Add(logEntry);
                results.Add(new ChannelResult(channelEnum, DispatchStatus.Sent, msgId, null));
                dispatched++;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notification dispatch failed: user={UserId} event={EventCode} channel={Channel}",
                    request.UserId, request.EventCode, channelEnum);
                var logEntry = NotificationLogEntry.Failed(
                    request.UserId, request.EventCode, channelEnum,
                    request.Locale, renderedBody, ex.Message, dedupeKey: dedupeKey);
                dbContext.NotificationLog.Add(logEntry);
                results.Add(new ChannelResult(channelEnum, DispatchStatus.Failed, null, ex.Message));

                // Move to DLQ after repeated failure
                var dlqItem = DlqItem.Create(request.UserId, request.EventCode, channelEnum,
                    request.Locale, renderedBody, ex.Message, 1);
                dbContext.DlqItems.Add(dlqItem);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return new SendNotificationResponse(results, dispatched, suppressed);
    }

    private static bool IsChannelEnabled(NotificationPreference? prefs, NotificationChannel channel)
        => prefs is null || channel switch
        {
            NotificationChannel.Push => prefs.PushEnabled,
            NotificationChannel.Sms => prefs.SmsEnabled,
            NotificationChannel.Email => prefs.EmailEnabled,
            NotificationChannel.InApp => prefs.InAppEnabled,
            _ => true
        };

    private static bool IsQuietHours(NotificationPreference? prefs)
    {
        if (prefs?.QuietHoursStart is null || prefs.QuietHoursEnd is null) return false;
        var nowIst = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"));
        var nowTime = TimeOnly.FromDateTime(nowIst);
        var start = TimeOnly.Parse(prefs.QuietHoursStart);
        var end = TimeOnly.Parse(prefs.QuietHoursEnd);
        return start <= end ? nowTime >= start && nowTime <= end : nowTime >= start || nowTime <= end;
    }

    private static string ComputeDedupeKey(Guid userId, string eventCode, NotificationChannel channel)
    {
        var raw = $"{userId}|{eventCode}|{channel}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }
}
