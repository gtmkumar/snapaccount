using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Infrastructure.Messaging;
using AuthService.Infrastructure.Persistence;
using AuthService.Infrastructure.Repositories;
using AuthService.Infrastructure.Services;
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

namespace AuthService.Infrastructure;

/// <summary>
/// Registers all AuthService infrastructure dependencies.
/// Called from <c>AuthService.Api/Program.cs</c> via <c>builder.Services.AddAuthInfrastructure(...)</c>.
///
/// Key JT-pattern wiring here:
/// <list type="bullet">
///   <item><see cref="AuditableEntityInterceptor"/> and <see cref="DispatchDomainEventsInterceptor"/>
///         are registered as scoped <c>ISaveChangesInterceptor</c> and injected into the DbContext.</item>
///   <item><see cref="IAuthDbContext"/> is registered as <c>AuthDbContext</c> for query handler injection.</item>
///   <item>Repository interfaces remain for write-side aggregate operations.</item>
/// </list>
/// </summary>
public static class DependencyInjection
{
    /// <summary>
    /// Adds all AuthService infrastructure services to the DI container.
    /// </summary>
    public static IServiceCollection AddAuthInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // SEC-018: DB password via user-secrets / env var DB_PASSWORD — never in appsettings.json
        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // JT pattern: register interceptors as scoped ISaveChangesInterceptor
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();

        // Singleton TimeProvider — interceptor uses this for UTC timestamps
        services.AddSingleton(TimeProvider.System);

        // EF Core — schema isolated to 'auth.*'
        // Interceptors are resolved from DI and injected into the context options
        services.AddDbContext<AuthDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "auth"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        // JT pattern: IAuthDbContext → AuthDbContext for query handlers to project directly
        services.AddScoped<IAuthDbContext>(sp => sp.GetRequiredService<AuthDbContext>());

        // Firebase Admin SDK initialisation (singleton — shared process-wide)
        // DEV_AUTH_BYPASS skips Firebase init entirely (canned tokens accepted by middleware).
        var devBypass = string.Equals(configuration["DEV_AUTH_BYPASS"], "true", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS"), "true", StringComparison.OrdinalIgnoreCase);
        if (!devBypass && FirebaseApp.DefaultInstance == null)
        {
            var credentialJson = configuration["Firebase:ServiceAccountJson"];
#pragma warning disable CS0618 // GoogleCredential.FromJson is deprecated in favour of CredentialFactory but we retain it here until Firebase Admin SDK ships a clean replacement
            GoogleCredential credential = string.IsNullOrEmpty(credentialJson)
                ? GoogleCredential.GetApplicationDefault()
                : GoogleCredential.FromJson(credentialJson);
#pragma warning restore CS0618
            FirebaseApp.Create(new AppOptions { Credential = credential });
        }

        // Repositories — write-side aggregate access (SEC-016: serializable transactions where noted)
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IOrganizationRepository, OrganizationRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();

        // MSG91 OTP SMS sender — used by OtpService to deliver the OTP.
        services.AddHttpClient("Msg91Otp");
        services.AddScoped<IOtpSmsSender, Msg91OtpSmsSender>();

        // Domain services
        services.AddScoped<IOtpService, OtpService>();
        services.AddScoped<IFirebaseAuthService, FirebaseAuthService>();

        // SEC-013: PAN encryption service — AES-256 key from GCP Secret Manager
        services.AddSingleton<IPanEncryptionService, AesPanEncryptionService>();

        // SEC-007: Pub/Sub publisher for cross-service domain event propagation
        services.AddSingleton<IPubSubPublisher, GooglePubSubPublisher>();
        services.AddScoped<IEventPublisher, PubSubEventPublisher>();

        // Current user — reads Firebase JWT claims from HttpContext.Items (SEC-022)
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
