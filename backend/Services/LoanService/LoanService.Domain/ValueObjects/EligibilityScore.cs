using SnapAccount.Shared.Domain;

namespace LoanService.Domain.ValueObjects;

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

    /// <summary>Human-readable reasons explaining the score components.</summary>
    public IReadOnlyList<string> Reasons { get; }

    /// <summary>IDs of loan products for which the applicant qualifies.</summary>
    public IReadOnlyList<Guid> QualifyingProductIds { get; }

    private EligibilityScore(decimal score, IReadOnlyList<string> reasons, IReadOnlyList<Guid> qualifyingProductIds)
    {
        Score = score;
        Reasons = reasons;
        QualifyingProductIds = qualifyingProductIds;
    }

    /// <summary>Creates an eligibility score result.</summary>
    public static EligibilityScore Create(decimal score, IEnumerable<string> reasons, IEnumerable<Guid> qualifyingProductIds)
    {
        if (score < 0 || score > 100)
            throw new ArgumentOutOfRangeException(nameof(score), "Score must be 0–100.");
        return new EligibilityScore(score, [.. reasons], [.. qualifyingProductIds]);
    }

    /// <inheritdoc />
    protected override IEnumerable<object> GetEqualityComponents()
    {
        yield return Score;
        foreach (var r in Reasons) yield return r;
        foreach (var p in QualifyingProductIds) yield return p;
    }
}
