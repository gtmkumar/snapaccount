using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Immutable snapshot of one tax-computation run for a filing.
/// Every call to ComputeTax appends a row here; the filing itself pins only the latest snapshot.
/// DG-ITR-07: computation_versions table (itr.computation_versions).
/// Keyed by (filing_id, version); version is 1-based and auto-incremented per filing.
/// </summary>
public sealed class ComputationVersionEntry : BaseEntity
{
    /// <summary>Filing this computation version belongs to.</summary>
    public Guid FilingId { get; private set; }

    /// <summary>1-based monotonic version counter per filing.</summary>
    public int Version { get; private set; }

    /// <summary>Optional human-readable label (e.g. "Draft 1", "After 80C revision").</summary>
    public string? Label { get; private set; }

    /// <summary>User who triggered the computation (Firebase UID or display name).</summary>
    public string ActorName { get; private set; } = string.Empty;

    /// <summary>UTC timestamp when this computation was run.</summary>
    public DateTime CreatedAt { get; private set; }

    /// <summary>
    /// JSON snapshot of the inputs that produced this computation.
    /// Shape matches <c>ComputationInputSchema</c> expected by the admin client.
    /// </summary>
    public string InputJson { get; private set; } = string.Empty;

    /// <summary>
    /// JSON snapshot of the computation result.
    /// Shape matches <c>ComputationResultSchema</c> expected by the admin client.
    /// </summary>
    public string ResultJson { get; private set; } = string.Empty;

    private ComputationVersionEntry() { }

    /// <summary>
    /// Factory: creates a new immutable computation-version snapshot.
    /// DG-ITR-07: called by ComputeTaxCommandHandler after each successful compute.
    /// </summary>
    public static ComputationVersionEntry Create(
        Guid filingId,
        int version,
        string actorName,
        string inputJson,
        string resultJson,
        string? label = null)
    {
        return new ComputationVersionEntry
        {
            FilingId = filingId,
            Version = version,
            ActorName = actorName,
            InputJson = inputJson,
            ResultJson = resultJson,
            Label = label,
            CreatedAt = DateTime.UtcNow
        };
    }
}
