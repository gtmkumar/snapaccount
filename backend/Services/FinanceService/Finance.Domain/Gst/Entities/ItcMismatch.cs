using SnapAccount.Shared.Domain;
using GstService.Domain.Events;

namespace GstService.Domain.Entities;

public class ItcMismatch : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? ItcRecordId { get; private set; }
    public string MismatchType { get; private set; } = string.Empty;
    // AMOUNT_MISMATCH, MISSING_IN_2B, EXCESS_CLAIM, DATE_MISMATCH, GSTIN_MISMATCH
    public decimal ClaimedAmount { get; private set; }
    public decimal AvailableAmount { get; private set; }
    public decimal DifferenceAmount => ClaimedAmount - AvailableAmount;
    public string Status { get; private set; } = "OPEN"; // OPEN, RESOLVED, IGNORED, ESCALATED
    public string? ResolutionNotes { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    public Guid? ResolvedBy { get; private set; }

    private ItcMismatch() { }

    public static ItcMismatch Detect(Guid orgId, Guid? itcRecordId, string mismatchType,
        decimal claimed, decimal available)
    {
        var mismatch = new ItcMismatch
        {
            OrganizationId = orgId,
            ItcRecordId = itcRecordId,
            MismatchType = mismatchType,
            ClaimedAmount = claimed,
            AvailableAmount = available
        };
        mismatch.AddDomainEvent(new ItcMismatchDetectedEvent(mismatch.Id, orgId, mismatchType, claimed - available));
        return mismatch;
    }

    public void Resolve(Guid resolvedBy, string notes)
    {
        Status = "RESOLVED";
        ResolvedBy = resolvedBy;
        ResolvedAt = DateTime.UtcNow;
        ResolutionNotes = notes;
    }
}
