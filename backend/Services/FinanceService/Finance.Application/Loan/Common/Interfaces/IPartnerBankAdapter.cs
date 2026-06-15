using LoanService.Domain.ValueObjects;

namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Adapter interface for submitting a loan application to a partner bank.
/// Implementations: EmailPartnerBankAdapter (Email), RestPartnerBankAdapter (REST).
/// DI registration is keyed on BankAdapterType.
/// </summary>
public interface IPartnerBankAdapter
{
    /// <summary>
    /// Submits a loan application package to the partner bank.
    /// </summary>
    /// <param name="applicationId">Loan application ID.</param>
    /// <param name="bankId">Partner bank ID.</param>
    /// <param name="packagePdf">Stream of the PDF package bytes.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Submission result including bank reference or failure reason.</returns>
    Task<BankSubmissionResult> SubmitApplicationAsync(
        Guid applicationId,
        Guid bankId,
        Stream packagePdf,
        CancellationToken ct);
}
