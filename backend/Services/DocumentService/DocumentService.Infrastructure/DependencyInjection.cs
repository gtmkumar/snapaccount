using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Interfaces;
using DocumentService.Application.Interfaces;
using DocumentService.Infrastructure.Messaging;
using DocumentService.Infrastructure.Persistence;
using DocumentService.Infrastructure.Persistence.Repositories;
using DocumentService.Infrastructure.Services;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // JT pattern: register interceptors as scoped ISaveChangesInterceptor
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // EF Core — schema isolated to 'document.*'
        services.AddDbContext<DocumentDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "document"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        // JT pattern: IDocumentDbContext → DocumentDbContext for query handlers
        services.AddScoped<IDocumentDbContext>(sp => sp.GetRequiredService<DocumentDbContext>());

        // Firebase Admin SDK (singleton — may already be initialised in dev monolith mode)
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

        // Repository — command handlers depend on IDocumentRepository
        services.AddScoped<IDocumentRepository, DocumentRepository>();

        // GCS storage (singleton — thread-safe, expensive to create)
        services.AddSingleton<ICloudStorageService, GoogleCloudStorageService>();
        services.AddScoped<IDocumentStorageService, DocumentStorageService>();

        // Google Document AI — OCR
        services.AddScoped<IOcrService, GoogleDocumentAiService>();

        // Pub/Sub publisher (shared infra) + OCR job enqueuer
        services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();
        services.AddScoped<IOcrJobEnqueuer, PubSubOcrJobEnqueuer>();

        // OCR worker — subscribes to snapaccount.document.ocr.requested
        services.AddHostedService<OcrJobSubscriber>();

        // Current user — reads Firebase JWT claims from HttpContext.Items
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
