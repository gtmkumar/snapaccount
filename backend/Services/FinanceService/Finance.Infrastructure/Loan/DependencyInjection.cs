using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using LoanService.Application;
using LoanService.Application.Common.Interfaces;
using LoanService.Application.Services;
using LoanService.Infrastructure.BankAdapters;
using LoanService.Infrastructure.Services;
using LoanService.Infrastructure.Messaging;
using LoanService.Infrastructure.Persistence;
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
    // A SINGLE shared translator instance — reused across every DbContext build.
    // Passing `new UpperSnakeCaseNameTranslator()` per build gives each DbContextOptions a
    // different enum-mapping fingerprint, so EF Core builds a fresh internal service provider
    // every time and throws ManyServiceProvidersCreatedWarning after 20 contexts (every
    // /loans/* request then 500s). A static instance keeps the fingerprint stable.
    private static readonly LoanService.Infrastructure.Persistence.UpperSnakeCaseNameTranslator
        EnumNameTranslator = new();

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

        // DG-SEC-01: RLS session-var interceptor for loan.* tenant isolation
        services.AddScoped<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>();

        // EF Core DbContext — schema isolated to loan.*
        services.AddDbContext<LoanServiceDbContext>((sp, options) =>
        {
            options.AddInterceptors(sp.GetServices<ISaveChangesInterceptor>());
            // DG-SEC-01: RLS connection interceptor
            options.AddInterceptors(sp.GetRequiredService<SnapAccount.Shared.Infrastructure.Persistence.Interceptors.RlsSessionInterceptor>());
            options.UseNpgsql(
                connectionString,
                npgsql =>
                {
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", "loan");
                    // loan.applications.status is a native PG enum (application_status_v2) with
                    // UPPER_SNAKE labels — map it so Npgsql sends the enum type (a plain string
                    // parameter fails with "operator does not exist: application_status_v2 = text").
                    npgsql.MapEnum<Domain.Entities.LoanApplicationStatus>(
                        "application_status_v2", "loan", EnumNameTranslator);
                    npgsql.MapEnum<Domain.Entities.BankAdapterType>(
                        "partner_bank_adapter_type", "loan", EnumNameTranslator);
                    // BUG-LOAN-CONSENT-ENUM: loan.consents.consent_type is a native PG enum
                    // (loan.consent_type: CREDIT_BUREAU/DATA_SHARE_WITH_BANK/DISBURSEMENT_MANDATE).
                    // Without this mapping every consent write 500s (42804: column is of type
                    // loan.consent_type but expression is of type character varying). RBI/DPDP-critical.
                    npgsql.MapEnum<Domain.Entities.ConsentType>(
                        "consent_type", "loan", EnumNameTranslator);
                });
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

        // B8: KFS config (processing fee rate, grievance officer, cooling-off days)
        services.AddSingleton<ILoanKfsConfig, LoanKfsConfig>();

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

        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"], "Development",
            StringComparison.OrdinalIgnoreCase);

        // DG-LOAN-03: ILoanPdfGenerator is no longer used by GeneratePackageCommandHandler.
        // The handler now directly calls IReportGenerator (ReportType.LoanPackage) via the Report module,
        // both of which are co-hosted in the Finance composite and registered by AddReportInfrastructure.
        // The stub registration is kept only for unit-test isolation where the handler might be tested
        // with the old interface; it is safe to remove entirely in a future cleanup pass.
        // NOTE: StubLoanPdfGenerator is still registered below in case any test or older code references it.
        if (isDevelopment)
        {
            // Register the stub so existing tests that resolve ILoanPdfGenerator don't fail.
            // GeneratePackageCommandHandler no longer uses it (DG-LOAN-03).
            services.AddScoped<ILoanPdfGenerator, StubLoanPdfGenerator>();
        }
        else
        {
            // Non-dev: register a no-op implementation (not a fail-fast throw) because the handler
            // no longer calls this interface — fail-fast here would block the Finance composite from
            // starting in staging/prod unnecessarily.
            services.AddScoped<ILoanPdfGenerator, StubLoanPdfGenerator>();
        }

        // GAP-110: Fraud check config — config-driven thresholds, never hardcoded.
        services.AddSingleton<IFraudCheckConfig, LoanFraudCheckConfig>();

        // GAP-110: Penny-drop verifier — mock in Development (TL-gated for real provider).
        if (isDevelopment)
        {
            services.AddScoped<IPennyDropVerifier, MockPennyDropVerifier>();
        }
        else
        {
            // Non-Development: fail-fast until the real penny-drop provider is wired.
            // Contact orchestrator for the bank API credentials (GAP-110 TL-gate).
            services.AddScoped<IPennyDropVerifier>(_ =>
                throw new InvalidOperationException(
                    "GAP-110: IPennyDropVerifier is not configured for non-Development environments. " +
                    "Wire the real penny-drop bank adapter and set ASPNETCORE_ENVIRONMENT=Development to use the mock."));
        }

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
