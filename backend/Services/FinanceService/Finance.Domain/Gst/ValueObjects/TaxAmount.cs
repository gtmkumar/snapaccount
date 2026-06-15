using SnapAccount.Shared.Domain;

namespace GstService.Domain.ValueObjects;

/// <summary>
/// GST tax breakdown: CGST + SGST for intra-state, IGST for inter-state.
/// All amounts are decimal — never float/double.
/// </summary>
public sealed class TaxAmount : ValueObject
{
    public decimal Cgst { get; }
    public decimal Sgst { get; }
    public decimal Igst { get; }
    public decimal Cess { get; }
    public decimal Total => Cgst + Sgst + Igst + Cess;

    private TaxAmount(decimal cgst, decimal sgst, decimal igst, decimal cess)
    {
        Cgst = Math.Round(cgst, 2);
        Sgst = Math.Round(sgst, 2);
        Igst = Math.Round(igst, 2);
        Cess = Math.Round(cess, 2);
    }

    /// <summary>For intra-state supply (CGST + SGST)</summary>
    public static TaxAmount IntraState(decimal taxableValue, decimal ratePct, decimal cessPct = 0)
    {
        var halfTax = Math.Round(taxableValue * ratePct / 100 / 2, 2);
        var cess = Math.Round(taxableValue * cessPct / 100, 2);
        return new TaxAmount(halfTax, halfTax, 0, cess);
    }

    /// <summary>For inter-state supply (IGST)</summary>
    public static TaxAmount InterState(decimal taxableValue, decimal ratePct, decimal cessPct = 0)
    {
        var igst = Math.Round(taxableValue * ratePct / 100, 2);
        var cess = Math.Round(taxableValue * cessPct / 100, 2);
        return new TaxAmount(0, 0, igst, cess);
    }

    public static TaxAmount From(decimal cgst, decimal sgst, decimal igst, decimal cess)
        => new(cgst, sgst, igst, cess);

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Cgst;
        yield return Sgst;
        yield return Igst;
        yield return Cess;
    }

    public override string ToString() =>
        $"CGST: {Cgst:F2}, SGST: {Sgst:F2}, IGST: {Igst:F2}, Cess: {Cess:F2}, Total: {Total:F2}";
}
