using FluentValidation;
using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ItrService.Application.Filings.Queries.GetComputationVersions;

/// <summary>
/// Returns the full computation-version history for a filing, ordered newest-first.
/// DG-ITR-07: each ComputeTax call appends a row to itr.computation_versions;
/// this query surfaces them to the admin CA panel (Col 3: Computation history).
/// </summary>
[RequiresPermission("itr.filings.read")]
public record GetComputationVersionsQuery(Guid FilingId) : IQuery<IReadOnlyList<ComputationVersionDto>>;

/// <summary>
/// A single computation-version entry returned to the admin client.
/// Field names and nesting match the admin <c>ComputationVersionSchema</c> (itrApi.ts).
/// </summary>
public sealed class ComputationVersionDto
{
    /// <summary>Row UUID.</summary>
    [JsonPropertyName("id")]
    public Guid Id { get; init; }

    /// <summary>Filing the version belongs to.</summary>
    [JsonPropertyName("filingId")]
    public Guid FilingId { get; init; }

    /// <summary>1-based monotonic version counter per filing.</summary>
    [JsonPropertyName("version")]
    public int Version { get; init; }

    /// <summary>Optional human-readable label.</summary>
    [JsonPropertyName("label")]
    public string? Label { get; init; }

    /// <summary>Display name of the user who triggered the computation.</summary>
    [JsonPropertyName("actorName")]
    public string ActorName { get; init; } = string.Empty;

    /// <summary>UTC timestamp (ISO-8601) when this version was created.</summary>
    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; init; } = string.Empty;

    /// <summary>
    /// Input snapshot — shape matches <c>ComputationInputSchema</c> in itrApi.ts.
    /// Returned as raw JSON element so it is inlined in the response without double-serialisation.
    /// </summary>
    [JsonPropertyName("input")]
    public JsonElement Input { get; init; }

    /// <summary>
    /// Result snapshot — shape matches <c>ComputationResultSchema</c> in itrApi.ts.
    /// Returned as raw JSON element so it is inlined in the response without double-serialisation.
    /// </summary>
    [JsonPropertyName("result")]
    public JsonElement Result { get; init; }
}

public sealed class GetComputationVersionsQueryValidator : AbstractValidator<GetComputationVersionsQuery>
{
    public GetComputationVersionsQueryValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
    }
}

public sealed class GetComputationVersionsQueryHandler(
    IItrDbContext dbContext,
    ICurrentUser currentUser)
    : IQueryHandler<GetComputationVersionsQuery, IReadOnlyList<ComputationVersionDto>>
{
    private static readonly JsonSerializerOptions _opts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    /// <inheritdoc />
    public async Task<Result<IReadOnlyList<ComputationVersionDto>>> Handle(
        GetComputationVersionsQuery request, CancellationToken cancellationToken)
    {
        // IDOR guard: verify filing belongs to caller's org
        var filing = await dbContext.Filings
            .Where(f => f.Id == request.FilingId && f.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var assessee = await dbContext.Assessees
            .Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var rows = await dbContext.ComputationVersions
            .Where(v => v.FilingId == request.FilingId)
            .OrderByDescending(v => v.Version)
            .ToListAsync(cancellationToken);

        var dtos = rows.Select(row =>
        {
            JsonElement inputElement;
            JsonElement resultElement;

            try
            {
                inputElement = JsonDocument.Parse(row.InputJson).RootElement.Clone();
            }
            catch
            {
                inputElement = JsonDocument.Parse("{}").RootElement.Clone();
            }

            try
            {
                resultElement = JsonDocument.Parse(row.ResultJson).RootElement.Clone();
            }
            catch
            {
                resultElement = JsonDocument.Parse("{}").RootElement.Clone();
            }

            return new ComputationVersionDto
            {
                Id = row.Id,
                FilingId = row.FilingId,
                Version = row.Version,
                Label = row.Label,
                ActorName = row.ActorName,
                CreatedAt = row.CreatedAt.ToString("O"),
                Input = inputElement,
                Result = resultElement
            };
        }).ToList();

        return Result<IReadOnlyList<ComputationVersionDto>>.Success(dtos);
    }
}
