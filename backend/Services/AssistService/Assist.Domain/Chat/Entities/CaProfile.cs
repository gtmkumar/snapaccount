using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// CA (Chartered Accountant) staff metadata — availability, specialisation, and rating aggregate.
/// Canonical table: chat.ca_profiles (migration 080).
/// One row per CA user; updated by appointment ratings.
/// </summary>
public sealed class CaProfile : BaseAuditableEntity
{
    /// <summary>Firebase UID / auth.user.id for this CA.</summary>
    public Guid UserId { get; private set; }

    /// <summary>Display name shown to SME users in the booking screen.</summary>
    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Short bio or specialisation description (optional).</summary>
    public string? Bio { get; private set; }

    /// <summary>Comma-separated specialisation tags: GST, ITR, Loan, Accounting.</summary>
    public string? Specialisations { get; private set; }

    /// <summary>Average star rating (1.0–5.0), recomputed on each new rating. Default 0 = not rated yet.</summary>
    public decimal AverageRating { get; private set; }

    /// <summary>Total number of completed appointments that have been rated.</summary>
    public int RatingCount { get; private set; }

    /// <summary>Whether this CA is actively accepting bookings.</summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>Availability slots for this CA.</summary>
    public IReadOnlyList<AppointmentSlot> Slots => _slots.AsReadOnly();
    private readonly List<AppointmentSlot> _slots = [];

    private CaProfile() { }

    /// <summary>Creates a new CA profile for the given user.</summary>
    public static CaProfile Create(Guid userId, string displayName, string? bio = null, string? specialisations = null)
        => new()
        {
            UserId = userId,
            DisplayName = displayName,
            Bio = bio,
            Specialisations = specialisations,
            IsActive = true,
            AverageRating = 0m,
            RatingCount = 0
        };

    /// <summary>
    /// Updates the rolling average rating aggregate after a new appointment is rated.
    /// Thread-safe for single-writer pattern (Hangfire/handler serialises writes per CA).
    /// </summary>
    public void RecordRating(int stars)
    {
        if (stars < 1 || stars > 5)
            throw new ArgumentOutOfRangeException(nameof(stars), "Rating must be 1–5.");

        // Incremental average: avoidfloating-point accumulation error by using decimal.
        AverageRating = ((AverageRating * RatingCount) + stars) / (RatingCount + 1);
        RatingCount++;
    }

    /// <summary>Activates or deactivates this CA for bookings.</summary>
    public void SetActive(bool active) => IsActive = active;

    /// <summary>Updates display name and bio.</summary>
    public void Update(string displayName, string? bio, string? specialisations)
    {
        DisplayName = displayName;
        Bio = bio;
        Specialisations = specialisations;
    }
}
