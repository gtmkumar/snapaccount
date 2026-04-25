using CallbackService.Application;
using CallbackService.Application.Common.Interfaces;
using CallbackService.Infrastructure.Messaging;
using CallbackService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;

namespace CallbackService.Infrastructure;

/// <summary>Registers all CallbackService infrastructure services.</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers EF Core DbContext, Application layer pipeline, ICurrentUser,
    /// and the SEC-027 DPDP account-deletion Pub/Sub subscriber.
    /// </summary>
    public static IServiceCollection AddCallbackInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer
        services.AddCallbackApplicationServices();

        // Database
        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        var connectionString = (configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        services.AddDbContext<CallbackDbContext>(opts =>
            opts.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "callback")));

        services.AddScoped<ICallbackDbContext>(sp =>
            sp.GetRequiredService<CallbackDbContext>());

        // ICurrentUser
        services.AddScoped<ICurrentUser, CurrentUser>();

        // SEC-027: DPDP Right-to-Erasure — subscribe to account-deletion-events topic
        services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
