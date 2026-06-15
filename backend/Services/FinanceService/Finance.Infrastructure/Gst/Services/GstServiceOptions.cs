using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GstService.Infrastructure.Services;

/// <summary>
/// Infrastructure implementation of <see cref="IGstServiceOptions"/>.
/// Reads from <c>IConfiguration</c> so Application-layer handlers remain config-agnostic.
/// GAP-108: GSTAT backlog deadline config.
/// </summary>
public sealed class GstServiceOptions(IConfiguration configuration) : IGstServiceOptions
{
    private static readonly DateOnly DefaultGstatBacklogDeadline = new(2026, 6, 30);

    /// <inheritdoc />
    public DateOnly GstatBacklogAppealDeadline
    {
        get
        {
            var raw = configuration["GstService:GstatBacklogAppealDeadline"];
            return DateOnly.TryParse(raw, out var parsed) ? parsed : DefaultGstatBacklogDeadline;
        }
    }
}
