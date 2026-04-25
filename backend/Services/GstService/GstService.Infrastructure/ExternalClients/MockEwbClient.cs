using GstService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Mock E-Way Bill client — used when <c>GST_PRODUCTION_APIS_ENABLED</c> is not "true".
/// Returns deterministic EWB numbers for development and testing.
/// </summary>
public sealed class MockEwbClient(ILogger<MockEwbClient> logger) : IEwbClient
{
    /// <inheritdoc />
    public Task<EwbApiResult> GenerateEwbAsync(EwbPayload payload, CancellationToken ct = default)
    {
        var mockEwbNumber = $"EWB{DateTime.UtcNow:yyyyMMddHHmmss}{Random.Shared.Next(10000, 99999)}";
        var validUpto = DateTime.UtcNow.AddDays(1); // 1-day validity for mock (72h for real EWB)
        logger.LogInformation("[MOCK] GenerateEwb supplyType={SupplyType} ewbNumber={EwbNumber}", payload.SupplyType, mockEwbNumber);
        return Task.FromResult(new EwbApiResult(
            IsSuccess: true,
            EwbNumber: mockEwbNumber,
            ValidUpto: validUpto,
            RedactedRequestJson: """{"supplyType":"[REDACTED]","supplierGstin":"[REDACTED]"}""",
            RedactedResponseJson: $$$"""{"ewbNo":"{{{mockEwbNumber}}}","validUpto":"{{{validUpto:O}}}","status":"GENERATED"}""",
            ErrorMessage: null));
    }

    /// <inheritdoc />
    public Task<EwbCancelResult> CancelEwbAsync(string ewbNumber, string cancelReason, CancellationToken ct = default)
    {
        logger.LogInformation("[MOCK] CancelEwb ewbNumber={EwbNumber}", ewbNumber);
        return Task.FromResult(new EwbCancelResult(IsSuccess: true, ErrorMessage: null));
    }
}
