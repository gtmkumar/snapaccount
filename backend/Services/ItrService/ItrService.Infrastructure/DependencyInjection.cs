using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using ItrService.Application.Common.Interfaces;
using ItrService.Application.Interfaces;
using ItrService.Infrastructure.Messaging;
using ItrService.Infrastructure.Persistence;
using ItrService.Infrastructure.Persistence.Repositories;
using ItrService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;
using SnapAccount.Shared.Infrastructure.Storage;

namespace ItrService.Infrastructure;

/// <summary>
/// Registers all ItrService infrastructure dependencies.
/// JT-pattern: interceptors wired into DbContext, <see cref="IItrDbContext"/> exposed for query handlers.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all ItrService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddItrInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // ── EF Core ────────────────────────────────────────────────────────────
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        services.AddDbContext<ItrServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "itr"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IItrDbContext>(sp => sp.GetRequiredService<ItrServiceDbContext>());

        // ── Firebase Admin SDK ────────────────────────────────────────────────
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

        // ── Repositories ──────────────────────────────────────────────────────
        services.AddScoped<ITaxComputationRepository, TaxComputationRepository>();

        // ── SEC-041: server-side PAN encryption ──────────────────────────────
        services.AddSingleton<ItrService.Application.Common.Interfaces.IPanEncryptionService,
            AesPanEncryptionService>();

        // ── Auth / CurrentUser ────────────────────────────────────────────────
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        // ── GCP Services ──────────────────────────────────────────────────────
        services.AddSingleton<ICloudStorageService, GoogleCloudStorageService>();
        services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();

        // ── Recurring job handlers (scoped — instantiated per Pub/Sub message) ─
        services.AddScoped<IItrDeadlineReminderHandler, ItrDeadlineReminderHandler>();
        services.AddScoped<IItrRefundPollingHandler, ItrRefundPollingHandler>();

        // ── Pub/Sub background subscriber ─────────────────────────────────────
        services.AddHostedService<ItrRecurringJobsSubscriber>();

        // SEC-040: DPDP Act 2023 Right-to-Erasure cascade
        services.AddHostedService<AccountDeletionSubscriber>();

        return services;
    }
}
