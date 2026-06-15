using MediatR;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AccountingService.Application.Behaviors;

/// <summary>
/// SEC-026: MediatR pipeline behavior that enforces RBAC permission checks for AccountingService.
/// Reads <see cref="RequiresPermissionAttribute"/> from the request type.
/// Returns Forbidden if the current user lacks the required permission.
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
        {
            var unauthorizedError = Error.Unauthorized(
                "Auth.NotAuthenticated",
                "Authentication is required to execute this operation.");
            return CreateFailureResult<TResponse>(unauthorizedError);
        }

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

        throw new InvalidOperationException(
            $"PermissionBehavior: TResponse type {responseType.Name} is not a Result type.");
    }
}
