using MediatR;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Behaviors;

/// <summary>
/// SEC-012: MediatR pipeline behavior that enforces RBAC permission checks.
/// Reads <see cref="RequiresPermissionAttribute"/> (from Shared.Application) from the request type.
/// If the current user does not hold the required permission, returns a Forbidden error
/// without executing the handler.
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
        // Resolve the [RequiresPermission] attribute from the concrete request type
        var permissionAttr = request.GetType()
            .GetCustomAttributes(typeof(RequiresPermissionAttribute), inherit: false)
            .Cast<RequiresPermissionAttribute>()
            .FirstOrDefault();

        if (permissionAttr is null)
            return await next();

        // Must be authenticated first
        if (!currentUser.IsAuthenticated)
        {
            var unauthorizedError = Error.Unauthorized(
                "Auth.NotAuthenticated",
                "Authentication is required to execute this operation.");
            return CreateFailureResult<TResponse>(unauthorizedError);
        }

        // Check if the user's roles grant the required permission
        if (!currentUser.HasPermission(permissionAttr.Permission))
        {
            var forbiddenError = Error.Forbidden(
                "Auth.InsufficientPermission",
                $"Permission '{permissionAttr.Permission}' is required to execute this operation.");
            return CreateFailureResult<TResponse>(forbiddenError);
        }

        return await next();
    }

    private static TResponse CreateFailureResult<T>(Error error)
    {
        // TResponse is either Result or Result<TValue>
        var responseType = typeof(T);

        if (responseType == typeof(Result))
            return (TResponse)(object)Result.Failure(error);

        if (responseType.IsGenericType && responseType.GetGenericTypeDefinition() == typeof(Result<>))
        {
            var innerType = responseType.GetGenericArguments()[0];
            var failureMethod = typeof(Result<>)
                .MakeGenericType(innerType)
                .GetMethod(nameof(Result<object>.Failure), [typeof(Error)])!;
            return (TResponse)failureMethod.Invoke(null, [error])!;
        }

        // Fallback — should not be reached for well-typed handlers
        throw new InvalidOperationException(
            $"PermissionBehavior: TResponse type {responseType.Name} is not a Result type.");
    }
}
