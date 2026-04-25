namespace NotificationService.Domain.Entities;

/// <summary>Dispatch channel for a notification.</summary>
public enum NotificationChannel
{
    Push,
    Sms,
    Email,
    InApp
}
