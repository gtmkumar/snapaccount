using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using DocumentService.Application.Interfaces;
using DocumentService.Infrastructure.Messaging;
using DocumentService.Infrastructure.Persistence;
using DocumentService.Infrastructure.Persistence.Repositories;
using DocumentService.Infrastructure.Services;
using DocumentService.Infrastructure.SignalR;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Messaging;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure;

/// <summary>
/// Registers all DocumentService infrastructure dependencies.
/// JT-pattern: <see cref="AuditableEntityInterceptor"/> and
/// <see cref="DispatchDomainEventsInterceptor"/> are wired into the DbContext,
/// and <see cref="IDocumentDbContext"/> is exposed for query-handler injection.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all DocumentService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddDocumentInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // JT pattern: register interceptors as scoped ISaveChangesInterceptor
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // DG-SEC-01: RLS session-var interceptor — sets app.current_user_id on every connection open
        // so RLS policies on document.* tables actually fire (previously only auth.* was covered).
        services.AddScoped<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>();

        // EF Core — schema isolated to 'document.*'
        services.AddDbContext<DocumentDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            // DG-SEC-01: RLS connection interceptor (must be added AFTER ISaveChangesInterceptors)
            options.AddInterceptors(sp.GetRequiredService<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "document"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        // JT pattern: IDocumentDbContext → DocumentDbContext for query handlers
        services.AddScoped<IDocumentDbContext>(sp => sp.GetRequiredService<DocumentDbContext>());

        // Firebase Admin SDK (singleton — may already be initialised in dev monolith mode)
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

        // Repository — command handlers depend on IDocumentRepository
        services.AddScoped<IDocumentRepository, DocumentRepository>();

        // Storage + OCR + Pub/Sub: real GCP services in staging/prod, local dev fallbacks
        // otherwise so the upload + scan flow works without Google Application Default Creds.
        var gcpEnabled = SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration);
        services.AddScoped<IDocumentStorageService, DocumentStorageService>();

        if (gcpEnabled)
        {
            // GCS storage (singleton — thread-safe, expensive to create)
            services.AddSingleton<ICloudStorageService, GoogleCloudStorageService>();

            // Google Document AI — OCR
            services.AddScoped<IOcrService, GoogleDocumentAiService>();

            // Pub/Sub publisher (shared infra) + OCR job enqueuer
            services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();
            services.AddScoped<IOcrJobEnqueuer, PubSubOcrJobEnqueuer>();

            // OCR worker — subscribes to snapaccount.document.ocr.requested
            services.AddHostedService<OcrJobSubscriber>();

            // GAP-113: monthly partition maintenance for document.document (Finance-owned).
            services.AddScoped<IPartitionMaintenanceHandler, DocumentPartitionMaintenanceHandler>();
            services.AddHostedService(sp => new PartitionMaintenanceSubscriber(
                sp,
                sp.GetRequiredService<IConfiguration>(),
                sp.GetRequiredService<ILogger<PartitionMaintenanceSubscriber>>(),
                defaultSubscriptionId: "finance-partition-maintenance-sub"));

            // DG-SEC-03 / SEC-027: DPDP Right-to-Erasure — subscribe to account-deletion-events
            // Nulls user_id and clears original_file_name PII on account deletion.
            services.AddHostedService<AccountDeletionSubscriber>();
        }
        else
        {
            // ── Local dev (GCP-free) ── NEVER reached in staging/production ──
            services.AddSingleton<ICloudStorageService, LocalFileStorageService>();
            services.AddSingleton<IPubSubPublisher, NoOpPubSubPublisher>();
            // Real, free, offline extraction via the local Tesseract CLI (default provider).
            services.AddScoped<Services.Ocr.TesseractOcrService>();
            services.AddScoped<IOcrService>(sp => sp.GetRequiredService<Services.Ocr.TesseractOcrService>());
            // Resolver picks the provider (Tesseract default; Gemini/etc. when configured + keyed)
            // from the platform AI config in AuthService. Typed HttpClient for the config + Gemini calls.
            services.AddHttpClient<Application.Documents.Interfaces.IOcrServiceResolver, Services.Ocr.OcrServiceResolver>();
            // Reports metered AI usage to the central ledger in AuthService (best-effort).
            services.AddHttpClient<Application.Documents.Interfaces.IAiUsageReporter, Services.Ocr.HttpAiUsageReporter>();
            // Runs OCR inline and persists structured fields (replaces the old stub enqueuer).
            services.AddScoped<IOcrJobEnqueuer, Services.Ocr.InlineOcrJobEnqueuer>();
        }

        // Cross-service event publisher (approve → accounting pipeline)
        services.AddScoped<IDocumentEventPublisher, DocumentEventPublisher>();

        // DG-DOC-07: SignalR hub notifier — broadcasts document status changes to connected mobile clients.
        // IHubContext<DocumentHub> is registered automatically by AddSignalR() in Finance.WebApi/Program.cs.
        // DocumentHubNotifier wraps it so Application-layer handlers can depend on IDocumentHubNotifier.
        services.AddScoped<IDocumentHubNotifier, DocumentHubNotifier>();

        // Current user — reads Firebase JWT claims from HttpContext.Items
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
