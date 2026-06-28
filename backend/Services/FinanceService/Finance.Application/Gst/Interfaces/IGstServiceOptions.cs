namespace GstService.Application.Interfaces;

/// <summary>
/// GST service configuration options abstraction.
/// Allows Application-layer handlers to read config values (e.g. GSTAT backlog deadline,
/// e-invoice threshold) without taking a direct dependency on <c>IConfiguration</c>
/// (Clean Architecture boundary). The Infrastructure layer implements this by reading
/// from <c>IConfiguration</c>.
/// GAP-108: introduced for GSTAT backlog appeal deadline config.
/// DG-GST-05: e-invoice threshold added.
/// </summary>
public interface IGstServiceOptions
{
    /// <summary>
    /// Config-driven GSTAT backlog appeal deadline.
    /// Default: 2026-06-30 per current GSTAT notification.
    /// Override via <c>GstService:GstatBacklogAppealDeadline</c> in appsettings / Secret Manager.
    /// </summary>
    DateOnly GstatBacklogAppealDeadline { get; }

    /// <summary>
    /// Annual turnover threshold in Crore above which e-invoicing is mandatory.
    /// DG-GST-05: currently Rs 5 Crore (as of October 2023 notification).
    /// Override via <c>GstService:EInvoiceThresholdCrore</c> in appsettings / Secret Manager.
    /// Default: 5.0 — NEVER hardcode; this changes with government notification.
    /// </summary>
    decimal EInvoiceThresholdCrore { get; }
}
