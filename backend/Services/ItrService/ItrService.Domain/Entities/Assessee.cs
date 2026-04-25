using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Assessee profile — the individual or entity filing income tax returns.
/// P6-HANDOFF-19: <c>PanCipher</c> stores AES-256-CBC ciphertext via IPanEncryptionService.
/// NEVER store plaintext PAN. Use <c>PanLast4</c> for masked UI display.
/// </summary>
public class Assessee : BaseAuditableEntity
{
    /// <summary>Firebase UID of the assessee user.</summary>
    public string UserId { get; private set; } = string.Empty;

    /// <summary>Organisation ID (for business assessees).</summary>
    public Guid? OrganizationId { get; private set; }

    /// <summary>
    /// P6-HANDOFF-19: AES-256-CBC ciphertext of the 10-character PAN.
    /// Decrypted only in secure contexts (CA review, ITR filing).
    /// </summary>
    public string PanCipher { get; private set; } = string.Empty;

    /// <summary>Last 4 characters of PAN for masked UI display (e.g., "K123").</summary>
    public string PanLast4 { get; private set; } = string.Empty;

    /// <summary>Assessee full name (as per PAN).</summary>
    public string FullName { get; private set; } = string.Empty;

    /// <summary>Date of birth (for individual assessees).</summary>
    public DateOnly? DateOfBirth { get; private set; }

    /// <summary>Registered email address.</summary>
    public string? Email { get; private set; }

    /// <summary>Indian mobile number.</summary>
    public string? PhoneNumber { get; private set; }

    /// <summary>Aadhaar last 4 digits (masked).</summary>
    public string? AadhaarLast4 { get; private set; }

    /// <summary>Residential address.</summary>
    public string? Address { get; private set; }

    /// <summary>Assessee type: INDIVIDUAL, HUF, FIRM, COMPANY, AOP, BOI, AJP.</summary>
    public string AssesseeType { get; private set; } = "INDIVIDUAL";

    /// <summary>Annual turnover in crore (for business assessees).</summary>
    public decimal? AnnualTurnoverCr { get; private set; }

    /// <summary>
    /// DPDP Act 2023: timestamp when the assessee's data was anonymized.
    /// Non-null means right-to-erasure was exercised.
    /// </summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>Reason for anonymization.</summary>
    public string? AnonymizationReason { get; private set; }

    private Assessee() { }

    /// <summary>Creates a new assessee profile.</summary>
    public static Assessee Create(
        string userId,
        string panCipher,
        string panLast4,
        string fullName,
        string assesseeType = "INDIVIDUAL",
        Guid? organizationId = null)
    {
        return new Assessee
        {
            UserId = userId,
            PanCipher = panCipher,
            PanLast4 = panLast4,
            FullName = fullName,
            AssesseeType = assesseeType,
            OrganizationId = organizationId
        };
    }

    /// <summary>Updates profile contact details.</summary>
    public void UpdateContact(string? email, string? phone, DateOnly? dob, string? address)
    {
        Email = email;
        PhoneNumber = phone;
        DateOfBirth = dob;
        Address = address;
    }

    /// <summary>Sets the Aadhaar last-4 (never full Aadhaar).</summary>
    public void SetAadhaarLast4(string aadhaarLast4) => AadhaarLast4 = aadhaarLast4;

    /// <summary>Updates business-specific fields.</summary>
    public void SetTurnover(decimal? annualTurnoverCr) => AnnualTurnoverCr = annualTurnoverCr;

    /// <summary>DPDP Act 2023: anonymize all PII fields.</summary>
    public void Anonymize(string reason)
    {
        PanCipher = "[ANONYMIZED]";
        PanLast4 = "****";
        FullName = "[ANONYMIZED]";
        Email = null;
        PhoneNumber = null;
        AadhaarLast4 = null;
        Address = null;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
