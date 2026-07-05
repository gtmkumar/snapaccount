using MediatR;
using Microsoft.Extensions.DependencyInjection;
using NotificationService.Application.Behaviors;
using SnapAccount.Shared.Application;

namespace NotificationService.Application;

/// <summary>Registers NotificationService Application layer services.</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the full NotificationService Application pipeline:
    /// UnhandledException → Logging → Validation → Performance → Permission (SEC-026).
    /// </summary>
    public static IServiceCollection AddNotificationApplicationServices(
        this IServiceCollection services)
    {
        // Shared pipeline: UnhandledException → Logging → Validation → Performance
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC PermissionBehavior — runs last in pipeline after validation
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
