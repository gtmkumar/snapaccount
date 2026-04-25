namespace GstService.Application.Interfaces;

/// <summary>
/// Abstraction over the NIC E-Way Bill portal API.
/// P6-HANDOFF-15: All implementations must redact API tokens before storing payloads.
/// E-Way Bills are mandatory for goods movement exceeding INR 50,000.
/// </summary>
public interface IEwbClient
{
    /// <summary>
    /// Generates an E-Way Bill and returns the EWB number and validity.
    /// </summary>
    Task<EwbApiResult> GenerateEwbAsync(EwbPayload payload, CancellationToken ct = default);

    /// <summary>
    /// Cancels an existing E-Way Bill.
    /// </summary>
    Task<EwbCancelResult> CancelEwbAsync(string ewbNumber, string cancelReason, CancellationToken ct = default);
}

/// <summary>Payload for E-Way Bill generation.</summary>
public sealed record EwbPayload(
    string SupplyType,
    string? SubSupplyType,
    decimal TotalValue,
    string? SupplierGstin,
    string? BuyerGstin,
    string? FromPlace,
    string? FromPincode,
    string? ToPlace,
    string? ToPincode,
    string? TransporterId,
    string? VehicleNumber,
    string? VehicleType,
    int? DistanceKm);

/// <summary>Result from EWB generation.</summary>
public sealed record EwbApiResult(
    bool IsSuccess,
    string? EwbNumber,
    DateTime? ValidUpto,
    string? RedactedRequestJson,
    string? RedactedResponseJson,
    string? ErrorMessage);

/// <summary>Result from EWB cancellation.</summary>
public sealed record EwbCancelResult(
    bool IsSuccess,
    string? ErrorMessage);
