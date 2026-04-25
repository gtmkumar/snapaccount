using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Events;

/// <summary>Raised when a filing is submitted for CA review.</summary>
public sealed record FilingSubmittedEvent(Guid FilingId, Guid AssesseeId, string AssessmentYear, string Regime) : DomainEvent;

/// <summary>Raised when tax computation is completed and pinned.</summary>
public sealed record TaxComputationCompletedEvent(Guid FilingId, Guid AssesseeId, string AssessmentYear, string Regime) : DomainEvent;

/// <summary>Raised when a filing is filed with the IT department.</summary>
public sealed record FilingFiledEvent(Guid FilingId, Guid AssesseeId, string AssessmentYear, string AcknowledgementNumber) : DomainEvent;

/// <summary>Raised when a refund is marked as issued.</summary>
public sealed record RefundIssuedEvent(Guid FilingId, Guid AssesseeId, string AssessmentYear) : DomainEvent;

/// <summary>Raised when an ITR deadline reminder is due.</summary>
public sealed record ItrDeadlineReminderEvent(Guid AssesseeId, string AssessmentYear, int DaysUntilDeadline, bool IsWeeklyDigest) : DomainEvent;
