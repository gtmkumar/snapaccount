using AuthService.Application.Interfaces;
using AuthService.Domain.Events;
using MediatR;
using Microsoft.Extensions.Logging;

namespace AuthService.Application.Users.EventHandlers;

/// <summary>
/// SEC-007: Handles AccountDeletionRequestedEvent by publishing a Pub/Sub message
/// to the 'account-deletion-events' topic so all other microservices can cascade
/// erasure of user data (DPDP Act 2023 Right to Erasure).
/// </summary>
public sealed class AccountDeletionRequestedEventHandler(
    IEventPublisher eventPublisher,
    ILogger<AccountDeletionRequestedEventHandler> logger)
    : INotificationHandler<AccountDeletionRequestedEvent>
{
    private const string AccountDeletionTopic = "account-deletion-events";

    /// <inheritdoc />
    public async Task Handle(AccountDeletionRequestedEvent notification, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "Publishing AccountDeletionRequestedEvent for user {UserId} to topic {Topic}",
            notification.UserId, AccountDeletionTopic);

        try
        {
            await eventPublisher.PublishAsync(AccountDeletionTopic, notification, cancellationToken);

            logger.LogInformation(
                "Successfully published account deletion event for user {UserId}. " +
                "Downstream services will anonymize and delete user data.",
                notification.UserId);
        }
        catch (Exception ex)
        {
            // Log but do not rethrow — account deletion in AuthService must not fail
            // due to Pub/Sub unavailability. A background retry should handle this.
            logger.LogError(
                ex,
                "Failed to publish AccountDeletionRequestedEvent for user {UserId} to Pub/Sub topic {Topic}. " +
                "Cross-service erasure may be delayed.",
                notification.UserId, AccountDeletionTopic);
        }
    }
}
