using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// DPDP Act 2023 — User-submitted request to correct inaccurate personal data.
///
/// Requests must be addressed by a human reviewer (staff/admin) within the
/// statutory timeline (30 days under the DPDP Act unless extended).
///
/// Status lifecycle: "submitted" → "under_review" → "completed" | "rejected".
/// </summary>
public class DataCorrectionRequest : BaseAuditableEntity
{
    /// <summary>FK to the user who submitted the request.</summary>
    public Guid UserId { get; private set; }

    /// <summary>
    /// The field or data category the user wants corrected.
    /// Examples: "name", "date_of_birth", "pan_number", "address".
    /// </summary>
    public string DataCategory { get; private set; } = string.Empty;

    /// <summary>User-supplied description of the inaccuracy and requested correction.</summary>
    public string Description { get; private set; } = string.Empty;

    /// <summary>
    /// Current status: "submitted" | "under_review" | "completed" | "rejected".
    /// </summary>
    public string Status { get; private set; } = "submitted";

    /// <summary>Optional reviewer note (staff only, never exposed to end-user by default).</summary>
    public string? ReviewerNote { get; private set; }

    /// <summary>Staff user ID who processed this request. NULL until under review.</summary>
    public Guid? ReviewedByUserId { get; private set; }

    /// <summary>Timestamp when the request was resolved (completed or rejected).</summary>
    public DateTime? ResolvedAt { get; private set; }

    private DataCorrectionRequest() { }

    /// <summary>Creates a new correction request submitted by the user.</summary>
    public static DataCorrectionRequest Create(Guid userId, string dataCategory, string description)
        => new()
        {
            UserId = userId,
            DataCategory = dataCategory.Trim(),
            Description = description.Trim(),
            Status = "submitted",
        };

    /// <summary>Moves the request to under-review state.</summary>
    public void BeginReview(Guid reviewerUserId)
    {
        Status = "under_review";
        ReviewedByUserId = reviewerUserId;
    }

    /// <summary>Marks the request as completed by a staff reviewer.</summary>
    public void Complete(Guid reviewerUserId, string? note)
    {
        Status = "completed";
        ReviewedByUserId = reviewerUserId;
        ReviewerNote = note;
        ResolvedAt = DateTime.UtcNow;
    }

    /// <summary>Marks the request as rejected by a staff reviewer.</summary>
    public void Reject(Guid reviewerUserId, string reason)
    {
        Status = "rejected";
        ReviewedByUserId = reviewerUserId;
        ReviewerNote = reason;
        ResolvedAt = DateTime.UtcNow;
    }
}
