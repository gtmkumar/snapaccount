using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// In-app notification channel adapter.
/// Writes a row to <c>notification.notification</c> (the partitioned inbox table)
/// so the user's message-center inbox is populated.
///
/// DG-NOTIF-02: this was the missing adapter that caused every InApp send attempt
/// to be silently suppressed ("adapter null → suppressed++") in
/// <see cref="SendNotificationCommandHandler"/>.
///
/// The row is persisted via a dedicated <see cref="NotificationServiceDbContext"/> scope
/// (passed in through constructor DI) rather than through the INotificationDbContext
/// interface, because <see cref="InboxNotification.Create"/> is a write path — the
/// interface's DbSet is used for reads by query handlers.
/// </summary>
public sealed class InAppChannelAdapter(
    NotificationServiceDbContext dbContext,
    ILogger<InAppChannelAdapter> logger) : IChannelAdapter
{
    /// <inheritdoc />
    public NotificationChannel Channel => NotificationChannel.InApp;

    /// <inheritdoc />
    public async Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default)
    {
        var title = string.IsNullOrWhiteSpace(context.RenderedSubject)
            ? context.EventCode
            : context.RenderedSubject;

        var inbox = InboxNotification.Create(
            userId: context.UserId,
            eventType: context.EventCode,
            title: title,
            body: context.RenderedBody);

        dbContext.InboxNotifications.Add(inbox);
        await dbContext.SaveChangesAsync(ct);

        logger.LogDebug(
            "InApp notification written: user={UserId} event={EventCode} id={InboxId}",
            context.UserId, context.EventCode, inbox.Id);

        return inbox.Id.ToString();
    }
}
