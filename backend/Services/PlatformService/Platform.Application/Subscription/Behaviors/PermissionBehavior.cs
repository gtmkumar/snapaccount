using MediatR;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace SubscriptionService.Application.Behaviors;

/// <summary>
/// SEC-026: MediatR RBAC permission behavior for SubscriptionService.
/// </summary>
public sealed class PermissionBehavior<TRequest, TResponse>(ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
    where TResponse : notnull
{
    /// <inheritdoc />
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var permissionAttr = request.GetType()
            .GetCustomAttributes(typeof(RequiresPermissionAttribute), inherit: false)
            .Cast<RequiresPermissionAttribute>()
            .FirstOrDefault();

        if (permissionAttr is null)
            return await next();

        if (!currentUser.IsAuthenticated)
            return CreateFailureResult<TResponse>(Error.Unauthorized("Auth.NotAuthenticated", "Authentication is required."));

        if (!currentUser.HasPermission(permissionAttr.Permission))
            return CreateFailureResult<TResponse>(Error.Forbidden(
                "Auth.InsufficientPermission",
                $"Permission '{permissionAttr.Permission}' is required."));

        return await next();
    }

    private static TResponse CreateFailureResult<T>(Error error)
    {
        var responseType = typeof(T);
        if (responseType == typeof(Result))
            return (TResponse)(object)Result.Failure(error);
        if (responseType.IsGenericType && responseType.GetGenericTypeDefinition() == typeof(Result<>))
        {
            var innerType = responseType.GetGenericArguments()[0];
            var failureMethod = typeof(Result<>).MakeGenericType(innerType)
                .GetMethod(nameof(Result<object>.Failure), [typeof(Error)])!;
            return (TResponse)failureMethod.Invoke(null, [error])!;
        }
        throw new InvalidOperationException($"PermissionBehavior: TResponse {responseType.Name} is not a Result type.");
    }
}
