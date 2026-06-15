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
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Infrastructure.Auth;
using System.Reflection;
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

    // ── Hangfire (Chat module only — single server for this composite host) ──
    var dbPassword = builder.Configuration["DB_PASSWORD"] ?? "postgresql";
    var hangfireConnStr = (builder.Configuration.GetConnectionString("DefaultConnection")
        ?? builder.Configuration.GetConnectionString("snapaccount")
        ?? "Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=#{DB_PASSWORD}#")
        .Replace("#{DB_PASSWORD}#", dbPassword);
    builder.Services.AddHangfire(config => config
        .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(hangfireConnStr)));
    builder.Services.AddHangfireServer();

    builder.Services.AddOpenApi();
    builder.Services.AddHealthChecks();

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

    // Chat Hangfire recurring job — register after ApplicationStarted (JobStorage must be ready).
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();
        recurringJobs.AddOrUpdate<GenerateSlotsFromRulesJob>(
            recurringJobId: "generate-slots-from-rules-weekly",
            methodCall: job => job.RunAsync(),
            cronExpression: "30 19 * * 6",
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        Log.Information("AssistService: Hangfire recurring job 'generate-slots-from-rules-weekly' registered.");
    });

    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    // RV-02 (SEC-AI-02): Ai module fail-fast when InternalApi:SharedToken missing in non-Development.
    if (!string.Equals(app.Environment.EnvironmentName, "Development", StringComparison.OrdinalIgnoreCase))
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
catch (Exception ex) { Log.Fatal(ex, "AssistService failed to start."); }
finally { Log.CloseAndFlush(); }
