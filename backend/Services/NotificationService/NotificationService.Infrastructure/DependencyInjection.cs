using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NotificationService.Application;
using NotificationService.Application.Interfaces;
using NotificationService.Infrastructure.Adapters;
using NotificationService.Infrastructure.Messaging;
using NotificationService.Infrastructure.Persistence;
using NotificationService.Infrastructure.Seeding;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;

namespace NotificationService.Infrastructure;

/// <summary>Registers all NotificationService infrastructure services.</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers EF Core, channel adapters (FCM/MSG91/SendGrid), hosted services,
    /// and the Application layer MediatR pipeline.
    /// </summary>
    public static IServiceCollection AddNotificationInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer (MediatR pipeline, validators)
        services.AddNotificationApplicationServices();

        // Database
        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        var connectionString = (configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        services.AddDbContext<NotificationServiceDbContext>(opts =>
            opts.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "notification")));

        services.AddScoped<INotificationDbContext>(sp =>
            sp.GetRequiredService<NotificationServiceDbContext>());

        // ICurrentUser — reads Firebase claims from HttpContext
        services.AddScoped<ICurrentUser, CurrentUser>();

        // SEC-031: Redis-backed IDistributedCache for cross-pod recurring-job dedupe.
        var redisConnectionString = configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = redisConnectionString;
            options.InstanceName = "notification:";
        });

        // HTTP clients for channel adapters
        services.AddHttpClient("FCM");
        services.AddHttpClient("MSG91");
        services.AddHttpClient("SendGrid");

        // Channel adapters (Push / SMS / Email)
        services.AddScoped<IChannelAdapter, FcmPushAdapter>();
        services.AddScoped<IChannelAdapter, Msg91SmsAdapter>();
        services.AddScoped<IChannelAdapter, SendGridEmailAdapter>();

        // Hosted services
        services.AddHostedService<RecurringJobsSubscriber>();
        services.AddHostedService<NotificationSeeder>();

        // SEC-027: DPDP Right-to-Erasure — subscribe to account-deletion-events topic
        services.AddHostedService<AccountDeletionSubscriber>();

        // P6-HANDOFF-34: Loan disbursement event notifications
        services.AddHostedService<LoanEventsSubscriber>();

        return services;
    }
}
