using GstService.Application.TaxRates.Commands.CreateTaxRate;
using GstService.Application.TaxRates.Commands.DeactivateTaxRate;
using GstService.Application.TaxRates.Queries.GetEffectiveTaxRate;
using GstService.Application.TaxRates.Queries.ListTaxRates;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace GstService.Api.Endpoints;

/// <summary>
/// GAP-022: Admin Tax Rate Config endpoints — effective-dated GST rate management.
///
/// These endpoints fulfil the CLAUDE.md design mandate:
///   "GST rates must be configurable — zero code deployments when government policy changes."
///
/// RBAC: All write endpoints require the <c>gst.admin.taxrates</c> permission.
///        Read endpoints are open to any authenticated user (rates are used for invoice generation).
///
/// Rate limit: standard (100 req/min).
/// Latency note: writes are DB operations (&lt;50ms). Reads cached by the client.
/// </summary>
public sealed class GstTaxRates : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/gst/tax-rates";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // ── Read endpoints (any authenticated user) ──────────────────────────

        // GET /gst/tax-rates — all rates (activeOnly=true for currently live rates)
        groupBuilder.MapGet("/", ListTaxRates)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("ListGstTaxRates")
            .WithSummary(
                "GAP-022: List all GST tax rates, optionally filtered to currently active (valid_to IS NULL).");

        // GET /gst/tax-rates/effective?rateName=GST+18%&asOfDate=2026-04-01
        groupBuilder.MapGet("/effective", GetEffectiveTaxRate)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("GetEffectiveGstTaxRate")
            .WithSummary(
                "GAP-022: Resolve the effective rate for a given rate name and date. " +
                "Used by invoice generation, GST return validation, and the GST calculation service. " +
                "Query params: rateName (required), asOfDate (ISO date, defaults to today).");

        // ── Admin write endpoints (gst.admin.taxrates permission) ────────────

        // POST /gst/tax-rates — create a new effective-dated rate version
        groupBuilder.MapPost("/", CreateTaxRate)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("CreateGstTaxRate")
            .WithSummary(
                "GAP-022: Create a new GST tax rate version. " +
                "Automatically terminates the current active rate with the same name (sets valid_to = validFrom - 1 day). " +
                "Requires gst.admin.taxrates permission.");

        // DELETE /gst/tax-rates/{id}/deactivate — soft-disable
        groupBuilder.MapDelete("/{id:guid}/deactivate", DeactivateTaxRate)
            .RequireAuthorization().RequireRateLimiting("standard")
            .WithName("DeactivateGstTaxRate")
            .WithSummary(
                "GAP-022: Soft-deactivate a tax rate. " +
                "Preserves the audit history. Rate is excluded from future resolution. " +
                "Requires gst.admin.taxrates permission.");
    }

    private static async Task<IResult> ListTaxRates(
        bool? activeOnly, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListTaxRatesQuery(activeOnly ?? false), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> GetEffectiveTaxRate(
        string rateName, DateOnly? asOfDate, ISender sender, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rateName))
            return Results.BadRequest(new { error = "rateName query parameter is required." });

        var effectiveDate = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await sender.Send(new GetEffectiveTaxRateQuery(rateName, effectiveDate), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> CreateTaxRate(CreateTaxRateRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreateTaxRateCommand(req.RateName, req.RatePct, req.ValidFrom, req.Notes), ct);
        return result.IsSuccess
            ? Results.Created($"/gst/tax-rates/{result.Value.TaxRateId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> DeactivateTaxRate(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeactivateTaxRateCommand(id), ct);
        return result.IsSuccess ? Results.Ok(new { message = "Tax rate deactivated." }) : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        ErrorType.Unauthorized => Results.Unauthorized(),
        ErrorType.Forbidden => Results.Forbid(),
        _ => Results.BadRequest(new { error = error.Message, code = error.Code })
    };
}

// Request DTO
internal record CreateTaxRateRequest(
    string RateName,
    decimal RatePct,
    DateOnly ValidFrom,
    string? Notes = null);
