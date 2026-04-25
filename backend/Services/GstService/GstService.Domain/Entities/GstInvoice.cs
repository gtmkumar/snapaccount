using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class GstInvoice : BaseAuditableEntity
{
    public Guid OrganizationId { get; private set; }
    public Guid? GstReturnId { get; private set; }
    public string InvoiceType { get; private set; } = string.Empty; // B2B, B2C, CREDIT_NOTE, DEBIT_NOTE, EXPORT
    public string InvoiceNumber { get; private set; } = string.Empty;
    public DateOnly InvoiceDate { get; private set; }

    // Supplier
    public string SupplierGstin { get; private set; } = string.Empty;
    public string SupplierName { get; private set; } = string.Empty;

    // Buyer
    public string? BuyerGstin { get; private set; }
    public string? BuyerName { get; private set; }
    public string? BuyerStateCode { get; private set; }

    // Amounts — always decimal, never float/double
    public decimal TaxableValue { get; private set; }
    public decimal IgstAmount { get; private set; }
    public decimal CgstAmount { get; private set; }
    public decimal SgstAmount { get; private set; }
    public decimal CessAmount { get; private set; }
    public decimal TotalInvoiceValue { get; private set; }

    // E-invoicing
    public string? IrnNumber { get; private set; }
    public string? IrnStatus { get; private set; } // PENDING, GENERATED, CANCELLED
    public DateTime? IrnGeneratedAt { get; private set; }
    public string? QrCodeData { get; private set; }

    public Guid? DocumentId { get; private set; }

    private GstInvoice() { }

    public static GstInvoice Create(
        Guid organizationId, string invoiceType, string invoiceNumber, DateOnly invoiceDate,
        string supplierGstin, string supplierName, decimal taxableValue,
        decimal igst, decimal cgst, decimal sgst, decimal cess)
    {
        return new GstInvoice
        {
            OrganizationId = organizationId,
            InvoiceType = invoiceType,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = invoiceDate,
            SupplierGstin = supplierGstin,
            SupplierName = supplierName,
            TaxableValue = taxableValue,
            IgstAmount = igst,
            CgstAmount = cgst,
            SgstAmount = sgst,
            CessAmount = cess,
            TotalInvoiceValue = taxableValue + igst + cgst + sgst + cess
        };
    }

    public void AssignToReturn(Guid gstReturnId) => GstReturnId = gstReturnId;

    /// <summary>Sets buyer details (name and optional GSTIN).</summary>
    public void SetBuyer(string? buyerName, string? buyerGstin)
    {
        BuyerName = buyerName;
        BuyerGstin = buyerGstin;
    }

    public void SetEInvoiceIrn(string irnNumber, string? qrCodeData)
    {
        IrnNumber = irnNumber;
        IrnStatus = "GENERATED";
        IrnGeneratedAt = DateTime.UtcNow;
        QrCodeData = qrCodeData;
    }
}
