using System.Diagnostics;
using AiService.Application.Common.Interfaces;
using AiService.Domain.Entities;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Application.Extraction.Commands.ExtractFields;

/// <summary>
/// Handles invoice/document field extraction.
/// Pipeline:
///  1. Redact PII from rawText (SEC-AI-01).
///  2. Resolve provider from admin config (with per-feature override).
///  3. Call provider.ExtractFieldsAsync.
///  4. Audit-log the interaction to ai.interactions.
///  5. Return structured fields + confidence.
/// </summary>
public sealed class ExtractFieldsCommandHandler(
    IAiProviderResolver resolver,
    ITextRedactor redactor,
    IAiServiceDbContext db,
    ICurrentUser currentUser,
    ILogger<ExtractFieldsCommandHandler> logger) : ICommandHandler<ExtractFieldsCommand, ExtractionResponse>
{
    /// <inheritdoc />
    public async Task<Result<ExtractionResponse>> Handle(
        ExtractFieldsCommand request,
        CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();

        // 1. Decide what text to extract from.
        //    When documentId is provided we use that as a label in the feature code;
        //    the caller is expected to pass OCR text via rawText (the endpoint resolves this).
        var text = request.RawText ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text) && request.DocumentId.HasValue)
        {
            // If only a documentId was provided (no rawText), we return a graceful error:
            // document text retrieval (cross-service call to DocumentService) is a P7b concern.
            return Result<ExtractionResponse>.Failure(
                new Error("Ai.DocumentTextRequired",
                    "rawText must be provided in this version. Document-id-only extraction requires DocumentService integration (P7b).",
                    ErrorType.Validation));
        }

        // 2. SEC-AI-01: Redact PII before sending to the AI provider.
        var redactedText = redactor.Redact(text);

        // 3. Resolve provider (falls back to mock if not configured).
        var resolved = await resolver.ResolveAsync(request.FeatureCode, null, cancellationToken);

        // 4. Extract fields.
        var extractResult = await resolved.Provider.ExtractFieldsAsync(redactedText, request.FeatureCode, cancellationToken);

        sw.Stop();

        if (extractResult.IsFailure)
        {
            logger.LogWarning("Extraction failed for feature {Feature}: {Error}",
                request.FeatureCode, extractResult.Error.Message);
            return Result<ExtractionResponse>.Failure(extractResult.Error);
        }

        var er = extractResult.Value;

        // 5. Audit log (best-effort — never fail the request if logging fails).
        try
        {
            var interaction = AiInteraction.Record(
                organizationId: request.OrganizationId,
                userId: currentUser.UserId.ToString(),
                featureCode: request.FeatureCode,
                provider: er.Provider,
                model: er.Model,
                inputTokens: er.InputTokens,
                outputTokens: er.OutputTokens,
                latencyMs: (int)sw.ElapsedMilliseconds);

            db.AiInteractions.Add(interaction);
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI interaction audit log failed (non-fatal).");
        }

        return Result<ExtractionResponse>.Success(new ExtractionResponse(
            Fields: er.Fields,
            Confidence: er.Confidence,
            Provider: er.Provider,
            Model: er.Model,
            LatencyMs: (int)sw.ElapsedMilliseconds));
    }
}
