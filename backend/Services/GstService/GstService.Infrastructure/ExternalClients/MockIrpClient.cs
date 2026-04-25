using GstService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Mock IRP client — used when <c>GST_PRODUCTION_APIS_ENABLED</c> is not "true".
/// Returns deterministic IRN responses for development and testing.
/// </summary>
public sealed class MockIrpClient(ILogger<MockIrpClient> logger) : IIrpClient
{
    /// <inheritdoc />
    public Task<IrpApiResult> GenerateIrnAsync(IrpInvoicePayload payload, CancellationToken ct = default)
    {
        var mockIrn = $"MOCKIREN{DateTime.UtcNow:yyyyMMddHHmmss}{Random.Shared.Next(1000, 9999)}";
        var mockAck = $"MOCKACK{DateTime.UtcNow:yyyyMMddHHmmss}";
        logger.LogInformation("[MOCK] GenerateIrn invoice={InvoiceNumber} irn={Irn}", payload.InvoiceNumber, mockIrn);
        return Task.FromResult(new IrpApiResult(
            IsSuccess: true,
            IrnNumber: mockIrn,
            AckNumber: mockAck,
            AckDate: DateTime.UtcNow,
            SignedInvoiceData: Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"MOCK_SIGNED_{mockIrn}")),
            SignedQrCode: Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"MOCK_QR_{mockIrn}")),
            RedactedRequestJson: """{"invoiceNo":"[REDACTED]","supplierGstin":"[REDACTED]"}""",
            RedactedResponseJson: $$$"""{"irn":"{{{mockIrn}}}","ackNo":"{{{mockAck}}}","status":"GENERATED"}""",
            ErrorMessage: null));
    }

    /// <inheritdoc />
    public Task<IrpCancelResult> CancelIrnAsync(string irn, string cancelReason, CancellationToken ct = default)
    {
        logger.LogInformation("[MOCK] CancelIrn irn={Irn}", irn);
        return Task.FromResult(new IrpCancelResult(IsSuccess: true, ErrorMessage: null));
    }
}
