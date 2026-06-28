using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using QuestPDF.Infrastructure;
using ReportService.Application;
using ReportService.Application.Common.Interfaces;
using ReportService.Infrastructure.Persistence;
using ReportService.Infrastructure.Reports;
using ReportService.Infrastructure.Services;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

namespace ReportService.Infrastructure;

/// <summary>
/// Registers all ReportService infrastructure dependencies.
/// Phase 6C: QuestPDF generators, GCS storage, full MediatR pipeline.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all ReportService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddReportInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // QuestPDF Community License (MIT-compatible, free for commercial use)
        QuestPDF.Settings.License = LicenseType.Community;

        // NEW-D17: register the bundled Latin + Indic fonts so Hindi/Bengali PDF text
        // renders with real glyphs instead of tofu. Fonts are placed at /app/fonts at
        // Docker build time; idempotent and no-throw when the directory is absent.
        QuestPdfFontConfig.RegisterBundledFonts(configuration["QuestPdf:FontsPath"]);

        // Application layer (MediatR pipeline, validators, PermissionBehavior)
        services.AddReportApplicationServices();

        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // DG-SEC-01: RLS session-var interceptor for report.* tenant isolation
        services.AddScoped<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>();

        services.AddDbContext<ReportServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            // DG-SEC-01: RLS connection interceptor
            options.AddInterceptors(sp.GetRequiredService<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "report"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IReportServiceDbContext>(sp => sp.GetRequiredService<ReportServiceDbContext>());

        // Firebase Admin SDK
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration) && FirebaseApp.DefaultInstance == null)
        {
            var credentialJson = configuration["Firebase:ServiceAccountJson"];
#pragma warning disable CS0618
            var credential = string.IsNullOrEmpty(credentialJson)
                ? GoogleCredential.GetApplicationDefault()
                : GoogleCredential.FromJson(credentialJson);
#pragma warning restore CS0618
            FirebaseApp.Create(new AppOptions { Credential = credential });
        }

        // GCS storage for report files
        services.AddSingleton<IReportStorageService, ReportStorageService>();

        // Register all report generators — resolved via IEnumerable<IReportGenerator> in handler
        services.AddTransient<IReportGenerator, TrialBalanceReportGenerator>();
        services.AddTransient<IReportGenerator, ProfitAndLossReportGenerator>();
        services.AddTransient<IReportGenerator, BalanceSheetReportGenerator>();
        services.AddTransient<IReportGenerator, CashFlowReportGenerator>();
        services.AddTransient<IReportGenerator, TaxLiabilityReportGenerator>();
        services.AddTransient<IReportGenerator, LedgerByAccountReportGenerator>();
        services.AddTransient<IReportGenerator, LoanPackageReportGenerator>();
        // GAP-032: Tally XML export (feature-flagged via Report:TallyExportEnabled)
        services.AddTransient<IReportGenerator, TallyExportGenerator>();
        // GAP-043: Chat thread PDF export (cross-schema read from chat.messages)
        services.AddTransient<IReportGenerator, ChatThreadPdfGenerator>();

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
