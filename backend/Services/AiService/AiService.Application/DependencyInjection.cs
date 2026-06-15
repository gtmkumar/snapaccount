using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;

namespace AiService.Application;

/// <summary>
/// Registers AiService Application-layer services (MediatR pipeline + FluentValidation).
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds the full MediatR + validation pipeline for AiService.</summary>
    public static IServiceCollection AddAiApplicationServices(this IServiceCollection services)
    {
        services.AddApplicationServices(typeof(DependencyInjection).Assembly);
        return services;
    }
}
