using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;
using SubscriptionService.Application;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Infrastructure.Messaging;
using SubscriptionService.Infrastructure.Persistence;
using SubscriptionService.Infrastructure.Razorpay;
using SubscriptionService.Infrastructure.Services;

namespace SubscriptionService.Infrastructure;

/// <summary>Registers all SubscriptionService infrastructure dependencies.</summary>
public static class DependencyInjection
{
    /// <summary>Adds EF Core, Application pipeline, and ICurrentUser for SubscriptionService.</summary>
    public static IServiceCollection AddSubscriptionInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer (MediatR pipeline, validators, PermissionBehavior)
        services.AddSubscriptionApplicationServices();

        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        var connectionString = (configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        services.AddDbContext<SubscriptionServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "subscription"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<ISubscriptionServiceDbContext>(sp =>
            sp.GetRequiredService<SubscriptionServiceDbContext>());

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        // GAP-034: Credential encryption for Razorpay config storage.
        services.AddSingleton<ICredentialEncryptionService, AesCredentialEncryptionService>();

        // GAP-034: Razorpay client — mock (no-op) until admin configures live credentials.
        // The production RazorpayHttpClient is registered lazily by the UpdateRazorpayConfig
        // handler (or at startup if a config row exists).
        services.AddHttpClient("Razorpay", c =>
        {
            c.BaseAddress = new Uri("https://api.razorpay.com/v1/");
            c.Timeout = TimeSpan.FromSeconds(30);
        });
        services.AddScoped<IRazorpayClient, MockRazorpayClient>();

        // SEC-052: DPDP account deletion erasure subscriber
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
