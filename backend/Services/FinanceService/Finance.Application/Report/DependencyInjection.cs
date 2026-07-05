using MediatR;
using Microsoft.Extensions.DependencyInjection;
using ReportService.Application.Behaviors;
using SnapAccount.Shared.Application;

namespace ReportService.Application;

/// <summary>
/// Registers ReportService Application layer services into the DI container.
/// Pipeline: Logging → Validation → PermissionBehavior (SEC-026).
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full ReportService Application pipeline including PermissionBehavior.</summary>
    public static IServiceCollection AddReportApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check — last in pipeline so validation runs first
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
