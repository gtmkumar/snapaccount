using FluentAssertions;
using GstService.Infrastructure.ExternalClients;
using Microsoft.Extensions.Logging.Abstractions;

namespace GstService.Tests;

/// <summary>
/// Unit tests for <see cref="MockImsGstnClient"/> — verifies deterministic seeding behavior.
/// GAP-101: GSTN IMS mandatory from 1 Apr 2026.
/// </summary>
[Trait("Category", "Unit")]
public sealed class MockImsGstnClientTests
{
    private static MockImsGstnClient CreateClient() =>
        new(NullLogger<MockImsGstnClient>.Instance);

    // ── Determinism ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetImsInvoices_SameGstinAndPeriod_ReturnsSameCount()
    {
        var client = CreateClient();
        const string gstin = "29AABCU9603R1ZX";
        const string period = "032026";

        var result1 = await client.GetImsInvoicesAsync(gstin, period);
        var result2 = await client.GetImsInvoicesAsync(gstin, period);

        result1.Data!.Count.Should().Be(result2.Data!.Count);
    }

    [Fact]
    public async Task GetImsInvoices_SameInputs_ReturnsSameInvoiceNumbers()
    {
        var client = CreateClient();
        const string gstin = "27AAGCS9911D1ZM";
        const string period = "042026";

        var result1 = await client.GetImsInvoicesAsync(gstin, period);
        var result2 = await client.GetImsInvoicesAsync(gstin, period);

        var nums1 = result1.Data!.Select(i => i.InvoiceNumber).ToList();
        var nums2 = result2.Data!.Select(i => i.InvoiceNumber).ToList();

        nums1.Should().BeEquivalentTo(nums2);
    }

    [Fact]
    public async Task GetImsInvoices_DifferentPeriods_ReturnDifferentResults()
    {
        var client = CreateClient();
        const string gstin = "29AABCU9603R1ZX";

        var result1 = await client.GetImsInvoicesAsync(gstin, "032026");
        var result2 = await client.GetImsInvoicesAsync(gstin, "042026");

        // Different periods almost certainly yield different seeds
        // (could theoretically be same by hash collision, but won't for these specific inputs)
        var nums1 = result1.Data!.Select(i => i.InvoiceNumber).ToList();
        var nums2 = result2.Data!.Select(i => i.InvoiceNumber).ToList();
        nums1.Should().NotBeEquivalentTo(nums2);
    }

    // ── Invoice Structure ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetImsInvoices_AllInvoices_HavePositiveTaxableValue()
    {
        var client = CreateClient();
        var result = await client.GetImsInvoicesAsync("29AABCU9603R1ZX", "032026");
        result.IsSuccess.Should().BeTrue();
        result.Data!.Should().AllSatisfy(i => i.TaxableValue.Should().BePositive());
    }

    [Fact]
    public async Task GetImsInvoices_AllInvoices_HaveValidSource()
    {
        var client = CreateClient();
        var result = await client.GetImsInvoicesAsync("29AABCU9603R1ZX", "052026");
        result.IsSuccess.Should().BeTrue();
        var validSources = new[] { "GSTR-1", "IFF" };
        result.Data!.Should().AllSatisfy(i => validSources.Should().Contain(i.Source));
    }

    [Fact]
    public async Task GetImsInvoices_AllInvoices_InvoiceValueEqualsOrGraterThanTaxableValue()
    {
        var client = CreateClient();
        var result = await client.GetImsInvoicesAsync("07AABCC1234C1ZA", "012026");
        result.IsSuccess.Should().BeTrue();
        result.Data!.Should().AllSatisfy(i => i.InvoiceValue.Should().BeGreaterThanOrEqualTo(i.TaxableValue));
    }

    [Fact]
    public async Task GetImsInvoices_ReturnsBetween3And8Invoices()
    {
        var client = CreateClient();
        // Test multiple GSTINs to get statistical confidence
        var gstins = new[] { "29AABCU9603R1ZX", "27AAGCS9911D1ZM", "07AABCC1234C1ZA" };
        foreach (var gstin in gstins)
        {
            var result = await client.GetImsInvoicesAsync(gstin, "032026");
            result.Data!.Count.Should().BeInRange(3, 8);
        }
    }

    // ── SubmitAction ──────────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitAction_ReturnsSuccess()
    {
        var client = CreateClient();
        var result = await client.SubmitActionAsync(
            "29AABCU9603R1ZX", "032026", "MOCK/032026/001",
            "29AABCU9603R1ZX", "ACCEPTED", null);

        result.IsSuccess.Should().BeTrue();
        result.Data.Should().NotBeNullOrEmpty();
        result.Data.Should().Contain("MOCK");
    }

    [Fact]
    public async Task SubmitBulkActions_ReturnsSuccess()
    {
        var client = CreateClient();
        var items = new List<GstService.Application.Interfaces.ImsBulkActionItem>
        {
            new("INV-001", "29AABCU9603R1ZX", "ACCEPTED", null),
            new("INV-002", "29AABCU9603R1ZX", "REJECTED", "Price mismatch")
        };
        var result = await client.SubmitBulkActionsAsync("29AABCU9603R1ZX", "032026", items);

        result.IsSuccess.Should().BeTrue();
        result.Data.Should().Contain("BULK");
    }

    // ── TaxAmount Validity ────────────────────────────────────────────────────

    [Fact]
    public async Task GetImsInvoices_AllInvoices_TaxConsistency()
    {
        // IGST and CGST+SGST should not both be non-zero (it's either IGST or split)
        var client = CreateClient();
        var result = await client.GetImsInvoicesAsync("33AAHCS0618B1ZV", "032026");
        result.IsSuccess.Should().BeTrue();
        foreach (var invoice in result.Data!)
        {
            var hasBothIgstAndCgst = invoice.IgstAmount > 0 && (invoice.CgstAmount > 0 || invoice.SgstAmount > 0);
            hasBothIgstAndCgst.Should().BeFalse("invoice should use either IGST or CGST+SGST, not both");
        }
    }
}
