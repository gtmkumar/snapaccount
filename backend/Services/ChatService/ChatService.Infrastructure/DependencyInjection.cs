using ChatService.Application;
using ChatService.Application.Common.Interfaces;
using ChatService.Infrastructure.Messaging;
using ChatService.Infrastructure.Persistence;
using ChatService.Infrastructure.Services;
using ChatService.Infrastructure.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;
using StackExchange.Redis;

namespace ChatService.Infrastructure;

/// <summary>Registers all ChatService infrastructure dependencies.</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Adds EF Core, SignalR (with Redis backplane), routing engine, presence service,
    /// and the Application layer MediatR pipeline.
    /// </summary>
    public static IServiceCollection AddChatInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer (MediatR pipeline, validators, PermissionBehavior)
        services.AddChatApplicationServices();

        // Database
        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        var connectionString = (configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        services.AddDbContext<ChatServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "chat"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IChatServiceDbContext>(sp => sp.GetRequiredService<ChatServiceDbContext>());

        // ICurrentUser
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        // Redis — SignalR backplane + presence + distributed cache (rate limiting)
        var redisConnectionString = configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";

        services.AddSingleton<IConnectionMultiplexer>(sp =>
            ConnectionMultiplexer.Connect(redisConnectionString));

        // SEC-053: IDistributedCache backed by Redis for SignalR hub rate checks
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = redisConnectionString;
            options.InstanceName = "chat:";
        });

        // SignalR with Redis backplane
        services.AddSignalR()
            .AddStackExchangeRedis(redisConnectionString);

        // Application-layer abstractions backed by infrastructure
        services.AddScoped<IChatHubNotifier, ChatHubNotifier>();

        // Routing rule engine (singleton — cached rules, refreshed on startup)
        services.AddSingleton<RoutingRuleEngine>();
        services.AddSingleton<IRoutingRuleEngine>(sp => sp.GetRequiredService<RoutingRuleEngine>());

        // Presence service
        services.AddSingleton<PresenceService>();

        // DPDP: account deletion erasure subscriber
        services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
