namespace AuthService.Application.Interfaces;

/// <summary>
/// Performs a lightweight credential/connectivity check against an AI provider (e.g. list models)
/// without consuming generation tokens. Returns (ok, human-readable message).
/// </summary>
public interface IAiProviderTester
{
    Task<(bool ok, string message)> TestAsync(string provider, string apiKey, string? model, CancellationToken ct);
}
