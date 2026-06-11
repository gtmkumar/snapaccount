// Unit tests for GAP-022: GstTaxRate CRUD
//   — CreateTaxRateCommand (creates rate, terminates prior active rate)
//   — DeactivateTaxRateCommand (soft-disable, idempotent)
//   — ListTaxRatesQuery (all / activeOnly)
//   — GetEffectiveTaxRateQuery (date-range lookup / NotFound)
//   — GstTaxRate domain entity (Terminate, Deactivate, CGST/SGST calculation)
//
// Covers:
//   1.  CreateTaxRate happy path — new rate row created, CGST/SGST halved
//   2.  CreateTaxRate terminates prior active same-name rate
//   3.  CreateTaxRate does NOT terminate rates with different names
//   4.  CreateTaxRate validator — name required
//   5.  CreateTaxRate validator — rate_pct out of range rejected
//   6.  DeactivateTaxRate happy path — IsActive set to false
//   7.  DeactivateTaxRate idempotent — already inactive returns success without save
//   8.  DeactivateTaxRate not found — returns NotFound
//   9.  ListTaxRates — returns all rates
//  10.  ListTaxRates activeOnly — excludes terminated/inactive
//  11.  GetEffectiveTaxRate — returns rate effective on query date
//  12.  GetEffectiveTaxRate — returns NotFound when no rate configured
//  13.  GetEffectiveTaxRate — returns NotFound when rate terminated before query date
//  14.  GstTaxRate.Create — CGST = SGST = RatePct/2, IGST = RatePct
//  15.  GstTaxRate.Terminate — sets ValidTo

using GstService.Application.TaxRates.Commands.CreateTaxRate;
using GstService.Application.TaxRates.Commands.DeactivateTaxRate;
using GstService.Application.TaxRates.Queries.GetEffectiveTaxRate;
using GstService.Application.TaxRates.Queries.ListTaxRates;
using GstService.Domain.Entities;
using GstService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;

namespace GstService.Tests;

[Trait("Category", "Unit")]
public sealed class TaxRateCommandTests : IDisposable
{
    private readonly GstDbContext _db;

