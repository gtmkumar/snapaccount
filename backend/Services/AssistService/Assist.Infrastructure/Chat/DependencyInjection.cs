using ChatService.Application;
using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Common.Interfaces;
using ChatService.Infrastructure.EventHandlers;
using ChatService.Infrastructure.Jobs;
using ChatService.Infrastructure.Messaging;
using ChatService.Infrastructure.Persistence;
using ChatService.Infrastructure.Services;
using ChatService.Infrastructure.SignalR;
using Hangfire;
using IMeetingLinkProvider = ChatService.Application.Common.Interfaces.IMeetingLinkProvider;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;
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

        // DG-SEC-01: RLS session-var interceptor for chat.* tenant isolation
        services.AddScoped<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>();

        services.AddDbContext<ChatServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            // DG-SEC-01: RLS connection interceptor
            options.AddInterceptors(sp.GetRequiredService<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>());
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
        // BUG-W7-IOS-001 (backend part): In local dev when ASPNETCORE_ENVIRONMENT=Development
        // and Redis is unavailable, SignalR still works in-process (single-node) without a backplane.
        // The Redis backplane is only essential in multi-replica Cloud Run deployments.
        var redisConnectionString = configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"] ?? configuration["DOTNET_ENVIRONMENT"] ?? "Production",
            "Development",
            StringComparison.OrdinalIgnoreCase);

        IConnectionMultiplexer? redisMultiplexer = null;
        try
        {
            var opts = ConfigurationOptions.Parse(redisConnectionString);
            opts.ConnectTimeout = 2000;
            opts.AbortOnConnectFail = false;
            redisMultiplexer = ConnectionMultiplexer.Connect(opts);
        }
        catch when (isDevelopment)
        {
            // Swallow in dev — in-process SignalR works fine without a backplane.
        }

        if (redisMultiplexer is not null)
        {
            services.AddSingleton<IConnectionMultiplexer>(redisMultiplexer);

            // SEC-053: IDistributedCache backed by Redis for SignalR hub rate checks
            services.AddStackExchangeRedisCache(options =>
            {
                options.Configuration = redisConnectionString;
                options.InstanceName = "chat:";
            });

            // SignalR with Redis backplane (multi-replica production mode)
            services.AddSignalR()
                .AddStackExchangeRedis(redisConnectionString);
        }
        else
        {
            // Dev fallback — in-memory cache + in-process SignalR (single node only).
            // PresenceService is registered but wraps every Redis call in try/catch so
            // it silently degrades when Redis is unavailable (see PresenceService.cs).
            services.AddDistributedMemoryCache();
            services.AddSignalR();
            // Register a lazy-connect multiplexer (AbortOnConnectFail=false) so
            // PresenceService can resolve without crashing at startup.
            services.AddSingleton<IConnectionMultiplexer>(sp =>
            {
                var opts = ConfigurationOptions.Parse(redisConnectionString);
                opts.AbortOnConnectFail = false;
                opts.ConnectTimeout = 1000;
                // Connect returns a multiplexer even when Redis is down (reports IsConnected=false).
                return ConnectionMultiplexer.Connect(opts);
            });
        }

        // DG-INFRA-06: custom SignalR metrics (UpDownCounter + Counter) — registered as singleton
        // so the same Meter/instrument is shared across the connection lifetime.
        // Register BEFORE ChatHub and ChatHubNotifier (both take SignalRMetrics as a ctor parameter).
        services.AddSingleton<ChatService.Infrastructure.SignalR.SignalRMetrics>();

        // Application-layer abstractions backed by infrastructure
        services.AddScoped<IChatHubNotifier, ChatHubNotifier>();

        // Routing rule engine (singleton — cached rules, refreshed on startup)
        services.AddSingleton<RoutingRuleEngine>();
        services.AddSingleton<IRoutingRuleEngine>(sp => sp.GetRequiredService<RoutingRuleEngine>());

        // Presence service
        services.AddSingleton<PresenceService>();

        // Wave 7A addendum: Slot generation service (used by Hangfire job + on-demand command)
        services.AddScoped<ISlotGenerationService, SlotGenerationService>();
        services.AddTransient<GenerateSlotsFromRulesJob>();

        // DG-CHAT-02: Auto-complete job for CONFIRMED appointments past slot end.
        services.AddTransient<AutoCompleteAppointmentsJob>();

        // DG-CHAT-03: Appointment reminder + cancellation notification jobs.
        services.AddTransient<SendAppointmentReminderJob>();
        services.AddTransient<SendAppointmentCancellationJob>();

        // DG-CHAT-03: MediatR notification handlers for appointment domain events.
        // These schedule Hangfire jobs and must be registered here (Infrastructure)
        // because they depend on IBackgroundJobClient (not available in Application layer).
        services.AddScoped<MediatR.INotificationHandler<ChatService.Domain.Events.AppointmentBookedEvent>, AppointmentBookedEventHandler>();
        services.AddScoped<MediatR.INotificationHandler<ChatService.Domain.Events.AppointmentCancelledByCaEvent>, AppointmentCancelledByCaEventHandler>();

        // GAP-031: Meeting link provider — MockMeetingLinkProvider by default (house: mock-first).
        // Set MeetingLink:Provider=GoogleCalendar in config + provision credentials for real Meet links.
        var meetingLinkProvider = configuration["MeetingLink:Provider"] ?? "Mock";
        if (meetingLinkProvider.Equals("GoogleCalendar", StringComparison.OrdinalIgnoreCase))
            services.AddTransient<IMeetingLinkProvider, GoogleCalendarMeetingLinkProvider>();
        else
            services.AddTransient<IMeetingLinkProvider, MockMeetingLinkProvider>();

        // DPDP: account deletion erasure subscriber
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        // DG-NOTIF-01: publish chat new-message events so offline participants
        // receive Push/InApp notifications via PlatformService's ChatEventsSubscriber.
        // Only register when GCP is available; the null-fallback in SendMessageCommandHandler
        // skips publishing safely in local dev / tests without credentials.
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration))
        {
            services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();
            services.AddScoped<IChatEventPublisher, ChatEventPublisher>();
        }

        return services;
    }
}
