using AccountingService.Application.Behaviors;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace AccountingService.Application;

/// <summary>
/// Registers AccountingService Application layer services.
/// Wires MediatR, FluentValidation, and the JT-pattern pipeline behaviors.
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the full AccountingService Application pipeline:
    /// UnhandledException → Logging → Validation → Performance → Permission (SEC-026).
    /// </summary>
    public static IServiceCollection AddAccountingApplicationServices(
        this IServiceCollection services)
    {
        // Shared pipeline: UnhandledException → Logging → Validation → Performance
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC PermissionBehavior — runs last in pipeline after validation
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
