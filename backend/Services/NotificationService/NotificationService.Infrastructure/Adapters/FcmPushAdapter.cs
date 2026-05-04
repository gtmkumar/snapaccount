using FirebaseAdmin.Messaging;
using Microsoft.Extensions.Logging;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using System.Security.Cryptography;
using System.Text;

namespace NotificationService.Infrastructure.Adapters;

/// <summary>
/// FCM push notification adapter using Firebase Admin SDK.
/// Sends to all active FCM tokens for the user.
/// Stale tokens (404 from FCM) are silently skipped per P6E-RISK-01.
///
/// SEC-036: the Notification.Title falls back to a generic label rather than
/// the raw event_code (e.g. "itr.deadline.reminder"), and the FCM Data payload
/// no longer includes the cleartext event_code. A SHA-256 hash of the event_code
/// is sent instead, opaque on the wire but stable for client-side analytics
/// correlation. Mobile's notificationRouter.ts dispatches on the `type` field,
/// not event_code, so this is a non-breaking removal.
/// </summary>
public sealed class FcmPushAdapter(ILogger<FcmPushAdapter> logger) : IChannelAdapter
{
    private const string GenericPushTitle = "SnapAccount";

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
        var eventHash = HashEventCode(context.EventCode);

        foreach (var token in context.FcmTokens)
        {
            var message = new Message
            {
                Token = token,
                Notification = new Notification
                {
                    // SEC-036: never use raw event_code as a fallback title.
                    Title = string.IsNullOrEmpty(context.RenderedSubject) ? GenericPushTitle : context.RenderedSubject,
                    Body = context.RenderedBody
                },
                Data = new Dictionary<string, string>
                {
                    // SEC-036: hash, not cleartext.
                    ["event_hash"] = eventHash,
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

    /// <summary>
    /// SEC-036: SHA-256 hash of the event_code, lowercase hex (16-char prefix).
    /// Stable for analytics correlation but does not leak the event taxonomy
    /// (e.g. "loan.disbursed", "itr.notice.received") in FCM data payload.
    /// </summary>
    private static string HashEventCode(string eventCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(eventCode));
        return Convert.ToHexString(bytes).ToLowerInvariant()[..16];
    }
}