    public TaxRateCommandTests()
    {
        var opts = new DbContextOptionsBuilder<GstDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new GstDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    // ── CreateTaxRateCommand ─────────────────────────────────────────────────

    [Fact]
    public async Task CreateRate_HappyPath_RowCreated_CgstHalved()
    {
        var handler = new CreateTaxRateCommandHandler(_db);
        var result = await handler.Handle(
            new CreateTaxRateCommand("GST 18%", 18m, DateOnly.FromDateTime(DateTime.Today), null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.RatePct.Should().Be(18m);
        result.Value.CgstPct.Should().Be(9m);
        result.Value.SgstPct.Should().Be(9m);
        result.Value.IgstPct.Should().Be(18m);

        var saved = await _db.GstTaxRates.FirstOrDefaultAsync(r => r.Id == result.Value.TaxRateId);
        saved.Should().NotBeNull();
    }

    [Fact]
    public async Task CreateRate_TerminatesPriorActiveRateWithSameName()
    {
        // Seed an existing active rate
        var existing = GstTaxRate.Create("GST 12%", 12m, new DateOnly(2024, 4, 1));
        _db.GstTaxRates.Add(existing);
        await _db.SaveChangesAsync();

        var handler = new CreateTaxRateCommandHandler(_db);
        var newStart = new DateOnly(2025, 4, 1);

        var result = await handler.Handle(
            new CreateTaxRateCommand("GST 12%", 12m, newStart, "FY 2025 budget"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        // Prior rate should now have ValidTo = newStart - 1 day
        await _db.Entry(existing).ReloadAsync();
        existing.ValidTo.Should().Be(newStart.AddDays(-1),
            "existing active rate must be auto-terminated");
    }

    [Fact]
    public async Task CreateRate_DoesNotTerminateDifferentNameRates()
    {
        var other = GstTaxRate.Create("GST 5%", 5m, new DateOnly(2024, 4, 1));
        _db.GstTaxRates.Add(other);
        await _db.SaveChangesAsync();

        var handler = new CreateTaxRateCommandHandler(_db);
        await handler.Handle(
            new CreateTaxRateCommand("GST 18%", 18m, new DateOnly(2025, 4, 1), null),
            CancellationToken.None);

        await _db.Entry(other).ReloadAsync();
        other.ValidTo.Should().BeNull("a rate with a different name must not be terminated");
    }

    [Fact]
    public void Validator_EmptyName_IsInvalid()
    {
        var v = new CreateTaxRateCommandValidator();
        v.Validate(new CreateTaxRateCommand("", 18m, DateOnly.FromDateTime(DateTime.Today), null))
         .IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void Validator_OutOfRangePct_IsInvalid(decimal pct)
    {
        var v = new CreateTaxRateCommandValidator();
        v.Validate(new CreateTaxRateCommand("GST", pct, DateOnly.FromDateTime(DateTime.Today), null))
         .IsValid.Should().BeFalse();
    }

    // BUG-W6-001: ValidGstRates set must be enforced by the validator (not just declared).
    // The prior comment "warn but do not block" was incorrect — spec requires HTTP 400.

    [Theory]
    [InlineData(7)]
    [InlineData(10)]
    [InlineData(15)]
    [InlineData(99)]
    public void Validator_NonStandardGstRate_IsInvalid(decimal pct)
    {
        // Non-standard rates (not in [0, 1.5, 3, 5, 7.5, 12, 18, 28]) must be rejected.
        var v = new CreateTaxRateCommandValidator();
        var result = v.Validate(new CreateTaxRateCommand("GST Non-Standard", pct, DateOnly.FromDateTime(DateTime.Today), null));
        result.IsValid.Should().BeFalse($"rate {pct}% is not a standard Indian GST slab and must be rejected");
        result.Errors.Should().Contain(e => e.PropertyName == "RatePct",
            "the validation error must be on the RatePct field");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1.5)]
    [InlineData(3)]
    [InlineData(5)]
    [InlineData(7.5)]
    [InlineData(12)]
    [InlineData(18)]
    [InlineData(28)]
    public void Validator_AllEightStandardGstRates_AreValid(decimal pct)
    {
        // All 8 government-mandated GST slabs must pass validation.
        var v = new CreateTaxRateCommandValidator();
        var result = v.Validate(new CreateTaxRateCommand("GST Valid", pct, DateOnly.FromDateTime(DateTime.Today), null));
        result.IsValid.Should().BeTrue($"rate {pct}% is a valid standard Indian GST slab");
    }

    // ── DeactivateTaxRateCommand ─────────────────────────────────────────────

    [Fact]
    public async Task DeactivateRate_HappyPath_IsActiveFalse_SaveCalled()
    {
        var rate = GstTaxRate.Create("GST 28%", 28m, new DateOnly(2024, 4, 1));
        _db.GstTaxRates.Add(rate);
        await _db.SaveChangesAsync();

        var handler = new DeactivateTaxRateCommandHandler(_db);
        var result  = await handler.Handle(
            new DeactivateTaxRateCommand(rate.Id),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        await _db.Entry(rate).ReloadAsync();
        rate.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task DeactivateRate_AlreadyInactive_IsIdempotent()
    {
        var rate = GstTaxRate.Create("GST 28%", 28m, new DateOnly(2024, 4, 1));
        rate.Deactivate();
        _db.GstTaxRates.Add(rate);
        await _db.SaveChangesAsync();

        var handler = new DeactivateTaxRateCommandHandler(_db);
        var result  = await handler.Handle(
            new DeactivateTaxRateCommand(rate.Id),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("idempotent: deactivating an already-inactive rate should succeed");
    }

    [Fact]
    public async Task DeactivateRate_NotFound_ReturnsNotFound()
    {
        var handler = new DeactivateTaxRateCommandHandler(_db);
        var result  = await handler.Handle(
            new DeactivateTaxRateCommand(Guid.NewGuid()),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    // ── ListTaxRatesQuery ────────────────────────────────────────────────────

    [Fact]
    public async Task ListRates_ReturnsAllNonDeleted()
    {
        _db.GstTaxRates.AddRange(
            GstTaxRate.Create("GST 5%",  5m,  new DateOnly(2024, 4, 1)),
            GstTaxRate.Create("GST 18%", 18m, new DateOnly(2024, 4, 1)));
        await _db.SaveChangesAsync();

        var handler = new ListTaxRatesQueryHandler(_db);
        var result  = await handler.Handle(new ListTaxRatesQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);
    }

    [Fact]
    public async Task ListRates_ActiveOnly_ExcludesTerminatedAndInactive()
    {
        var active = GstTaxRate.Create("GST 5%",  5m,  new DateOnly(2024, 4, 1));
        var terminated = GstTaxRate.Create("GST 12%", 12m, new DateOnly(2024, 4, 1));
        terminated.Terminate(new DateOnly(2025, 3, 31));
        var inactive = GstTaxRate.Create("GST 28%", 28m, new DateOnly(2024, 4, 1));
        inactive.Deactivate();

        _db.GstTaxRates.AddRange(active, terminated, inactive);
        await _db.SaveChangesAsync();

        var handler = new ListTaxRatesQueryHandler(_db);
        var result  = await handler.Handle(new ListTaxRatesQuery(ActiveOnly: true), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(1);
        result.Value[0].RateName.Should().Be("GST 5%");
    }

    // ── GetEffectiveTaxRateQuery ─────────────────────────────────────────────

    [Fact]
    public async Task GetEffectiveRate_ReturnsRateOnQueryDate()
    {
        var rate = GstTaxRate.Create("GST 18%", 18m, new DateOnly(2024, 4, 1));
        _db.GstTaxRates.Add(rate);
        await _db.SaveChangesAsync();

        var handler = new GetEffectiveTaxRateQueryHandler(_db);
        var result  = await handler.Handle(
            new GetEffectiveTaxRateQuery("GST 18%", new DateOnly(2025, 1, 1)),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.RatePct.Should().Be(18m);
    }

    [Fact]
    public async Task GetEffectiveRate_NoRateConfigured_ReturnsNotFound()
    {
        var handler = new GetEffectiveTaxRateQueryHandler(_db);
        var result  = await handler.Handle(
            new GetEffectiveTaxRateQuery("GST 3%", new DateOnly(2025, 1, 1)),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task GetEffectiveRate_TerminatedBeforeQueryDate_ReturnsNotFound()
    {
        var rate = GstTaxRate.Create("GST 12%", 12m, new DateOnly(2024, 4, 1));
        rate.Terminate(new DateOnly(2024, 12, 31)); // terminated before query date
        _db.GstTaxRates.Add(rate);
        await _db.SaveChangesAsync();

        var handler = new GetEffectiveTaxRateQueryHandler(_db);
        var result  = await handler.Handle(
            new GetEffectiveTaxRateQuery("GST 12%", new DateOnly(2025, 6, 1)),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GstTaxRate domain entity tests (pure domain, no DB)
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class GstTaxRateDomainTests
{
    [Theory]
    [InlineData(18,   9,   9,   18)]
    [InlineData(5,    2.5, 2.5, 5)]
    [InlineData(28,   14,  14,  28)]
    [InlineData(12,   6,   6,   12)]
    [InlineData(0,    0,   0,   0)]
    public void Create_CalculatesCgstSgstIgst(
        decimal pct, decimal cgst, decimal sgst, decimal igst)
    {
        var rate = GstTaxRate.Create("GST", pct, DateOnly.FromDateTime(DateTime.Today));
        rate.CgstPct.Should().Be(cgst);
        rate.SgstPct.Should().Be(sgst);
        rate.IgstPct.Should().Be(igst);
    }

    [Fact]
    public void Terminate_SetsValidTo()
    {
        var rate   = GstTaxRate.Create("GST 18%", 18m, new DateOnly(2024, 4, 1));
        var termAt = new DateOnly(2025, 3, 31);
        rate.Terminate(termAt);
        rate.ValidTo.Should().Be(termAt);
        rate.IsCurrentlyActive.Should().BeFalse("terminated rate must not be currently active");
    }

    [Fact]
    public void Deactivate_SetsIsActiveFalse()
    {
        var rate = GstTaxRate.Create("GST 28%", 28m, new DateOnly(2024, 4, 1));
        rate.IsActive.Should().BeTrue("newly created rate must be active");
        rate.Deactivate();
        rate.IsActive.Should().BeFalse();
    }
}
