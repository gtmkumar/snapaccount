using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// An assessee-raised grievance against a filing or notice.
/// Status: OPEN | IN_PROGRESS | RESOLVED | CLOSED.
/// P6-HANDOFF-23.
/// </summary>
public class Grievance : BaseAuditableEntity
{
    public Guid FilingId { get; private set; }
    public Guid AssesseeId { get; private set; }
    public Guid RaisedByUserId { get; private set; }
    public string Subject { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public string Category { get; private set; } = string.Empty;
    public string Status { get; private set; } = "OPEN";
    public Guid? AssignedTo { get; private set; }
    public string? Response { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    private Grievance() { }

    public static Grievance Create(
        Guid filingId, Guid assesseeId, Guid raisedByUserId,
        string subject, string body, string category)
        => new()
        {
            FilingId = filingId,
            AssesseeId = assesseeId,
            RaisedByUserId = raisedByUserId,
            Subject = subject,
            Body = body,
            Category = category,
            Status = "OPEN",
        };

    public void Assign(Guid userId)
    {
        AssignedTo = userId;
        if (Status == "OPEN") Status = "IN_PROGRESS";
    }

    public void Resolve(string response)
    {
        Response = response;
        ResolvedAt = DateTime.UtcNow;
        Status = "RESOLVED";
    }

    public void Close() => Status = "CLOSED";
}
