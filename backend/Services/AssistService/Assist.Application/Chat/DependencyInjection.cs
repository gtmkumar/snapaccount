using MediatR;
using Microsoft.Extensions.DependencyInjection;
using ChatService.Application.Behaviors;
using SnapAccount.Shared.Application;

namespace ChatService.Application;

/// <summary>
/// Registers ChatService Application layer services into the DI container.
/// Pipeline: Logging → Validation → PermissionBehavior (SEC-026).
/// </summary>
public static class DependencyInjection
{
    /// <summary>Registers the full ChatService Application pipeline including PermissionBehavior.</summary>
    public static IServiceCollection AddChatApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);

        // SEC-026: RBAC permission check — last in pipeline so validation runs first
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(PermissionBehavior<,>));

        return services;
    }
}
