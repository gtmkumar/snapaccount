using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class EInvoice : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid GstInvoiceId { get; private set; }
    public string IrnNumber { get; private set; } = string.Empty; // From NIC portal
    public string? AckNumber { get; private set; }
    public DateTime? AckDate { get; private set; }
    public string? SignedInvoiceData { get; private set; }
    public string? SignedQrCode { get; private set; }
    public string IrnStatus { get; private set; } = "GENERATED"; // GENERATED, CANCELLED
    public string? CancelReason { get; private set; }
    public DateTime? CancelledAt { get; private set; }

    private EInvoice() { }

    public static EInvoice Create(Guid orgId, Guid gstInvoiceId, string irnNumber,
        string? ackNumber, DateTime? ackDate, string? signedData, string? signedQrCode)
        => new()
        {
            OrganizationId = orgId,
            GstInvoiceId = gstInvoiceId,
            IrnNumber = irnNumber,
            AckNumber = ackNumber,
            AckDate = ackDate,
            SignedInvoiceData = signedData,
            SignedQrCode = signedQrCode
        };

    public void Cancel(string reason)
    {
        IrnStatus = "CANCELLED";
        CancelReason = reason;
        CancelledAt = DateTime.UtcNow;
    }
}
