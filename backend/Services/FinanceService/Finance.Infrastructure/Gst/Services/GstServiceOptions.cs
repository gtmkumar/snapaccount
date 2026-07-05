using GstService.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace GstService.Infrastructure.Services;

/// <summary>
/// Infrastructure implementation of <see cref="IGstServiceOptions"/>.
/// Reads from <c>IConfiguration</c> so Application-layer handlers remain config-agnostic.
/// GAP-108: GSTAT backlog deadline config.
/// DG-GST-05: e-invoice threshold config.
/// </summary>
public sealed class GstServiceOptions(IConfiguration configuration) : IGstServiceOptions
{
    private static readonly DateOnly DefaultGstatBacklogDeadline = new(2026, 6, 30);

    // DG-GST-05: default threshold is 5 Crore (per Oct 2023 government notification).
    // Change by setting GstService:EInvoiceThresholdCrore in appsettings / GCP Secret Manager.
    private const decimal DefaultEInvoiceThresholdCrore = 5.0m;

    /// <inheritdoc />
    public DateOnly GstatBacklogAppealDeadline
    {
        get
        {
            var raw = configuration["GstService:GstatBacklogAppealDeadline"];
            return DateOnly.TryParse(raw, out var parsed) ? parsed : DefaultGstatBacklogDeadline;
        }
    }

    /// <inheritdoc />
    public decimal EInvoiceThresholdCrore
    {
        get
        {
            var raw = configuration["GstService:EInvoiceThresholdCrore"];
            return decimal.TryParse(raw, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : DefaultEInvoiceThresholdCrore;
        }
    }
}
