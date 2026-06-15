namespace NotificationService.Domain.Entities;

/// <summary>Dispatch channel for a notification.</summary>
public enum NotificationChannel
{
    Push,
    Sms,
    Email,
    InApp,
    /// <summary>
    /// GAP-045: WhatsApp Business Cloud API.
    /// Flagged off by default — requires WhatsApp:Enabled=true in configuration
    /// and a provisioned WABA (WhatsApp Business Account) phone number ID + access token.
    /// Decision #2: "full implementation, flagged off by default."
    /// </summary>
    WhatsApp
}
