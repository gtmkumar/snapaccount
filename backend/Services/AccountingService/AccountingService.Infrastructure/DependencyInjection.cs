using AccountingService.Application.Common.Interfaces;
using AccountingService.Application.Interfaces;
using AccountingService.Infrastructure.Messaging;
using AccountingService.Infrastructure.Persistence;
using AccountingService.Infrastructure.Persistence.Repositories;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

namespace AccountingService.Infrastructure;

/// <summary>
/// Registers all AccountingService infrastructure dependencies.
/// JT-pattern: interceptors wired into DbContext, <see cref="IAccountingDbContext"/>
/// exposed for query handlers.
/// Phase 6A: adds LedgerEntry, ChartOfAccount, JournalBatch, FiscalYearClose repositories
/// and <see cref="OcrResultSubscriber"/> hosted service.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all AccountingService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddAccountingInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // JT pattern: register interceptors as scoped ISaveChangesInterceptor
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // EF Core — schema isolated to 'accounting.*'
        services.AddDbContext<AccountingDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "accounting"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        // JT pattern: IAccountingDbContext → AccountingDbContext for query handlers
        services.AddScoped<IAccountingDbContext>(sp => sp.GetRequiredService<AccountingDbContext>());

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

        // Pre-existing repositories
        services.AddScoped<IJournalEntryRepository, JournalEntryRepository>();
        services.AddScoped<IAccountRepository, AccountRepository>();

        // Phase 6A repositories
        services.AddScoped<ILedgerEntryRepository, LedgerEntryRepository>();
        services.AddScoped<IJournalBatchRepository, JournalBatchRepository>();
        services.AddScoped<IFiscalYearCloseRepository, FiscalYearCloseRepository>();
        services.AddScoped<IChartOfAccountRepository, ChartOfAccountRepository>();
        services.AddScoped<ICoaTemplateRepository, CoaTemplateRepository>();

        // Phase 6A: OCR result Pub/Sub subscriber (hosted service)
        // P6-HANDOFF-09: subscribes to snapaccount.document.ocr.completed / accounting-service-ocr-sub
        services.AddHostedService<OcrResultSubscriber>();

        // Current user
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
