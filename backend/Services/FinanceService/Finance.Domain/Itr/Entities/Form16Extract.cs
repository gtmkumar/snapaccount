using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// Form 16 OCR extraction result.
/// P6-HANDOFF-19: employee_pan_cipher stores AES-256-CBC ciphertext — NEVER plaintext PAN.
/// parsed_json contains employer TAN/PAN/salary — flagged for DPDP cascade.
/// </summary>
public class Form16Extract : BaseAuditableEntity
{
    /// <summary>The filing this Form 16 belongs to.</summary>
    public Guid FilingId { get; private set; }

    /// <summary>The assessee who uploaded this Form 16.</summary>
    public Guid AssesseeId { get; private set; }

    /// <summary>GCS URI of the uploaded Form 16 PDF.</summary>
    public string GcsUri { get; private set; } = string.Empty;

    /// <summary>
    /// P6-HANDOFF-19: AES-256-CBC ciphertext of employee's PAN.
    /// </summary>
    public string EmployeePanCipher { get; private set; } = string.Empty;

    /// <summary>Last 4 chars of employee PAN for masked display.</summary>
    public string EmployeePanLast4 { get; private set; } = string.Empty;

    /// <summary>Employer TAN (Tax Deduction Account Number).</summary>
    public string? EmployerTan { get; private set; }

    /// <summary>Employer PAN.</summary>
    public string? EmployerPan { get; private set; }

    /// <summary>Employer name.</summary>
    public string? EmployerName { get; private set; }

    /// <summary>Gross salary from Part B of Form 16 (INR).</summary>
    public decimal? GrossSalary { get; private set; }

    /// <summary>Total TDS deducted (INR).</summary>
    public decimal? TdsDeducted { get; private set; }

    /// <summary>Assessment year this Form 16 covers.</summary>
    public string? AssessmentYear { get; private set; }

    /// <summary>
    /// Full parsed JSON from Document AI OCR — contains all extracted fields.
    /// P6-HANDOFF-21: DPDP cascade must null this field on erasure.
    /// </summary>
    public string? ParsedJson { get; private set; }

    /// <summary>OCR confidence score (0-1).</summary>
    public decimal? OcrConfidenceScore { get; private set; }

    /// <summary>OCR processing status: PENDING | PROCESSING | COMPLETED | FAILED.</summary>
    public string OcrStatus { get; private set; } = "PENDING";

    /// <summary>DPDP anonymization timestamp.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>Anonymization reason.</summary>
    public string? AnonymizationReason { get; private set; }

    private Form16Extract() { }

    /// <summary>Creates a new Form 16 extract record.</summary>
    public static Form16Extract Create(
        Guid filingId,
        Guid assesseeId,
        string gcsUri,
        string employeePanCipher,
        string employeePanLast4)
    {
        return new Form16Extract
        {
            FilingId = filingId,
            AssesseeId = assesseeId,
            GcsUri = gcsUri,
            EmployeePanCipher = employeePanCipher,
            EmployeePanLast4 = employeePanLast4
        };
    }

    /// <summary>Stores OCR extraction results from Document AI.</summary>
    public void SetParsedData(
        string? employerTan,
        string? employerPan,
        string? employerName,
        decimal? grossSalary,
        decimal? tdsDeducted,
        string? assessmentYear,
        string parsedJson,
        decimal confidenceScore)
    {
        EmployerTan = employerTan;
        EmployerPan = employerPan;
        EmployerName = employerName;
        GrossSalary = grossSalary;
        TdsDeducted = tdsDeducted;
        AssessmentYear = assessmentYear;
        ParsedJson = parsedJson;
        OcrConfidenceScore = confidenceScore;
        OcrStatus = "COMPLETED";
    }

    /// <summary>Marks OCR as failed.</summary>
    public void MarkOcrFailed() => OcrStatus = "FAILED";

    /// <summary>DPDP Act 2023: anonymize all PII.</summary>
    public void Anonymize(string reason)
    {
        EmployeePanCipher = "[ANONYMIZED]";
        EmployeePanLast4 = "****";
        EmployerTan = null;
        EmployerPan = null;
        EmployerName = null;
        ParsedJson = null; // DPDP cascade — wipe employer/salary data
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
