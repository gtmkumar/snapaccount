using GstService.Application.Behaviors;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace GstService.Application;

/// <summary>
/// Registers GstService Application layer services into the DI container.
/// Calls the shared <c>AddApplicationServices</c> to wire MediatR, FluentValidation,
/// and the JT-pattern pipeline behaviors (UnhandledException → Logging → Validation → Performance).
/// Adds PermissionBehavior (SEC-026 RBAC) after the shared pipeline.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full GstService Application pipeline including PermissionBehavior.</summary>
    public static IServiceCollection AddGstApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check — must be last in pipeline so validation runs first
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
