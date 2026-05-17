using AuthService.Application.Behaviors;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace AuthService.Application;

/// <summary>
/// Registers AuthService Application layer services into the DI container.
/// Calls the shared <c>AddApplicationServices</c> to wire MediatR, FluentValidation,
/// and the JT-pattern pipeline behaviors, then appends the AuthService-specific
/// <see cref="PermissionBehavior{TRequest,TResponse}"/> (SEC-012: RBAC enforcement).
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the full AuthService Application pipeline:
    /// UnhandledException → Logging → Validation → Performance → Permission (SEC-012).
    /// </summary>
    public static IServiceCollection AddAuthApplicationServices(
        this IServiceCollection services)
    {
        // Shared pipeline: UnhandledException → Logging → Validation → Performance
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-012: RBAC PermissionBehavior — runs last in pipeline after validation
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
