using NotificationService.Domain.Entities;

namespace NotificationService.Application.Interfaces;

/// <summary>
/// Abstraction for a notification delivery adapter (FCM, MSG91, SendGrid, InApp).
/// Each adapter is responsible for one channel type.
/// </summary>
public interface IChannelAdapter
{
    /// <summary>The channel this adapter handles.</summary>
    NotificationChannel Channel { get; }

    /// <summary>
    /// Sends a rendered notification message.
    /// Returns the provider-assigned message ID on success, or throws on failure.
    /// </summary>
    Task<string> SendAsync(NotificationDispatchContext context, CancellationToken ct = default);
}

/// <summary>Context passed to a channel adapter for dispatch.</summary>
public record NotificationDispatchContext(
    Guid UserId,
    string EventCode,
    string RenderedSubject,
    string RenderedBody,
    string? DltTemplateId,
    string? SenderName,
    string? RecipientEmail,
    string? RecipientPhone,
    IReadOnlyList<string> FcmTokens,
    string Locale,
    IReadOnlyDictionary<string, string> Metadata);
