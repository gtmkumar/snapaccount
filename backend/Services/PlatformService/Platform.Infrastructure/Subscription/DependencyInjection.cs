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

        // DG-SUB-01: Scoped factory that lazily reads RazorpayConfig from DB each request.
        // Resolution order:
        //   1. If RazorpayConfig row exists AND IsEnabled=true → RazorpayHttpClient (live/test Razorpay).
        //   2. Otherwise → MockRazorpayClient (safe no-op fallback for dev, disabled, or unconfigured).
        //
        // This means an admin can activate Razorpay by calling PATCH /subscriptions/config/razorpay
        // with IsEnabled=true and valid credentials; the new client is picked up on the next request
        // without a redeploy.
        //
        // In Development: MockRazorpayClient is always used (no DB read) to avoid
        // requiring ENCRYPTION_KEY in local dev.
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development",
            StringComparison.OrdinalIgnoreCase);

        if (isDevelopment)
        {
            // Development: mock is always active; log a warning so it is observable.
            System.Console.Error.WriteLine(
                "[WARN] SubscriptionService: MockRazorpayClient active (Development). " +
                "No real payments will be processed. Configure live Razorpay credentials via admin settings.");
            services.AddScoped<IRazorpayClient, MockRazorpayClient>();
        }
        else
        {
            // Non-Development: resolve lazily from DB.
            // When no config row exists or IsEnabled=false → MockRazorpayClient (safe no-op).
            // When IsEnabled=true → decrypt key secret and return RazorpayHttpClient.
            services.AddScoped<IRazorpayClient>(sp =>
            {
                var db          = sp.GetRequiredService<ISubscriptionServiceDbContext>();
                var encryption  = sp.GetRequiredService<ICredentialEncryptionService>();
                var factory     = sp.GetRequiredService<IHttpClientFactory>();
                // Use typed loggers resolved from ILoggerFactory extension method (LoggerFactoryExtensions)
                var logFactory  = sp.GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>();
                var logger      = Microsoft.Extensions.Logging.LoggerFactoryExtensions
                                    .CreateLogger<RazorpayHttpClient>(logFactory);
                var mockLogger  = Microsoft.Extensions.Logging.LoggerFactoryExtensions
                                    .CreateLogger<MockRazorpayClient>(logFactory);

                // Synchronous read — scoped factory; EF InMemory / Postgres both support sync reads.
                // We intentionally avoid async here to keep DI factory signatures simple.
                var config = db.RazorpayConfigs
                    .AsQueryable()
                    .Where(c => c.DeletedAt == null)
                    .OrderByDescending(c => c.UpdatedAt)
                    .FirstOrDefault();

                if (config is not { IsEnabled: true })
                {
                    System.Console.Error.WriteLine(
                        "[WARN] SubscriptionService: Razorpay not configured or disabled. " +
                        "Using MockRazorpayClient. Configure via PATCH /subscriptions/config/razorpay.");
                    return new MockRazorpayClient(mockLogger);
                }

                string keySecret;
                try
                {
                    keySecret = encryption.Decrypt(config.EncryptedKeySecret);
                }
                catch (Exception ex)
                {
                    System.Console.Error.WriteLine(
                        $"[ERROR] SubscriptionService: Failed to decrypt Razorpay key secret: {ex.Message}. " +
                        "Falling back to MockRazorpayClient.");
                    return new MockRazorpayClient(mockLogger);
                }

                var options = new RazorpayClientOptions(config.KeyId, keySecret);
                return new RazorpayHttpClient(factory, options, logger);
            });
        }

        // DG-SUB-07: Subscription invoice PDF generator (QuestPDF + GCS upload).
        // Singleton: QuestPDF document generation is thread-safe; GCS client is also thread-safe.
        services.AddSingleton<ISubscriptionPdfGenerator, SubscriptionInvoicePdfGenerator>();

        // SEC-052: DPDP account deletion erasure subscriber
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
