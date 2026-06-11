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

        // GAP-034: Razorpay HTTP client factory registration
        services.AddHttpClient("Razorpay", c =>
        {
            c.BaseAddress = new Uri("https://api.razorpay.com/v1/");
            c.Timeout = TimeSpan.FromSeconds(30);
        });

        // GAP-PCI-02: MockRazorpayClient is Development-only.
        // Non-Development environments must use RazorpayHttpClient (wired when the admin
        // configures live Razorpay credentials via PATCH /subscriptions/config/razorpay,
        // handled by UpdateRazorpayConfigCommandHandler). Fail-fast in non-Dev so a
        // misconfigured staging/production deployment is caught at startup rather than
        // silently processing payments with a mock.
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development",
            StringComparison.OrdinalIgnoreCase);

        if (isDevelopment)
        {
            // Development: mock is acceptable; log a warning so it is observable.
            System.Console.Error.WriteLine(
                "[WARN] SubscriptionService: MockRazorpayClient active (Development). " +
                "No real payments will be processed. Configure live Razorpay credentials via admin settings.");
            services.AddScoped<IRazorpayClient, MockRazorpayClient>();
        }
        else
        {
            // Non-Development: fail-fast if no real Razorpay client has been wired.
            // The UpdateRazorpayConfigCommandHandler replaces this factory registration
            // with a real RazorpayHttpClient once the admin has saved live credentials.
            // Until that point, calls will throw the clear error below rather than silently
            // processing (or not processing) real payments with mock data.
            services.AddScoped<IRazorpayClient>(_ =>
                throw new InvalidOperationException(
                    "GAP-PCI-02: IRazorpayClient is not configured for non-Development environments. " +
                    "The Razorpay admin configuration (POST /subscriptions/config/razorpay) must be " +
                    "applied before processing payments. Set ASPNETCORE_ENVIRONMENT=Development to use the mock."));
        }

        // SEC-052: DPDP account deletion erasure subscriber
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
