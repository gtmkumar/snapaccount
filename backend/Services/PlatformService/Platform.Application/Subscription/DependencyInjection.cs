using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SubscriptionService.Application.Behaviors;

namespace SubscriptionService.Application;

/// <summary>
/// Registers SubscriptionService Application layer services.
/// Pipeline: Logging → Validation → PermissionBehavior (SEC-026).
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full SubscriptionService Application pipeline.</summary>
    public static IServiceCollection AddSubscriptionApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
