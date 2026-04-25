using System.Reflection;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application.Behaviors;

namespace SnapAccount.Shared.Application;

/// <summary>
/// Extension methods for registering MediatR pipeline behaviors shared by all
/// SnapAccount microservices. Each service calls this from its own Program.cs,
/// passing its Application assembly so that commands, queries, and validators
/// are discovered automatically.
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers MediatR with the full JT-pattern pipeline for the given
    /// <paramref name="applicationAssembly"/>:
    /// <list type="number">
    ///   <item>UnhandledExceptionBehavior — catch + log, rethrow</item>
    ///   <item>LoggingBehavior — structured request/response logging</item>
    ///   <item>ValidationBehavior — FluentValidation, returns Result.Failure instead of throwing</item>
    ///   <item>PerformanceBehavior — warns on handlers &gt; 500 ms</item>
    /// </list>
    /// The <c>PermissionBehavior</c> is registered per-service (it depends on
    /// per-service types) and must be added after calling this method.
    /// </summary>
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services,
        Assembly applicationAssembly)
    {
        // FluentValidation — discover validators from the service's Application assembly
        services.AddValidatorsFromAssembly(applicationAssembly);

        // MediatR with pipeline behaviors in JT-prescribed order
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(applicationAssembly);

            // 1. Catch unhandled exceptions before they escape — log + rethrow
            cfg.AddOpenBehavior(typeof(UnhandledExceptionBehavior<,>));

            // 2. Structured request logging (request name, UserId)
            cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));

            // 3. FluentValidation — returns Result.Failure, never throws across boundaries
            cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));

            // 4. Performance monitoring — warn when handler > 500 ms
            cfg.AddOpenBehavior(typeof(PerformanceBehavior<,>));

            // NOTE: PermissionBehavior (SEC-012 RBAC) is registered after this call
            // in each service's Program.cs because it reads per-service permission sets.
        });

        return services;
    }
}
