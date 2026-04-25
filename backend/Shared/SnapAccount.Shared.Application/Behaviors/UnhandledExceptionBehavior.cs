using MediatR;
using Microsoft.Extensions.Logging;

namespace SnapAccount.Shared.Application.Behaviors;

/// <summary>
/// MediatR pipeline behavior that catches unhandled exceptions, logs them with full
/// request context, and rethrows so the global exception middleware produces a
/// structured 500 response. Matches the Jason Taylor CleanArchitecture reference pattern.
/// </summary>
public sealed class UnhandledExceptionBehavior<TRequest, TResponse>(
    ILogger<UnhandledExceptionBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        try
        {
            return await next(cancellationToken);
        }
        catch (Exception ex)
        {
            var requestName = typeof(TRequest).Name;
            logger.LogError(ex, "SnapAccount unhandled exception for request {RequestName} {@Request}",
                requestName, request);
            throw;
        }
    }
}
