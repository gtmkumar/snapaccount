using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Commands.RecordAiUsage;

/// <summary>
/// Records one metered AI/LLM call. Called by any backend service after a provider call. Cost is
/// computed from the price catalog (free/local providers like Tesseract resolve to $0). No
/// permission gate — this is service-to-service telemetry (network-internal).
/// </summary>
public record RecordAiUsageCommand(
    string Provider,
    string Model,
    string Feature,
    int InputTokens = 0,
    int OutputTokens = 0,
    int Units = 0,
    int LatencyMs = 0,
    Guid? OrganizationId = null) : ICommand<RecordAiUsageResponse>;

public record RecordAiUsageResponse(Guid Id, decimal CostUsd);

public sealed class RecordAiUsageCommandHandler(IAuthDbContext db)
    : ICommandHandler<RecordAiUsageCommand, RecordAiUsageResponse>
{
    public async Task<Result<RecordAiUsageResponse>> Handle(RecordAiUsageCommand request, CancellationToken ct)
    {
        var provider = request.Provider.Trim().ToLowerInvariant();
        var model = request.Model.Trim();

        // Look up the price; missing/unpriced model → $0 (still logged for call/latency metrics).
        var price = await db.AiModelPrices.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Provider == provider && p.Model == model && p.DeletedAt == null, ct);
        var cost = price?.CostFor(request.InputTokens, request.OutputTokens, request.Units) ?? 0m;

        var log = AiUsageLog.Create(
            request.OrganizationId, provider, model, request.Feature,
            request.InputTokens, request.OutputTokens, request.Units, request.LatencyMs, cost);
        db.AiUsageLogs.Add(log);
        await db.SaveChangesAsync(ct);

        return new RecordAiUsageResponse(log.Id, cost);
    }
}
