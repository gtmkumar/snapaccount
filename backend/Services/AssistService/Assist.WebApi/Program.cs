using AiService.Infrastructure;
using CallbackService.Infrastructure;
using ChatService.Infrastructure;
using ChatService.Infrastructure.Jobs;
using ChatService.Infrastructure.Services;
using ChatService.Infrastructure.SignalR;
using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.RateLimiting;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Infrastructure.Auth;
using System.Reflection;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

// ═══════════════════════════════════════════════════════════════
// AssistService.Api — Phase 1 modular monolith composite host
// Merges: ChatService + AiService + CallbackService (Assist domain)
// Business logic unchanged — lives in each module's Application/Infrastructure libs.
// Old standalone Api hosts (5107/5111/5112) remain for parallel cutover testing.
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
        .Enrich.WithProperty("Service", "AssistService"));

    // ── Module infrastructure (MediatR, EF Core, hosted services) ──────────
    builder.Services.AddChatInfrastructure(builder.Configuration);
    builder.Services.AddAiInfrastructure(builder.Configuration);
    builder.Services.AddCallbackInfrastructure(builder.Configuration);

    // ── DG-INFRA-06: OpenTelemetry metrics + tracing pipeline ────────────
    // Adds the SnapAccount.Chat meter so signalr.connections.active and
    // signalr.fanout.failures flow through the OTLP exporter (→ Cloud Monitoring).
    // Export to OTLP when the endpoint is configured (Cloud Run injects OTEL_EXPORTER_OTLP_ENDPOINT).
    var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
    var useOtlpExporter = !string.IsNullOrWhiteSpace(otlpEndpoint);

    builder.Services.AddOpenTelemetry()
        .WithMetrics(metrics =>
        {
            metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation()
                // DG-INFRA-06: custom SignalR / Chat meter (signalr.connections.active + signalr.fanout.failures)
                .AddMeter(SignalRMetrics.MeterName);

            if (useOtlpExporter)
                metrics.AddOtlpExporter();
        })
        .WithTracing(tracing =>
        {
            tracing
                .AddSource(builder.Environment.ApplicationName)
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation();

            if (useOtlpExporter)
                tracing.AddOtlpExporter();
        });

    // ── Hangfire (Chat module only — single server for this composite host) ──
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

    builder.Services.AddOpenApi();
    builder.Services.AddHealthChecks();
    builder.Services.AddDefaultResponseCompression();

    // BUG-ASSIST-NO-ENUM-CONVERTER: match Platform/Finance so enum fields serialize as
    // string names (not ints) across Chat/AI/Callback endpoints — consistent API contract.
    builder.Services.ConfigureHttpJsonOptions(opts =>
        opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

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

    // Rate limits: union of Chat + AI + Callback policies (register each name once).
    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddFixedWindowLimiter("chat-send-strict", opt =>
        {
            opt.PermitLimit = 60;
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

    app.UseCors();
    app.UseRateLimiter();
    app.UseMiddleware<FirebaseAuthMiddleware>();
    app.UseAuthorization();
    app.UseExceptionHandler();

    app.MapHealthChecks("/healthz");

    // Route groups from all three module Api assemblies — prefixes unchanged (/chat, /ai, /callbacks).
    app.MapEndpoints(Assembly.GetExecutingAssembly());

    app.MapHub<ChatHub>("/hubs/chat")
        .RequireAuthorization();

    // Chat routing rule cache warmup (from ChatService.Api/Program.cs).
    var routingEngine = app.Services.GetRequiredService<RoutingRuleEngine>();
    await routingEngine.RefreshAsync();

    // Chat Hangfire recurring jobs — register after ApplicationStarted (JobStorage must be ready).
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();

        // Wave 7A addendum: Weekly slot generation (every Sunday at 01:00 IST = Saturday 19:30 UTC).
        recurringJobs.AddOrUpdate<GenerateSlotsFromRulesJob>(
            recurringJobId: "generate-slots-from-rules-weekly",
            methodCall: job => job.RunAsync(),
            cronExpression: "30 19 * * 6",
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        Log.Information("AssistService: Hangfire recurring job 'generate-slots-from-rules-weekly' registered.");

        // DG-CHAT-02: Auto-complete CONFIRMED appointments past their slot end (every 5 minutes).
        recurringJobs.AddOrUpdate<AutoCompleteAppointmentsJob>(
            recurringJobId: "auto-complete-appointments",
            methodCall: job => job.RunAsync(),
            cronExpression: "*/5 * * * *",
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        Log.Information("AssistService: Hangfire recurring job 'auto-complete-appointments' registered.");
    });

    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    // RV-02 (SEC-AI-02): Ai module fail-fast when InternalApi:SharedToken missing in non-Development.
    // Development and Testing (xUnit integration env) are non-deployed and exempt.
    if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    {
        var internalToken = app.Configuration["InternalApi:SharedToken"];
        if (string.IsNullOrWhiteSpace(internalToken) || internalToken.Length < 32)
        {
            throw new InvalidOperationException(
                "InternalApi:SharedToken is not configured or is shorter than 32 characters. " +
                "Required for AiService authenticated calls to AuthService in non-Development environments.");
        }
    }

    app.Run();
}
// Do NOT swallow the host-capture exceptions: WebApplicationFactory (integration
// tests) throws StopTheHostException and `dotnet ef` throws HostAbortedException
// from inside the host-build path to grab the built host. A broad catch here breaks
// both. Let those propagate; only log genuine startup failures.
catch (Exception ex) when (ex.GetType().Name is not "StopTheHostException" and not "HostAbortedException")
{
    Log.Fatal(ex, "AssistService failed to start.");
}
finally { Log.CloseAndFlush(); }
