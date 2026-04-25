namespace ChatService.Domain.Enums;

/// <summary>
/// Business category of a support thread.
/// Seeded in chat.categories. Used for routing and inbox filtering.
/// </summary>
public enum ThreadCategory
{
    /// <summary>GST-related queries.</summary>
    GST = 1,

    /// <summary>ITR / income-tax queries.</summary>
    ITR = 2,

    /// <summary>Document upload / processing queries.</summary>
    DOC = 3,

    /// <summary>Loan application queries.</summary>
    LOAN = 4,

    /// <summary>Billing and subscription queries.</summary>
    BILLING = 5,

    /// <summary>General / uncategorised support.</summary>
    GENERAL = 6
}
