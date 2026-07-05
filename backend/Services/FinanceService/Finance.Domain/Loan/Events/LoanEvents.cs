using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Events;

/// <summary>Raised when a new loan application is started (Draft created).</summary>
public sealed record LoanApplicationStartedEvent(Guid ApplicationId, Guid OrgId) : DomainEvent;

/// <summary>Raised when a loan application is submitted for bank review.</summary>
public sealed record LoanApplicationSubmittedEvent(Guid ApplicationId, Guid OrgId) : DomainEvent;

/// <summary>Raised when a loan application is assigned to a specific partner bank.</summary>
public sealed record LoanAssignedToBankEvent(Guid ApplicationId, Guid OrgId, Guid BankId) : DomainEvent;

/// <summary>Raised when a partner bank approves a loan application.</summary>
public sealed record LoanApprovedEvent(Guid ApplicationId, Guid OrgId) : DomainEvent;

/// <summary>Raised when a partner bank rejects a loan application.</summary>
public sealed record LoanRejectedEvent(Guid ApplicationId, Guid OrgId, string Reason) : DomainEvent;

/// <summary>Raised when funds are disbursed to the borrower's account.</summary>
public sealed record LoanDisbursedEvent(Guid ApplicationId, Guid OrgId, decimal DisbursedAmount) : DomainEvent;

/// <summary>Raised when a disbursement attempt fails (webhook-reported).</summary>
public sealed record LoanDisbursementFailedEvent(Guid ApplicationId, Guid OrgId, string Reason) : DomainEvent;

/// <summary>Raised when a disbursement is reversed (webhook-reported).</summary>
public sealed record LoanDisbursementReversedEvent(Guid ApplicationId, Guid OrgId, string Reason) : DomainEvent;
