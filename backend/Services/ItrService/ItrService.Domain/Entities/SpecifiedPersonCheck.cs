using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Tracks Section 206AB / 206CCA specified person checks. A person is "specified"
/// if they have not filed ITR for 2 consecutive previous years in which TDS/TCS
/// exceeded INR 50,000. Specified persons are subject to higher TDS/TCS rates.
/// </summary>
public class SpecifiedPersonCheck : BaseAuditableEntity
{
    public Guid UserId { get; private set; }

    /// <summary>PAN of the person being checked.</summary>
    public string Pan { get; private set; } = string.Empty;

    /// <summary>Assessment year for which the check is performed, e.g. "2025-26".</summary>
    public string AssessmentYear { get; private set; } = string.Empty;

    public bool IsSpecifiedPerson { get; private set; }
    public string? Reason { get; private set; }
    public DateTime CheckedAt { get; private set; }

    /// <summary>MANUAL | API_TRACES | BULK_UPLOAD</summary>
    public string CheckSource { get; private set; } = "MANUAL";

    /// <summary>Reference ID / correlation ID from the TRACES API response, if applicable.</summary>
    public string? ApiResponseRef { get; private set; }

    /// <summary>Date until which this check result is considered valid.</summary>
    public DateTime? ValidUntil { get; private set; }

    private SpecifiedPersonCheck() { }

    /// <summary>
    /// Creates a new specified person check record.
    /// </summary>
    public static SpecifiedPersonCheck Create(
        Guid userId,
        string pan,
        string assessmentYear,
        bool isSpecifiedPerson,
        string checkSource = "MANUAL")
    {
        return new SpecifiedPersonCheck
        {
            UserId = userId,
            Pan = pan,
            AssessmentYear = assessmentYear,
            IsSpecifiedPerson = isSpecifiedPerson,
            CheckSource = checkSource,
            CheckedAt = DateTime.UtcNow
        };
    }
}
