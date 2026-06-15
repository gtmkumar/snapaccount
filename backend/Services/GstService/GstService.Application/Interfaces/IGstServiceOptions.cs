namespace GstService.Application.Interfaces;

/// <summary>
/// GST service configuration options abstraction.
/// Allows Application-layer handlers to read config values (e.g. GSTAT backlog deadline)
/// without taking a direct dependency on <c>IConfiguration</c> (Clean Architecture boundary).
/// The Infrastructure layer implements this by reading from <c>IConfiguration</c>.
/// GAP-108: introduced for GSTAT backlog appeal deadline config.
/// </summary>
public interface IGstServiceOptions
{
    /// <summary>
    /// Config-driven GSTAT backlog appeal deadline.
    /// Default: 2026-06-30 per current GSTAT notification.
    /// Override via <c>GstService:GstatBacklogAppealDeadline</c> in appsettings / Secret Manager.
    /// </summary>
    DateOnly GstatBacklogAppealDeadline { get; }
}
