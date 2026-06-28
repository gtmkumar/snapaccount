using AiService.Application;
using AiService.Application.Common.Interfaces;
using AiService.Infrastructure.Messaging;
using AiService.Infrastructure.Persistence;
using AiService.Infrastructure.Providers;
using AiService.Infrastructure.Services;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Pgvector.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

namespace AiService.Infrastructure;

/// <summary>
/// Registers all AiService infrastructure dependencies:
/// <list type="bullet">
///   <item>EF Core DbContext (ai schema)</item>
///   <item>MockAiProvider (default, GCP-free) + AiProviderResolver</item>
///   <item>MockSarvamAiService (default) — activated to real when Sarvam API key is present</item>
///   <item>TextRedactor (SEC-AI-01)</item>
///   <item>RagIngestionSubscriber (GCP-only: Pub/Sub hosted service)</item>
///   <item>MediatR pipeline via AddAiApplicationServices</item>
/// </list>
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all AiService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddAiInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer (MediatR pipeline, validators, pipeline behaviors).
        services.AddAiApplicationServices();

        var dbPassword = configuration["DB_PASSWORD"] ?? "postgresql";
        var connectionString = (configuration.GetConnectionString("DefaultConnection")
            ?? configuration.GetConnectionString("snapaccount")
            ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
            .Replace("#{DB_PASSWORD}#", dbPassword);

        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // DG-SEC-01: RLS session-var interceptor for ai.* tenant isolation
        services.AddScoped<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>();

        // EF Core — schema isolated to 'ai.*'
        // DG-CHAT-01: UseVector() enables Npgsql pgvector type support so that
        // Pgvector.Vector properties are correctly read/written as PostgreSQL vector columns.
        services.AddDbContext<AiServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            // DG-SEC-01: RLS connection interceptor
            options.AddInterceptors(sp.GetRequiredService<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql =>
                {
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", "ai");
                    // DG-CHAT-01: Register pgvector type at the Npgsql data-source level.
                    npgsql.UseVector();
                });
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IAiServiceDbContext>(sp => sp.GetRequiredService<AiServiceDbContext>());

        // Firebase Admin SDK (if GCP is enabled).
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)
            && FirebaseApp.DefaultInstance == null)
        {
            var credentialJson = configuration["Firebase:ServiceAccountJson"];
#pragma warning disable CS0618
            var credential = string.IsNullOrEmpty(credentialJson)
                ? GoogleCredential.GetApplicationDefault()
                : GoogleCredential.FromJson(credentialJson);
#pragma warning restore CS0618
            FirebaseApp.Create(new AppOptions { Credential = credential });
        }

        // SEC-AI-01: PII redactor — always registered (singleton, stateless).
        services.AddSingleton<ITextRedactor, TextRedactor>();

        // SEC-AI-02 H-03: Atomic token budget enforcement via PostgreSQL advisory locks.
        services.AddScoped<ITokenBudgetService, TokenBudgetService>();

        // MockAiProvider — default, GCP-free. Registered as singleton so the resolver
        // can hold a reference to it without allocating a new instance per request.
        services.AddSingleton<MockAiProvider>();

        // AiProviderResolver — reads admin AI config from AuthService, falls back to mock.
        // Typed HttpClient for AuthService config + Gemini/Vertex API calls.
        services.AddHttpClient<IAiProviderResolver, AiProviderResolver>();

        // Sarvam AI: mock by default. Real SarvamAiService activated when API key present.
        // P7b: wire real SarvamAiService here using configuration["Sarvam:ApiKey"].
        services.AddSingleton<ISarvamAiService, MockSarvamAiService>();

        // Current user — reads Firebase JWT claims from HttpContext.Items.
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        // RAG ingestion subscriber — only in GCP mode (Pub/Sub not available locally).
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration))
        {
            services.AddHostedService<RagIngestionSubscriber>();
        }

        return services;
    }
}
