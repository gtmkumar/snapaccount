using AccountingService.Application;
using AccountingService.Infrastructure;
using DocumentService.Application;
using DocumentService.Infrastructure;
using DocumentService.Infrastructure.SignalR;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using GstService.Application;
using GstService.Infrastructure;
using GstService.Infrastructure.Jobs;
using Hangfire;
using Hangfire.PostgreSql;
using ItrService.Application;
using ItrService.Infrastructure;
using LoanService.Infrastructure;
using LoanService.Infrastructure.Webhooks;
using Microsoft.AspNetCore.RateLimiting;
using ReportService.Infrastructure;
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Infrastructure.Auth;
using SnapAccount.Shared.Infrastructure.Resilience;
using System.Reflection;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

// ═══════════════════════════════════════════════════════════════
// FinanceService.Api — Phase 3 modular monolith composite host
// Merges: Document + Accounting + GST + Loan + ITR + Report
// ═══════════════════════════════════════════════════════════════

Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Integration tests run under the "Testing" environment with no GCP credentials.
    // Force GCP-dependent startup infrastructure off (Pub/Sub subscribers, seeders,
    // DPDP erasure jobs) exactly like local Development, so the composite host boots
    // without external dependencies. GcpStartup.IsEnabled honours DISABLE_GCP first.
    if (builder.Environment.IsEnvironment("Testing"))
    {
        builder.Configuration["DISABLE_GCP"] = "true";
        // Deterministic all-zero 256-bit AES key so PAN encrypt/decrypt works in integration
        // tests without provisioning a real key. Only ever applied under the Testing environment
        // (never deployed); production still requires the real PanEncryption:Key.
        builder.Configuration["PanEncryption:Key"] ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    }

    builder.Services.Configure<HostOptions>(builder.Configuration.GetSection("HostOptions"));

    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .WriteTo.Console()
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Service", "FinanceService"));

    builder.Services.AddDocumentInfrastructure(builder.Configuration);
    builder.Services.AddDocumentApplicationServices();
    builder.Services.AddAccountingApplicationServices();
    builder.Services.AddAccountingInfrastructure(builder.Configuration);
    builder.Services.AddGstInfrastructure(builder.Configuration);
    builder.Services.AddGstApplicationServices();
    builder.Services.AddLoanInfrastructure(builder.Configuration);
    builder.Services.AddScoped<DisbursementWebhookHandler>();
    builder.Services.AddItrInfrastructure(builder.Configuration);
    builder.Services.AddItrApplicationServices();
    builder.Services.AddReportInfrastructure(builder.Configuration);

    var dbPassword = builder.Configuration["DB_PASSWORD"] ?? "postgresql";
    var hangfireConnStr = (builder.Configuration.GetConnectionString("DefaultConnection")
        ?? builder.Configuration.GetConnectionString("snapaccount")
        ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
        .Replace("#{DB_PASSWORD}#", dbPassword);
    builder.Services.AddHangfire(config => config
        .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(hangfireConnStr)));
    // Skip the Hangfire background processing server under integration tests: each test
    // boots its own host, and a polling server per host accumulates threads/connections
    // and pegs a core. Tests only need the Hangfire client (job enqueue) registered above.
    if (!builder.Environment.IsEnvironment("Testing"))
    {
        builder.Services.AddHangfireServer();
    }
    builder.Services.AddTransient<ImsDeemedAcceptanceJob>();

    builder.Services.ConfigureHttpJsonOptions(opts =>
        opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

    builder.Services.AddOpenApi();
    builder.Services.AddHealthChecks();
    builder.Services.AddDefaultResponseCompression();

    // Output caching for org-agnostic master data (see Shared.Api.OutputCachingExtensions
    // for the safety model). One tag per dataset; admin writes evict their tag.
    builder.Services.AddMasterDataOutputCache(
        "gst-tax-rates",
        "loan-products",
        "itr-config",
        "hsn-sac");

    builder.Services.AddCors(options =>
        options.AddDefaultPolicy(p =>
            p.WithOrigins(
                    builder.Configuration["AllowedOrigins:AdminPanel"] ?? "https://admin.snapaccount.in",
                    builder.Configuration["AllowedOrigins:Mobile"] ?? "https://snapaccount.in")
             .AllowAnyMethod()
             .AllowAnyHeader()
             .AllowCredentials()));

    builder.Services.AddSnapAuthentication();
    builder.Services.AddHttpContextAccessor();

    // Cascade containment: per-dependency circuit breaker + timeout + concurrency cap
    // on every outbound HttpClient (GSTN/IRP/EWB, OCR/Gemini, bank adapters, SendGrid, …)
    // and on SDK dependencies (Firebase verify, Pub/Sub, GCS) via IExternalCallGuard.
    builder.Services.AddExternalDependencyResilience(builder.Configuration);

    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddFixedWindowLimiter("ai", opt =>
        {
            opt.PermitLimit = 20;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddFixedWindowLimiter("gst-write-strict", opt =>
        {
            opt.PermitLimit = 30;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    });

    if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(builder.Configuration)
        && FirebaseApp.DefaultInstance == null)
    {
        var credentialJson = builder.Configuration["Firebase:ServiceAccountJson"];
        var credential = string.IsNullOrEmpty(credentialJson)
            ? GoogleCredential.GetApplicationDefault()
            : GoogleCredential.FromJson(credentialJson);
        FirebaseApp.Create(new AppOptions { Credential = credential });
    }

    // DG-DOC-07: SignalR for real-time document status push (DocumentHub at /hubs/documents).
    // In production (GCP + Redis) add a Redis backplane via:
    //   .AddStackExchangeRedis(redisConnStr)
    // For local dev the in-memory backplane is sufficient.
    builder.Services.AddSignalR();

    builder.Services.AddExceptionHandler<CustomExceptionHandler>();
    builder.Services.AddProblemDetails();

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    // First in the pipeline so it wraps every response body (gzip/brotli, negotiated via
    // Accept-Encoding). Configured in ServiceDefaults.AddDefaultResponseCompression.
    app.UseResponseCompression();

    app.UseSerilogRequestLogging();
    app.UseCors();
    app.UseRateLimiter();
    app.UseMiddleware<FirebaseAuthMiddleware>();
    app.UseAuthorization();
    // AFTER auth on purpose: a cache hit still requires a valid token + endpoint
    // authorization — only the rendered body of opted-in master-data endpoints is shared.
    app.UseOutputCache();
    app.UseExceptionHandler();

    app.MapHealthChecks("/healthz");

    app.MapEndpoints(Assembly.GetExecutingAssembly());

    // DG-DOC-07: Document status change hub for real-time mobile push.
    app.MapHub<DocumentHub>("/hubs/documents")
        .RequireAuthorization();

    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();
        recurringJobs.AddOrUpdate<ImsDeemedAcceptanceJob>(
            recurringJobId: "ims-deemed-acceptance-monthly",
            methodCall: job => job.RunAsync(),
            cronExpression: "30 20 13 * *",
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        Log.Information("FinanceService: Hangfire recurring job 'ims-deemed-acceptance-monthly' registered.");
    });

    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    app.Run();
}
// Do NOT swallow the host-capture exceptions: WebApplicationFactory (integration
// tests) throws StopTheHostException and `dotnet ef` throws HostAbortedException
// from inside the host-build path to grab the built host. A broad catch here breaks
// both. Let those propagate; only log genuine startup failures.
catch (Exception ex) when (ex.GetType().Name is not "StopTheHostException" and not "HostAbortedException")
{
    Log.Fatal(ex, "FinanceService failed to start.");
}
finally { Log.CloseAndFlush(); }
