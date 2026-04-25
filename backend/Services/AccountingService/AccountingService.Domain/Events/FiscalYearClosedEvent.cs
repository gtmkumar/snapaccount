using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Events;

/// <summary>
/// Raised when a financial year is successfully closed for an organisation.
/// Downstream handlers may lock the period for further postings.
/// </summary>
public sealed record FiscalYearClosedEvent(
    Guid FiscalYearCloseId,
    Guid OrgId,
    int FyYear) : DomainEvent;
