using ItrService.Application.Behaviors;
using ItrService.Application.Services;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace ItrService.Application;

/// <summary>
/// Registers ItrService Application layer services.
/// Adds PermissionBehavior (SEC-026 RBAC) and TaxComputationEngine.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full ItrService Application pipeline.</summary>
    public static IServiceCollection AddItrApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        // Pure tax engine — no DB writes
        services.AddScoped<ITaxComputationEngine, TaxComputationEngine>();

        return services;
    }
}
