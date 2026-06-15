using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class GstReturnLineItem : BaseAuditableEntity
{
    public Guid GstReturnId { get; private set; }
    public string LineType { get; private set; } = string.Empty; // B2B, B2C, CDNR, EXEMPTED, etc.
    public string? Description { get; private set; }
    public string? HsnSacCode { get; private set; }
    public decimal TaxableValue { get; private set; }
    public decimal IgstAmount { get; private set; }
    public decimal CgstAmount { get; private set; }
    public decimal SgstAmount { get; private set; }
    public decimal CessAmount { get; private set; }
    public decimal? GstRatePct { get; private set; }
    public int InvoiceCount { get; private set; }

    private GstReturnLineItem() { }

    internal static GstReturnLineItem Create(
        Guid gstReturnId, string lineType, string? hsnSacCode,
        decimal taxableValue, decimal igst, decimal cgst, decimal sgst, decimal cess, decimal? gstRatePct)
        => new()
        {
            GstReturnId = gstReturnId,
            LineType = lineType,
            HsnSacCode = hsnSacCode,
            TaxableValue = taxableValue,
            IgstAmount = igst,
            CgstAmount = cgst,
            SgstAmount = sgst,
            CessAmount = cess,
            GstRatePct = gstRatePct
        };
}
