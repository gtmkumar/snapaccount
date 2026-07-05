using MediatR;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Behaviors;

/// <summary>
/// SEC-026: MediatR pipeline behavior that enforces RBAC permission checks for ItrService.
/// </summary>
public sealed class PermissionBehavior<TRequest, TResponse>(ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
    where TResponse : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var permissionAttr = request.GetType()
            .GetCustomAttributes(typeof(RequiresPermissionAttribute), inherit: false)
            .Cast<RequiresPermissionAttribute>()
            .FirstOrDefault();

        if (permissionAttr is null) return await next();

        if (!currentUser.IsAuthenticated)
            return CreateFailureResult<TResponse>(Error.Unauthorized("Auth.NotAuthenticated", "Authentication required."));

        if (!currentUser.HasPermission(permissionAttr.Permission))
            return CreateFailureResult<TResponse>(Error.Forbidden("Auth.InsufficientPermission",
                $"Permission '{permissionAttr.Permission}' required."));

        return await next();
    }

    private static TResponse CreateFailureResult<T>(Error error)
    {
        var rt = typeof(T);
        if (rt == typeof(Result)) return (TResponse)(object)Result.Failure(error);
        if (rt.IsGenericType && rt.GetGenericTypeDefinition() == typeof(Result<>))
        {
            var inner = rt.GetGenericArguments()[0];
            var m = typeof(Result<>).MakeGenericType(inner).GetMethod(nameof(Result<object>.Failure), [typeof(Error)])!;
            return (TResponse)m.Invoke(null, [error])!;
        }
        throw new InvalidOperationException($"PermissionBehavior: unsupported TResponse type {rt.Name}");
    }
}
