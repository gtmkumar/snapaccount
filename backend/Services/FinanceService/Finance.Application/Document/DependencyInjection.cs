using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace DocumentService.Application;

/// <summary>
/// Registers DocumentService Application layer services into the DI container.
/// Calls the shared <c>AddApplicationServices</c> to wire MediatR, FluentValidation,
/// and the JT-pattern pipeline behaviors (UnhandledException → Logging → Validation → Performance).
/// DocumentService does not add PermissionBehavior — RBAC is handled at the API layer
/// via <c>.RequireAuthorization()</c>.
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the full DocumentService Application pipeline.
    /// </summary>
    public static IServiceCollection AddDocumentApplicationServices(
        this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);
        return services;
    }
}
