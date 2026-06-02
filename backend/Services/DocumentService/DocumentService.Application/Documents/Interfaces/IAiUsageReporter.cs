namespace DocumentService.Application.Documents.Interfaces;

/// <summary>
/// Reports a metered AI call to the central usage ledger (AuthService). Fire-and-forget /
/// best-effort — a reporting failure must never break the OCR flow.
/// </summary>
public interface IAiUsageReporter
{
    Task ReportAsync(string provider, string model, string feature,
        int inputTokens, int outputTokens, int units, int latencyMs, Guid? organizationId, CancellationToken ct);
}
