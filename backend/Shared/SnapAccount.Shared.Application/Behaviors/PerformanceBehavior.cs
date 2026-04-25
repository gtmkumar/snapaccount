using System.Diagnostics;
using MediatR;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;

namespace SnapAccount.Shared.Application.Behaviors;

/// <summary>
/// MediatR pipeline behavior that measures request execution time and emits a warning
/// when a handler exceeds 500 ms. Matches the Jason Taylor CleanArchitecture reference
/// pattern — PerformanceBehaviour. Helps surface N+1 queries and slow Vertex AI calls.
/// </summary>
public sealed class PerformanceBehavior<TRequest, TResponse>(
    ILogger<PerformanceBehavior<TRequest, TResponse>> logger,
    ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private const int SlowRequestThresholdMs = 500;

    /// <inheritdoc />
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var response = await next(cancellationToken);
        sw.Stop();

        var elapsed = sw.ElapsedMilliseconds;
        if (elapsed > SlowRequestThresholdMs)
        {
            var requestName = typeof(TRequest).Name;
            var userId = currentUser.IsAuthenticated ? currentUser.UserId.ToString() : "anonymous";

            logger.LogWarning(
                "SnapAccount slow request: {RequestName} took {Elapsed}ms (threshold {Threshold}ms). UserId={UserId}. Request={@Request}",
                requestName, elapsed, SlowRequestThresholdMs, userId, request);
        }

        return response;
    }
}
