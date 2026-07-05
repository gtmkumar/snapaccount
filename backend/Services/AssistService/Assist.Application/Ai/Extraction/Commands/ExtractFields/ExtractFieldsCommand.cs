using FluentValidation;
using SnapAccount.Shared.Application;

namespace AiService.Application.Extraction.Commands.ExtractFields;

/// <summary>
/// Extracts structured invoice/document fields from a document or raw text.
/// Resolves the AI provider from the platform AI config (per-feature override aware).
/// Redacts PAN/Aadhaar/card numbers before sending to the provider.
/// [MOCK-DEFAULT] Returns deterministic plausible values in local/CI.
/// </summary>
/// <param name="DocumentId">Source document ID (optional — provide either this or <see cref="RawText"/>).</param>
/// <param name="RawText">Raw OCR text to extract from (optional — used when documentId is absent).</param>
/// <param name="FeatureCode">Feature code to look up provider overrides (e.g. "invoice_extract").</param>
/// <param name="OrganizationId">Caller's organisation — for audit logging and usage metering.</param>
public record ExtractFieldsCommand(
    Guid? DocumentId,
    string? RawText,
    string FeatureCode,
    Guid? OrganizationId) : ICommand<ExtractionResponse>;

/// <summary>Response DTO returned to the API layer.</summary>
public record ExtractionResponse(
    Dictionary<string, string> Fields,
    decimal Confidence,
    string Provider,
    string Model,
    int LatencyMs);

/// <summary>FluentValidation for <see cref="ExtractFieldsCommand"/>.</summary>
public sealed class ExtractFieldsCommandValidator : AbstractValidator<ExtractFieldsCommand>
{
    private const int MaxRawTextLength = 50_000;

    public ExtractFieldsCommandValidator()
    {
        RuleFor(x => x.FeatureCode)
            .NotEmpty().WithMessage("featureCode is required.")
            .MaximumLength(64).WithMessage("featureCode must be ≤ 64 characters.");

        // Must supply documentId OR rawText
        RuleFor(x => x)
            .Must(x => x.DocumentId.HasValue || !string.IsNullOrWhiteSpace(x.RawText))
            .WithMessage("Either documentId or rawText must be provided.")
            .WithName("input");

        When(x => x.RawText is not null, () =>
        {
            RuleFor(x => x.RawText!)
                .MaximumLength(MaxRawTextLength)
                .WithMessage($"rawText must be ≤ {MaxRawTextLength} characters (token cost guardrail).");
        });
    }
}
