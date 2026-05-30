using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using LoanService.Application;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using LoanService.Infrastructure.BankAdapters;
using LoanService.Infrastructure.Messaging;
using LoanService.Infrastructure.Persistence;
using LoanService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Persistence.Interceptors;

namespace LoanService.Infrastructure;

/// <summary>
/// Registers all LoanService infrastructure dependencies.
/// JT-pattern: interceptors wired into DbContext, ILoanServiceDbContext exposed for query handlers.
/// Phase 6C: bank adapters, credential encryption, eligibility engine, DPDP subscriber.
/// </summary>
public static class DependencyInjection
{
    /// <summary>Adds all LoanService infrastructure services to the DI container.</summary>
    public static IServiceCollection AddLoanInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Application layer (MediatR pipeline, validators, PermissionBehavior)
        services.AddLoanApplicationServices();

        var connectionString = configuration.GetConnectionString("DefaultConnection") ?? configuration.GetConnectionString("snapaccount")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        // EF Core interceptors
        services.AddScoped<ISaveChangesInterceptor, AuditableEntityInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DispatchDomainEventsInterceptor>();
        services.AddSingleton(TimeProvider.System);

        // EF Core DbContext — schema isolated to loan.*
        services.AddDbContext<LoanServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "loan"));
            options.ConfigureWarnings(w =>
                w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<ILoanServiceDbContext>(sp => sp.GetRequiredService<LoanServiceDbContext>());

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

        // P6-HANDOFF-27: ICredentialEncryptionService (AES-GCM, NOT IPanEncryptionService)
        services.AddSingleton<ICredentialEncryptionService, CredentialEncryptionService>();

        // P6-HANDOFF-26: Consent HMAC key provider
        services.AddSingleton<IConsentHmacKeyProvider, ConsentHmacKeyProvider>();

        // Eligibility engine (cross-service via HTTP clients)
        services.AddScoped<IEligibilityEngine, EligibilityEngine>();
        services.AddHttpClient("GstService", client =>
        {
            var baseUrl = configuration["ServiceUrls:GstService"] ?? "http://gst-service";
            client.BaseAddress = new Uri(baseUrl);
        });
        services.AddHttpClient("AccountingService", client =>
        {
            var baseUrl = configuration["ServiceUrls:AccountingService"] ?? "http://accounting-service";
            client.BaseAddress = new Uri(baseUrl);
        });

        // P6-HANDOFF-27: Bank adapters — keyed DI
        services.AddHttpClient("SendGrid");
        services.AddHttpClient("RestBankAdapter");
        services.AddKeyedScoped<IPartnerBankAdapter, EmailPartnerBankAdapter>("email");
        services.AddKeyedScoped<IPartnerBankAdapter, RestPartnerBankAdapter>("rest");
        services.AddScoped<IPartnerBankAdapterFactory, PartnerBankAdapterFactory>();

        // GCS for loan packages (ILoanStorageService — avoids collision with Shared.Infrastructure.ICloudStorageService)
        services.AddSingleton<ILoanStorageService, GoogleCloudStorageServiceAdapter>();

        // Loan PDF generator (stub — fully implemented in ReportService.Infrastructure)
        services.AddScoped<ILoanPdfGenerator, StubLoanPdfGenerator>();

        // SEC-007: Cross-service events via Pub/Sub (ILoanEventPublisher — avoids collision with Shared.Infrastructure.IPubSubPublisher)
        services.AddSingleton<ILoanEventPublisher, GooglePubSubPublisherAdapter>();

        // SEC-027 / P6-HANDOFF-30: DPDP Right-to-Erasure
        if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(configuration)) services.AddHostedService<AccountDeletionSubscriber>();

        // Current user
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
