namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Publishes loan domain events to Google Pub/Sub topics.
/// Accepts plain object payloads (serialised as JSON) — does not require IDomainEvent constraint.
/// </summary>
public interface ILoanEventPublisher
{
    /// <summary>Publishes a serialised event payload to the specified topic.</summary>
    Task PublishAsync(string topicId, object payload, CancellationToken ct = default);
}
