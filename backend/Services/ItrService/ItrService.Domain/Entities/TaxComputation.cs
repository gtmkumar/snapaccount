using SnapAccount.Shared.Domain;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ItrService.Domain.Entities;

/// <summary>
/// Represents a tax computation result for a given assessment year and tax regime.
/// SEC-020: stores a SHA-256 integrity hash of all computation inputs so that
/// any tampering with the stored figures can be detected at read time.
/// </summary>
public class TaxComputation : BaseAuditableEntity
{
    public Guid UserId { get; private set; }
    public Guid ItrReturnId { get; private set; }
    public string AssessmentYear { get; private set; } = string.Empty;

    // --- Income components (INR, decimal precision) ---
    public decimal GrossSalaryIncome { get; private set; }
    public decimal HousePropertyIncome { get; private set; }
    public decimal BusinessProfessionalIncome { get; private set; }
    public decimal CapitalGainsIncome { get; private set; }
    public decimal OtherSourcesIncome { get; private set; }

    // --- Deductions ---
    public decimal TotalDeductions { get; private set; }

    // --- Results ---
    public decimal TaxableIncome { get; private set; }
    public decimal TaxPayable { get; private set; }
    public decimal TaxAlreadyPaid { get; private set; }
    public decimal TaxRefundOrDue { get; private set; }
    public string Regime { get; private set; } = "NEW"; // OLD | NEW

    /// <summary>
    /// SEC-020: SHA-256 hash of the canonical JSON of all computation inputs.
    /// Computed on create; verified on read to detect tampering.
    /// </summary>
    public string ComputationHash { get; private set; } = string.Empty;

    private TaxComputation() { }

    /// <summary>
    /// Creates a new <see cref="TaxComputation"/> and computes its integrity hash.
    /// </summary>
    public static TaxComputation Create(
        Guid userId,
        Guid itrReturnId,
        string assessmentYear,
        decimal grossSalaryIncome,
        decimal housePropertyIncome,
        decimal businessProfessionalIncome,
        decimal capitalGainsIncome,
        decimal otherSourcesIncome,
        decimal totalDeductions,
        decimal taxableIncome,
        decimal taxPayable,
        decimal taxAlreadyPaid,
        decimal taxRefundOrDue,
        string regime)
    {
        var computation = new TaxComputation
        {
            UserId = userId,
            ItrReturnId = itrReturnId,
            AssessmentYear = assessmentYear,
            GrossSalaryIncome = grossSalaryIncome,
            HousePropertyIncome = housePropertyIncome,
            BusinessProfessionalIncome = businessProfessionalIncome,
            CapitalGainsIncome = capitalGainsIncome,
            OtherSourcesIncome = otherSourcesIncome,
            TotalDeductions = totalDeductions,
            TaxableIncome = taxableIncome,
            TaxPayable = taxPayable,
            TaxAlreadyPaid = taxAlreadyPaid,
            TaxRefundOrDue = taxRefundOrDue,
            Regime = regime
        };

        computation.ComputationHash = computation.ComputeHash();
        return computation;
    }

    /// <summary>
    /// Verifies the stored <see cref="ComputationHash"/> against the current field values.
    /// Returns <c>false</c> if the stored data has been tampered with.
    /// </summary>
    public bool VerifyIntegrity() =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(ComputationHash),
            Encoding.UTF8.GetBytes(ComputeHash()));

    private string ComputeHash()
    {
        // Canonical JSON: sorted keys, invariant culture numeric representation
        var inputs = new
        {
            UserId,
            ItrReturnId,
            AssessmentYear,
            GrossSalaryIncome = GrossSalaryIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            HousePropertyIncome = HousePropertyIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            BusinessProfessionalIncome = BusinessProfessionalIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            CapitalGainsIncome = CapitalGainsIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            OtherSourcesIncome = OtherSourcesIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            TotalDeductions = TotalDeductions.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            TaxableIncome = TaxableIncome.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            TaxPayable = TaxPayable.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            TaxAlreadyPaid = TaxAlreadyPaid.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            TaxRefundOrDue = TaxRefundOrDue.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
            Regime
        };

        var canonical = JsonSerializer.Serialize(inputs, new JsonSerializerOptions
        {
            PropertyNamingPolicy = null, // PascalCase — match property names
            WriteIndented = false
        });

        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}
