using CallbackService.Application.Behaviors;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace CallbackService.Application;

/// <summary>Registers CallbackService Application layer services.</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the full CallbackService Application pipeline:
    /// UnhandledException → Logging → Validation → Performance → Permission (SEC-026).
    /// </summary>
    public static IServiceCollection AddCallbackApplicationServices(this IServiceCollection services)
    {
        // Shared pipeline: UnhandledException → Logging → Validation → Performance
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC PermissionBehavior — runs last in pipeline after validation
        services.AddMediatR(cfg =>
            cfg.AddOpenBehavior(typeof(PermissionBehavior<,>)));

        return services;
    }
}
