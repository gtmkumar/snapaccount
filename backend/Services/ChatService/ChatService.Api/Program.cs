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

Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Bind HostOptions from config (allows env HostOptions__BackgroundServiceExceptionBehavior=Ignore
    // to keep host alive when a BackgroundService throws — dev-loop only).
    builder.Services.Configure<HostOptions>(builder.Configuration.GetSection("HostOptions"));

    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .WriteTo.Console()
        .Enrich.WithProperty("Service", "ChatService"));

    builder.Services.AddChatInfrastructure(builder.Configuration);

    // Hangfire — persistent job storage in PostgreSQL (chat schema)
    var connStr = builder.Configuration.GetConnectionString("DefaultConnection");
    builder.Services.AddHangfire(config => config
        .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connStr)));
    builder.Services.AddHangfireServer();

    builder.Services.AddOpenApi();
    builder.Services.AddHealthChecks();

    // SEC-002: Restrict CORS to known origins + allow credentials for SignalR
    builder.Services.AddCors(options =>
        options.AddDefaultPolicy(p =>
            p.WithOrigins(
                    builder.Configuration["AllowedOrigins:AdminPanel"] ?? "https://admin.snapaccount.in",
                    builder.Configuration["AllowedOrigins:Mobile"] ?? "https://snapaccount.in")
             .AllowAnyMethod()
             .AllowAnyHeader()
             .AllowCredentials()));

    // Passthrough auth scheme + authorization (FirebaseAuthMiddleware sets the principal; this
    // makes RequireAuthorization() return a clean 401 instead of a 500 on unauthenticated calls).
    builder.Services.AddSnapAuthentication();
    builder.Services.AddHttpContextAccessor();

    // SEC-011: Standard rate limiting for authenticated endpoints
    // SEC-053: Stricter rate limiting for chat message send endpoint (60 msg/min/user)
    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        // SEC-053: chat-send-strict — 60 messages/min per user
        options.AddFixedWindowLimiter("chat-send-strict", opt =>
        {
            opt.PermitLimit = 60;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    });

    // SEC-004: Initialize Firebase Admin SDK using ADC
    if (SnapAccount.Shared.Infrastructure.Gcp.GcpStartup.IsEnabled(builder.Configuration) && FirebaseApp.DefaultInstance == null)
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

    // SEC-004: Firebase JWT validation middleware
    app.UseMiddleware<FirebaseAuthMiddleware>();
    app.UseAuthorization();
    app.UseExceptionHandler();

    app.MapHealthChecks("/healthz");

    // Auto-discover and register all EndpointGroupBase subclasses in this assembly
    app.MapEndpoints(Assembly.GetExecutingAssembly());

    // SignalR hub: /hubs/chat — requires authentication (handled by [Authorize] on ChatHub)
    app.MapHub<ChatHub>("/hubs/chat")
        .RequireAuthorization();

    // Warm up routing rule cache at startup
    var routingEngine = app.Services.GetRequiredService<RoutingRuleEngine>();
    await routingEngine.RefreshAsync();

    // Wave 7A addendum: Hangfire recurring job for slot generation from availability rules.
    // Registered via ApplicationStarted so JobStorage.Current is fully initialised.
    // (Static RecurringJob.AddOrUpdate() at build time throws InvalidOperationException.)
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();
        // Every Sunday at 01:00 IST = Saturday at 19:30 UTC
        recurringJobs.AddOrUpdate<GenerateSlotsFromRulesJob>(
            recurringJobId: "generate-slots-from-rules-weekly",
            methodCall: job => job.RunAsync(),
            cronExpression: "30 19 * * 6", // Saturday 19:30 UTC = Sunday 01:00 IST
            options: new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        Log.Information("ChatService: Hangfire recurring job 'generate-slots-from-rules-weekly' registered.");
    });

    // GAP-005: Fail-fast in non-Development when SESSION_JWT_SECRET is absent.
    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "ChatService failed to start."); }
finally { Log.CloseAndFlush(); }
