using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class UserPreference : BaseAuditableEntity
{
    public Guid UserId { get; init; }
    public string PreferredLanguage { get; set; } = "en";
    public string Theme { get; set; } = "LIGHT"; // LIGHT, DARK, SYSTEM
    public bool PushNotificationsEnabled { get; set; } = true;
    public bool SmsNotificationsEnabled { get; set; } = true;
    public bool EmailNotificationsEnabled { get; set; } = true;
    public bool WhatsappNotificationsEnabled { get; set; } = false;
}
