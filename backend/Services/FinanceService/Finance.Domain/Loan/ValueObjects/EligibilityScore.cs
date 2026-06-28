using SnapAccount.Shared.Domain;

namespace LoanService.Domain.ValueObjects;

/// <summary>
/// DG-LOAN-07: Tri-state eligibility status for F2.2 "partially eligible" result.
/// <list type="bullet">
///   <item><description><see cref="Eligible"/> — score &gt;= 50 AND all candidate products qualify.</description></item>
///   <item><description><see cref="PartiallyEligible"/> — score &gt;= 50 but only a subset of products qualify;
///     the applicant can access some products now and see what is needed for others.</description></item>
///   <item><description><see cref="NotEligible"/> — score &lt; 50; no products qualify.</description></item>
/// </list>
/// </summary>
public enum EligibilityStatus
{
    /// <summary>All active products qualify.</summary>
    Eligible,
    /// <summary>Some products qualify; unmet criteria returned per non-qualifying product.</summary>
    PartiallyEligible,
    /// <summary>No products qualify.</summary>
    NotEligible
}

/// <summary>
/// Represents the computed eligibility score for a loan application.
/// Score is 0–100; products below 50 are not recommended.
/// </summary>
public sealed class EligibilityScore : ValueObject
{
    /// <summary>Numeric score 0–100.</summary>
    public decimal Score { get; }

    /// <summary>Whether the applicant is considered eligible (score >= 50).</summary>
    public bool IsEligible => Score >= 50m;

    /// <summary>
    /// DG-LOAN-07: Tri-state eligibility status derived from score and qualifying-product coverage.
    /// Eligible = score &gt;= 50 and all candidates qualify;
    /// PartiallyEligible = score &gt;= 50 but only a subset qualifies;
    /// NotEligible = score &lt; 50.
    /// </summary>
    public EligibilityStatus EligibilityStatus { get; }

    /// <summary>Human-readable reasons explaining the score components.</summary>
    public IReadOnlyList<string> Reasons { get; }

    /// <summary>IDs of loan products for which the applicant qualifies.</summary>
    public IReadOnlyList<Guid> QualifyingProductIds { get; }

    /// <summary>
    /// DG-LOAN-07: Per-product remediation guidance for non-qualifying products.
    /// Key = LoanProduct.Id; Value = list of human-readable unmet-criteria strings
    /// (e.g. "File GSTR-3B for 3 pending months to increase compliance score by 7 points").
    /// Empty when all products qualify (<see cref="EligibilityStatus.Eligible"/>).
    /// </summary>
    public IReadOnlyDictionary<Guid, IReadOnlyList<string>> UnmetCriteriaByProduct { get; }

    private EligibilityScore(
        decimal score,
        IReadOnlyList<string> reasons,
        IReadOnlyList<Guid> qualifyingProductIds,
        IReadOnlyDictionary<Guid, IReadOnlyList<string>> unmetCriteriaByProduct)
    {
        Score = score;
        Reasons = reasons;
        QualifyingProductIds = qualifyingProductIds;
        UnmetCriteriaByProduct = unmetCriteriaByProduct;

        // Derive EligibilityStatus from score + product coverage.
        // Note: candidateTotalCount is implicit — if unmetCriteriaByProduct is non-empty there are
        // non-qualifying products, so at least partial coverage implies PartiallyEligible.
        EligibilityStatus = DeriveStatus(score, qualifyingProductIds, unmetCriteriaByProduct);
    }

    private static EligibilityStatus DeriveStatus(
        decimal score,
        IReadOnlyList<Guid> qualifying,
        IReadOnlyDictionary<Guid, IReadOnlyList<string>> unmet)
    {
        if (score < 50m) return EligibilityStatus.NotEligible;
        // Score >= 50: eligible for at least some products.
        // If there are products with unmet criteria, the applicant is partially eligible.
        return unmet.Count > 0 ? EligibilityStatus.PartiallyEligible : EligibilityStatus.Eligible;
    }

    /// <summary>
    /// Creates an eligibility score result.
    /// </summary>
    /// <param name="score">Numeric score 0–100.</param>
    /// <param name="reasons">Score-component explanation strings.</param>
    /// <param name="qualifyingProductIds">Products the applicant fully qualifies for.</param>
    /// <param name="unmetCriteriaByProduct">
    /// DG-LOAN-07: Per-product unmet criteria for non-qualifying products.
    /// Use <see cref="CreateSimple"/> when unmet-criteria data is unavailable.
    /// </param>
    public static EligibilityScore Create(
        decimal score,
        IEnumerable<string> reasons,
        IEnumerable<Guid> qualifyingProductIds,
        IDictionary<Guid, IReadOnlyList<string>>? unmetCriteriaByProduct = null)
    {
        if (score < 0 || score > 100)
            throw new ArgumentOutOfRangeException(nameof(score), "Score must be 0–100.");
        IReadOnlyDictionary<Guid, IReadOnlyList<string>> unmet =
            unmetCriteriaByProduct is { Count: > 0 }
                ? new Dictionary<Guid, IReadOnlyList<string>>(unmetCriteriaByProduct)
                : new Dictionary<Guid, IReadOnlyList<string>>();
        return new EligibilityScore(score, [.. reasons], [.. qualifyingProductIds], unmet);
    }

    /// <inheritdoc />
    protected override IEnumerable<object> GetEqualityComponents()
    {
        yield return Score;
        foreach (var r in Reasons) yield return r;
        foreach (var p in QualifyingProductIds) yield return p;
    }
}
