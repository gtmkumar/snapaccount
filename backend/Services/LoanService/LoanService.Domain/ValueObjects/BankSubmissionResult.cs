using SnapAccount.Shared.Domain;

namespace LoanService.Domain.ValueObjects;

/// <summary>
/// Represents the result of submitting a loan application to a partner bank.
/// Returned by <c>IPartnerBankAdapter.SubmitApplicationAsync</c>.
/// </summary>
public sealed class BankSubmissionResult : ValueObject
{
    /// <summary>Whether the submission was accepted by the bank.</summary>
    public bool IsSuccess { get; }

    /// <summary>Bank-assigned reference number (populated on success).</summary>
    public string? BankReferenceNo { get; }

    /// <summary>Email message ID or HTTP response ID for audit tracking.</summary>
    public string? MessageId { get; }

    /// <summary>Human-readable failure reason (populated on failure).</summary>
    public string? FailureReason { get; }

    private BankSubmissionResult(bool isSuccess, string? bankReferenceNo, string? messageId, string? failureReason)
    {
        IsSuccess = isSuccess;
        BankReferenceNo = bankReferenceNo;
        MessageId = messageId;
        FailureReason = failureReason;
    }

    /// <summary>Creates a successful submission result.</summary>
    public static BankSubmissionResult Success(string bankReferenceNo, string? messageId = null)
        => new(true, bankReferenceNo, messageId, null);

    /// <summary>Creates a failed submission result.</summary>
    public static BankSubmissionResult Failure(string reason)
        => new(false, null, null, reason);

    /// <inheritdoc />
    protected override IEnumerable<object> GetEqualityComponents()
    {
        yield return IsSuccess;
        yield return BankReferenceNo ?? string.Empty;
        yield return MessageId ?? string.Empty;
        yield return FailureReason ?? string.Empty;
    }
}
