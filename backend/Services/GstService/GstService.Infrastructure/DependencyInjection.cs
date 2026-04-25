using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Infrastructure.ExternalClients;
using GstService.Infrastructure.Messaging;
using GstService.Infrastructure.Persistence;
using GstService.Infrastructure.Persistence.Repositories;
using GstService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;
using SnapAccount.Shared.Infrastructure.Storage;

namespace GstService.Infrastructure;

/// <summary>
/// Registers all GstService infrastructure dependencies.
/// JT-pattern: interceptors wired into DbContext, <see cref="IGstDbContext"/>
/// exposed for query handlers.
/// Phase 6B: wires GSTN/IRP/EWB adapter selection based on GST_PRODUCTION_APIS_ENABLED env var.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all GstService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddGstInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // JT pattern: interceptors
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // EF Core — schema isolated to 'gst.*'
        services.AddDbContext<GstDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "gst"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IGstDbContext>(sp => sp.GetRequiredService<GstDbContext>());

        // Firebase Admin SDK
        if (FirebaseApp.DefaultInstance == null)
        {
            var credentialJson = configuration["Firebase:ServiceAccountJson"];
#pragma warning disable CS0618
            var credential = string.IsNullOrEmpty(credentialJson)
                ? GoogleCredential.GetApplicationDefault()
                : GoogleCredential.FromJson(credentialJson);
#pragma warning restore CS0618
            FirebaseApp.Create(new AppOptions { Credential = credential });
        }

        // Command-side repositories
        services.AddScoped<IGstReturnRepository, GstReturnRepository>();
        services.AddScoped<IItcMismatchReadRepository, ItcMismatchReadRepository>();
        services.AddScoped<IGstCalculationService, GstCalculationService>();

        // Phase 6B: GSTN/IRP/EWB adapter selection — config-driven, never hardcoded
        var productionApisEnabled = string.Equals(
            configuration["GST_PRODUCTION_APIS_ENABLED"], "true",
            StringComparison.OrdinalIgnoreCase);

        if (productionApisEnabled)
        {
            // Production adapters: real GSTN/IRP/EWB APIs with retry + token redaction
            services.AddHttpClient<IGstnApiClient, ProductionGstnApiClient>();
            services.AddHttpClient<IIrpClient, ProductionIrpClient>();
            services.AddHttpClient<IEwbClient, ProductionEwbClient>();
        }
        else
        {
            // Mock adapters: deterministic, safe for dev/test — default
            services.AddSingleton<IGstnApiClient, MockGstnApiClient>();
            services.AddSingleton<IIrpClient, MockIrpClient>();
            services.AddSingleton<IEwbClient, MockEwbClient>();
        }

        // GCS for notice attachments
        services.AddSingleton<ICloudStorageService, GoogleCloudStorageService>();

        // SEC-007: Cross-service events via Pub/Sub
        services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();

        // Phase 6B: Recurring job subscriber for deadline reminders
        services.AddScoped<IGstDeadlineCheckHandler, GstDeadlineCheckHandler>();
        services.AddHostedService<GstRecurringJobsSubscriber>();

        // SEC-040: DPDP Act 2023 Right-to-Erasure cascade
        services.AddHostedService<AccountDeletionSubscriber>();

        // Current user
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
