using DocumentService.Application.Interfaces;

namespace DocumentService.Application.Documents.Interfaces;

/// <summary>
/// Resolves which <see cref="IOcrService"/> to use for extraction based on the platform AI
/// configuration (provider/model/key), fetched from AuthService. Falls back to the local
/// Tesseract engine when the configured provider has no key or isn't available.
/// </summary>
public interface IOcrServiceResolver
{
    Task<ResolvedOcr> ResolveAsync(CancellationToken ct);
}

/// <param name="Service">The chosen OCR implementation.</param>
/// <param name="Provider">The provider id actually used (after any fallback).</param>
/// <param name="Model">The model id used (for usage metering / pricing).</param>
public record ResolvedOcr(IOcrService Service, string Provider, string Model);
