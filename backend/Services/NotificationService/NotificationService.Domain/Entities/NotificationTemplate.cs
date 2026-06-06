using SnapAccount.Shared.Domain;

namespace NotificationService.Domain.Entities;

/// <summary>
/// Versioned notification template for a specific (event_code, channel, locale) combination.
/// Only the row with <see cref="IsCurrent"/> = true is used for dispatch.
/// Templates include placeholder strings rendered by the fan-out pipeline.
/// </summary>
public class NotificationTemplate : BaseAuditableEntity
{
    /// <summary>
    /// Unique template code (maps to the <c>code</c> column, NOT NULL UNIQUE in SQL).
    /// Derived deterministically from (event_code, channel, locale) so the seeder can
    /// produce one stable, unique row per combination.
    /// </summary>
    public string Code { get; private set; } = string.Empty;

    /// <summary>Human-readable template name (maps to the <c>name</c> column, NOT NULL in SQL).</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Maps to the SQL <c>event_type</c> column (the event this template serves).</summary>
    public string EventCode { get; private set; } = string.Empty;

    /// <summary>Push, Sms, Email, InApp.</summary>
    public NotificationChannel Channel { get; private set; }

    /// <summary>en, hi, bn (and future regional locales).</summary>
    public string Locale { get; private set; } = "en";

    /// <summary>Template subject (for Email and InApp).</summary>
    public string? Subject { get; private set; }

    /// <summary>Template body with {{placeholder}} tokens.</summary>
    public string Body { get; private set; } = string.Empty;

    /// <summary>MSG91 DLT template ID — required for SMS dispatch. Null = not yet registered.</summary>
    public string? DltTemplateId { get; private set; }

    /// <summary>MSG91 sender ID for this template.</summary>
    public string? SenderName { get; private set; }

    /// <summary>Whether this is the active version for (event_code, channel, locale).</summary>
    public bool IsCurrent { get; private set; } = true;

    /// <summary>Version effective from this date.</summary>
    public DateOnly EffectiveFrom { get; private set; }

    /// <summary>Version effective to this date. Null = current.</summary>
    public DateOnly? EffectiveTo { get; private set; }

    private NotificationTemplate() { }

    /// <summary>Creates a new current template.</summary>
    public static NotificationTemplate Create(
        string eventCode,
        NotificationChannel channel,
        string locale,
        string body,
        string? subject = null,
        string? dltTemplateId = null,
        string? senderName = null)
        => new()
        {
            // code is NOT NULL UNIQUE in SQL. Derive a stable, unique code per
            // (event_code, channel, locale) so the seeder's rows never collide.
            Code = $"{eventCode}__{channel.ToString().ToUpperInvariant()}__{locale.ToLowerInvariant()}",
            // name is NOT NULL in SQL. Default to a readable composite; the admin panel
            // can override it later without affecting dispatch.
            Name = $"{eventCode} ({channel}/{locale})",
            EventCode = eventCode,
            Channel = channel,
            Locale = locale,
            Body = body,
            Subject = subject,
            DltTemplateId = dltTemplateId,
            SenderName = senderName,
            IsCurrent = true,
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow)
        };

    /// <summary>Renders the template body by replacing {{key}} tokens with values.</summary>
    public string Render(IReadOnlyDictionary<string, string> variables)
    {
        var rendered = Body;
        foreach (var (key, value) in variables)
            rendered = rendered.Replace($"{{{{{key}}}}}", value, StringComparison.OrdinalIgnoreCase);
        return rendered;
    }
}
