using AiService.Infrastructure.Persistence;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

namespace AiService.Infrastructure;

/// <summary>
/// Registers all AiService infrastructure dependencies including EF Core (pgvector),
/// Semantic Kernel setup, Vertex AI / Gemini client, Sarvam AI client, and Google Document AI.
/// JT-pattern: interceptors wired into DbContext.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all AiService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddAiInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // EF Core — schema isolated to 'ai.*'
        // TODO Phase 2: add Pgvector NuGet package and call npgsql.UseVector() for HNSW RAG embeddings
        services.AddDbContext<AiServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "ai"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

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

        // TODO Phase 2: Register Semantic Kernel kernel, Vertex AI plugin, Sarvam AI client,
        // RAG pipeline (chunker, embedder, pgvector store), and IDocumentAiRepository

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
