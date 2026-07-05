using GstService.Domain.Entities;

namespace GstService.Application.Interfaces;

/// <summary>
/// Repository contract for the <see cref="GstReturn"/> aggregate root.
/// Defined in the Application layer per Clean Architecture dependency rule.
/// Implementation lives in GstService.Infrastructure/Persistence/Repositories/.
/// </summary>
public interface IGstReturnRepository
{
    /// <summary>Returns a GST return by its identifier, or null when not found.</summary>
    Task<GstReturn?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Returns true when a return already exists for the given organisation,
    /// return type, financial year, and optional period month.
    /// </summary>
    Task<bool> ExistsAsync(Guid orgId, string returnType, string fy, int? periodMonth, CancellationToken ct);

    /// <summary>Persists a new GST return and returns the saved entity.</summary>
    Task<GstReturn> AddAsync(GstReturn gstReturn, CancellationToken ct);

    /// <summary>Persists changes to an existing GST return.</summary>
    Task UpdateAsync(GstReturn gstReturn, CancellationToken ct);
}
