using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NotificationService.Application;
using NotificationService.Application.Interfaces;
using NotificationService.Infrastructure.Adapters;
using NotificationService.Infrastructure.Messaging;
using NotificationService.Infrastructure.Persistence;
using NotificationService.Infrastructure.Seeding;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;

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
        var connectionString = (configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
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

        // HTTP client for WhatsApp Business Cloud API (GAP-045)
        services.AddHttpClient("WhatsApp");

        // Channel adapters (Push / SMS / Email / WhatsApp / InApp)
        services.AddScoped<IChannelAdapter, FcmPushAdapter>();
        services.AddScoped<IChannelAdapter, Msg91SmsAdapter>();
        services.AddScoped<IChannelAdapter, SendGridEmailAdapter>();
        // GAP-045: WhatsApp adapter — registered unconditionally; the adapter itself
        // checks WhatsApp:Enabled at dispatch time and returns WHATSAPP_DISABLED when off.
        // This matches Decision #2: "full implementation, flagged off by default."
        services.AddScoped<IChannelAdapter, WhatsAppBusinessAdapter>();
        // DG-NOTIF-02: InApp adapter writes rows to notification.notification so the
        // message-center inbox is populated.  Previously null → silently suppressed.
        services.AddScoped<IChannelAdapter, InAppChannelAdapter>();

        // Hosted services
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<RecurringJobsSubscriber>();

        // DG-NOTIF-01: module-event → notification fan-out subscribers
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration))
        {
            services.AddHostedService<GstDeadlineEventsSubscriber>();
            services.AddHostedService<ItrDeadlineEventsSubscriber>();
            services.AddHostedService<DocumentEventsSubscriber>();
            services.AddHostedService<DocumentLifecycleEventsSubscriber>();
            services.AddHostedService<ChatEventsSubscriber>();
            services.AddHostedService<CallbackEventsSubscriber>();
        }

        // GAP-113: monthly partition maintenance for notification.notification (Platform-owned).
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration))
        {
            services.AddScoped<IPartitionMaintenanceHandler, NotificationPartitionMaintenanceHandler>();
            services.AddHostedService(sp => new PartitionMaintenanceSubscriber(
                sp,
                sp.GetRequiredService<IConfiguration>(),
                sp.GetRequiredService<ILogger<PartitionMaintenanceSubscriber>>(),
                defaultSubscriptionId: "platform-partition-maintenance-sub"));
        }
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<NotificationSeeder>();

        // SEC-027: DPDP Right-to-Erasure — subscribe to account-deletion-events topic
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        // P6-HANDOFF-34: Loan disbursement event notifications
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<LoanEventsSubscriber>();

        return services;
    }
}
