using FirebaseAdmin.Messaging;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// FCM push notification adapter using Firebase Admin SDK.
/// Sends to all active FCM tokens for the user.
/// Stale tokens (404 from FCM) are silently skipped per P6E-RISK-01.
/// </summary>
public sealed class FcmPushAdapter(ILogger<FcmPushAdapter> logger) : IChannelAdapter
{
    /// <inheritdoc />
    public NotificationChannel Channel => NotificationChannel.Push;

    /// <inheritdoc />
    public async Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default)
    {
        if (context.FcmTokens.Count == 0)
        {
            logger.LogDebug("No FCM tokens for user {UserId} — push skipped", context.UserId);
            return "NO_TOKENS";
        }

        var messaging = FirebaseMessaging.DefaultInstance;
        var sentIds = new List<string>();

        foreach (var token in context.FcmTokens)
        {
            var message = new Message
            {
                Token = token,
                Notification = new Notification
                {
                    Title = string.IsNullOrEmpty(context.RenderedSubject) ? context.EventCode : context.RenderedSubject,
                    Body = context.RenderedBody
                },
                Data = new Dictionary<string, string>
                {
                    ["event_code"] = context.EventCode,
                    ["locale"] = context.Locale
                }
            };

            try
            {
                var msgId = await messaging.SendAsync(message, ct);
                sentIds.Add(msgId);
                logger.LogDebug("FCM sent: user={UserId} event={EventCode} msgId={MsgId}",
                    context.UserId, context.EventCode, msgId);
            }
            catch (FirebaseMessagingException fex) when (fex.MessagingErrorCode == MessagingErrorCode.Unregistered)
            {
                // P6E-RISK-01: stale token — log and continue (mobile should re-register on next launch)
                logger.LogWarning("Stale FCM token for user {UserId}: {Token}", context.UserId, token[..Math.Min(20, token.Length)]);
            }
        }

        return string.Join(",", sentIds);
    }
}
