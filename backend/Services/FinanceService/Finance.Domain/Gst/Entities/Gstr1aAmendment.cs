using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// Represents a GSTR-1A amendment — the only mechanism to correct GSTR-3B Table 3 figures
/// after GSTR-3B has been filed (hard-locked since 1 Apr 2026 per GSTN IMS mandate).
///
/// Regulatory note: GSTR-1A allows the recipient to amend supply-side data reported by
/// the supplier when the recipient rejects an IMS invoice and there is a genuine dispute.
/// It is filed between GSTR-1 due date and GSTR-3B due date for the same period.
/// </summary>
public sealed class Gstr1aAmendment : BaseAuditableEntity
{
    /// <summary>Organisation that is filing the amendment.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>
    /// Reference to the original IMS invoice being amended.
    /// Null if the amendment was initiated independently (no matched IMS record).
    /// </summary>
    public Guid? OriginalImsInvoiceId { get; private set; }

    /// <summary>
    /// Original invoice number as reported by the supplier (for traceability
    /// even if the IMS invoice is later deleted).
    /// </summary>
    public string OriginalInvoiceNumber { get; private set; } = string.Empty;

    /// <summary>Original supplier GSTIN.</summary>
    public string OriginalSupplierGstin { get; private set; } = string.Empty;

    /// <summary>
    /// Amendment type.
    /// Values: B2B_AMENDMENT | B2BA | CDNR_AMENDMENT | CDNRA
    /// (matches GSTN GSTR-1A table identifiers)
    /// </summary>
    public string AmendmentType { get; private set; } = string.Empty;

    /// <summary>
    /// JSON payload containing the amended values (typed per AmendmentType).
    /// Stored as raw JSON to accommodate GSTN schema changes without a migration.
    /// Must not contain PAN, Aadhaar, or personal data.
    /// </summary>
    public string AmendmentPayloadJson { get; private set; } = string.Empty;

    /// <summary>
    /// Return period the amendment applies to, in MMYYYY format (e.g. "032026").
    /// </summary>
    public string Period { get; private set; } = string.Empty;

    /// <summary>
    /// Filing status.
    /// Values: DRAFT | SUBMITTED | FILED
    /// </summary>
    public string Status { get; private set; } = "DRAFT";

    /// <summary>ARN assigned by GSTN after the amendment is successfully filed.</summary>
    public string? ArnNumber { get; private set; }

    /// <summary>UTC timestamp when the amendment was filed on GSTN.</summary>
    public DateTime? FiledAt { get; private set; }

    private Gstr1aAmendment() { } // EF Core

    /// <summary>Factory — creates a GSTR-1A amendment in DRAFT status.</summary>
    public static Gstr1aAmendment Create(
        Guid organizationId,
        Guid? originalImsInvoiceId,
        string originalInvoiceNumber,
        string originalSupplierGstin,
        string amendmentType,
        string amendmentPayloadJson,
        string period)
    {
        return new Gstr1aAmendment
        {
            OrganizationId = organizationId,
            OriginalImsInvoiceId = originalImsInvoiceId,
            OriginalInvoiceNumber = originalInvoiceNumber,
            OriginalSupplierGstin = originalSupplierGstin,
            AmendmentType = amendmentType,
            AmendmentPayloadJson = amendmentPayloadJson,
            Period = period,
            Status = "DRAFT"
        };
    }

    /// <summary>Transitions amendment from DRAFT to SUBMITTED (sent to GSTN portal).</summary>
    public Result Submit()
    {
        if (Status != "DRAFT")
            return Result.Failure(Error.Conflict(
                "Gstr1aAmendment.InvalidState",
                $"Cannot submit from status '{Status}'. Expected 'DRAFT'."));

        Status = "SUBMITTED";
        return Result.Success();
    }

    /// <summary>Records the ARN and marks amendment as FILED after GSTN confirms.</summary>
    public Result MarkFiled(string arnNumber)
    {
        if (Status != "SUBMITTED")
            return Result.Failure(Error.Conflict(
                "Gstr1aAmendment.InvalidState",
                $"Cannot mark as filed from status '{Status}'. Expected 'SUBMITTED'."));

        Status = "FILED";
        ArnNumber = arnNumber;
        FiledAt = DateTime.UtcNow;
        return Result.Success();
    }
}
