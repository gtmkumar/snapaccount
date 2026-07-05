using ItrService.Application.Behaviors;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Services;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace ItrService.Application;

/// <summary>
/// Registers ItrService Application layer services.
/// Adds PermissionBehavior (SEC-026 RBAC), TaxComputationEngine, and ItrFormResolverService.
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

        // DG-ITR-10: ITR form auto-determination from income heads + assessee type.
        // Registered as Singleton — pure logic with no DB/IO dependencies; config values
        // are read from IConfiguration on each call so AY rule changes take effect on re-deploy.
        services.AddSingleton<IItrFormResolver, ItrFormResolverService>();

        return services;
    }
}
