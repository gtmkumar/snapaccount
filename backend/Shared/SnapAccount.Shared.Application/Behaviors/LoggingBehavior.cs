using MediatR;
using Microsoft.Extensions.Logging;

namespace SnapAccount.Shared.Application.Behaviors;

/// <summary>
/// MediatR pipeline behavior that logs request entry and exit with user context.
/// Runs after UnhandledExceptionBehavior and before ValidationBehavior, matching
/// the Jason Taylor CleanArchitecture reference pipeline order.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse>(
    ILogger<LoggingBehavior<TRequest, TResponse>> logger,
    ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;
        var userId = currentUser.IsAuthenticated ? currentUser.UserId.ToString() : "anonymous";

        logger.LogInformation(
            "SnapAccount request: {RequestName} UserId={UserId}",
            requestName, userId);

        var response = await next(cancellationToken);

        logger.LogInformation(
            "SnapAccount response: {RequestName} UserId={UserId}",
            requestName, userId);

        return response;
    }
}
