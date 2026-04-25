using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// E-Way Bill record for goods movement exceeding INR 50,000.
/// P6-HANDOFF-13: canonical table is gst.e_way_bills (migration 022).
/// </summary>
public class EWayBill : BaseAuditableEntity
{
    /// <summary>Organisation that generated this EWB.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>NIC-assigned EWB number after successful generation.</summary>
    public string? EwbNumber { get; private set; }

    /// <summary>Linked GST invoice (optional).</summary>
    public Guid? GstInvoiceId { get; private set; }

    /// <summary>Supply type: OUTWARD or INWARD.</summary>
    public string SupplyType { get; private set; } = string.Empty;

    /// <summary>Sub-supply type code.</summary>
    public string? SubSupplyType { get; private set; }

    /// <summary>GSTIN of the transporter.</summary>
    public string? TransporterId { get; private set; }

    /// <summary>Name of the transporter.</summary>
    public string? TransporterName { get; private set; }

    /// <summary>Vehicle registration number.</summary>
    public string? VehicleNumber { get; private set; }

    /// <summary>Vehicle type (R=Regular, O=ODC, etc.).</summary>
    public string? VehicleType { get; private set; }

    /// <summary>Approximate distance in km.</summary>
    public int? DistanceKm { get; private set; }

    /// <summary>Place of dispatch.</summary>
    public string? FromPlace { get; private set; }

    /// <summary>Dispatch pincode.</summary>
    public string? FromPincode { get; private set; }

    /// <summary>Delivery place.</summary>
    public string? ToPlace { get; private set; }

    /// <summary>Delivery pincode.</summary>
    public string? ToPincode { get; private set; }

    /// <summary>Total invoice value (INR).</summary>
    public decimal TotalValue { get; private set; }

    /// <summary>Status: GENERATED | CANCELLED | EXTENDED | EXPIRED.</summary>
    public string EwbStatus { get; private set; } = "PENDING";

    /// <summary>Timestamp when the EWB was generated on the NIC portal.</summary>
    public DateTime? GeneratedAt { get; private set; }

    /// <summary>EWB validity expiry (usually 1 day per 100 km; minimum 1 day).</summary>
    public DateTime? ValidUpto { get; private set; }

    /// <summary>Timestamp when the EWB was cancelled.</summary>
    public DateTime? CancelledAt { get; private set; }

    private EWayBill() { }

    /// <summary>Factory — creates a new EWB in PENDING status.</summary>
    public static EWayBill Create(
        Guid orgId,
        string supplyType,
        decimal totalValue,
        string? fromPlace = null,
        string? toPlace = null)
        => new()
        {
            OrganizationId = orgId,
            SupplyType = supplyType,
            TotalValue = totalValue,
            FromPlace = fromPlace,
            ToPlace = toPlace
        };

    /// <summary>Links this EWB to a specific GST invoice.</summary>
    public void SetInvoiceLink(Guid gstInvoiceId) => GstInvoiceId = gstInvoiceId;

    /// <summary>Sets the vehicle details.</summary>
    public void SetVehicle(string? vehicleNumber, string? vehicleType = "R")
    {
        VehicleNumber = vehicleNumber;
        VehicleType = vehicleType;
    }

    /// <summary>Marks the EWB as generated with the NIC-assigned number and validity.</summary>
    public void SetGenerated(string ewbNumber, DateTime validUpto)
    {
        EwbNumber = ewbNumber;
        EwbStatus = "GENERATED";
        GeneratedAt = DateTime.UtcNow;
        ValidUpto = validUpto;
    }

    /// <summary>Cancels the EWB.</summary>
    public void Cancel()
    {
        EwbStatus = "CANCELLED";
        CancelledAt = DateTime.UtcNow;
    }
}
