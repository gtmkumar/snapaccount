using LoanService.Application.Behaviors;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace LoanService.Application;

/// <summary>
/// Registers LoanService Application layer services into the DI container.
/// Pipeline: UnhandledException → Logging → Validation → Performance → PermissionBehavior (SEC-026).
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full LoanService Application pipeline including PermissionBehavior.</summary>
    public static IServiceCollection AddLoanApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check — must be last in pipeline so validation runs first
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
