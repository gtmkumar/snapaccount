using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class ItcRecord : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? GstReturnId { get; private set; }
    public Guid? InvoiceId { get; private set; }
    public string SupplierGstin { get; private set; } = string.Empty;
    public string? SupplierName { get; private set; }
    public string InvoiceNumber { get; private set; } = string.Empty;
    public DateOnly InvoiceDate { get; private set; }
    public decimal IgstCredit { get; private set; }
    public decimal CgstCredit { get; private set; }
    public decimal SgstCredit { get; private set; }
    public decimal CessCredit { get; private set; }
    public decimal TotalItc => IgstCredit + CgstCredit + SgstCredit + CessCredit;
    public bool IsEligible { get; private set; } = true;
    public string? IneligibilityReason { get; private set; }
    public string Source { get; private set; } = "GSTR_2B"; // GSTR_2A, GSTR_2B, MANUAL

    private ItcRecord() { }

    public static ItcRecord Create(Guid orgId, string supplierGstin, string invoiceNumber,
        DateOnly invoiceDate, decimal igst, decimal cgst, decimal sgst, decimal cess, string source = "GSTR_2B")
        => new()
        {
            OrganizationId = orgId,
            SupplierGstin = supplierGstin,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = invoiceDate,
            IgstCredit = igst,
            CgstCredit = cgst,
            SgstCredit = sgst,
            CessCredit = cess,
            Source = source
        };
}
