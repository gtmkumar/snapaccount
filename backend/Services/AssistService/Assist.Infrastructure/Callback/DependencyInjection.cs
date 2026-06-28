using CallbackService.Application;
using CallbackService.Application.Common.Interfaces;
using CallbackService.Application.Internal.Commands.RefreshKpiMv;
using CallbackService.Infrastructure.Internal;
using CallbackService.Infrastructure.Messaging;
using CallbackService.Infrastructure.Persistence;
using CallbackService.Infrastructure.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

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
        var connectionString = (configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        // DG-SEC-01: RLS session-var interceptor for callback.* tenant isolation
        services.AddScoped<RlsSessionInterceptor>();

        services.AddDbContext<CallbackDbContext>((sp, opts) =>
        {
            // DG-SEC-01: RLS connection interceptor
            opts.AddInterceptors(sp.GetRequiredService<RlsSessionInterceptor>());
            opts.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "callback"));
        });

        services.AddScoped<ICallbackDbContext>(sp =>
            sp.GetRequiredService<CallbackDbContext>());

        // ICurrentUser
        services.AddScoped<ICurrentUser, CurrentUser>();

        // SEC-027: DPDP Right-to-Erasure — subscribe to account-deletion-events topic
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        // DG-INFRA-04: Pub/Sub consumer for Cloud Scheduler recurring jobs
        //   (CALLBACK_KPI_MV_REFRESH, GST_PRE_DEADLINE_CALLBACK).
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<CallbackRecurringJobsSubscriber>();

        // DG-INFRA-04: MediatR handler for RefreshKpiMvCommand lives in Infrastructure
        //   (needs CallbackDbContext.Database for ExecuteSqlRawAsync). Register explicitly
        //   because AddApplicationServices only scans the Application assembly.
        services.AddScoped<IRequestHandler<RefreshKpiMvCommand, Result>, RefreshKpiMvCommandHandler>();

        // DG-NOTIF-01: publish CB_SCHEDULED notification when a callback is confirmed.
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration))
        {
            services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();
            services.AddScoped<ICallbackEventPublisher, CallbackEventPublisher>();
        }

        return services;
    }
}
