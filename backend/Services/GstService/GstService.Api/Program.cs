using GstService.Application;
using GstService.Infrastructure;
using GstService.Infrastructure.Jobs;
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
        .Enrich.WithProperty("Service", "GstService"));

    // Infrastructure (EF Core, repositories, calculation service, Firebase)
    builder.Services.AddGstInfrastructure(builder.Configuration);

    // MediatR + JT-pattern pipeline (UnhandledException → Logging → Validation → Performance)
    builder.Services.AddGstApplicationServices();

    builder.Services.AddOpenApi();

    // Hangfire — persistent job storage in PostgreSQL (same DB, separate hangfire schema)
    var connStr = builder.Configuration.GetConnectionString("DefaultConnection");
    builder.Services.AddHangfire(config => config
        .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connStr)));
    builder.Services.AddHangfireServer();

    // IMS deemed-acceptance job (transient — resolved per job invocation via Hangfire DI)
    builder.Services.AddTransient<ImsDeemedAcceptanceJob>();

    // SEC-002: Restrict CORS to known origins
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

    // Rate limiting: 100 req/min standard; 30 req/min for IRP/EWB cost-sensitive endpoints (SEC-043)
    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });
        // SEC-043: stricter policy for e-invoice + notice creation to limit IRP API cost and spam
        options.AddFixedWindowLimiter("gst-write-strict", opt =>
        {
            opt.PermitLimit = 30;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    });

    builder.Services.AddHealthChecks();

    // CustomExceptionHandler: maps ValidationException/NotFoundException/ForbiddenAccessException → ProblemDetails
    builder.Services.AddExceptionHandler<CustomExceptionHandler>();
    builder.Services.AddProblemDetails();

    var app = builder.Build();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    app.UseSerilogRequestLogging();
    app.UseCors();
    app.UseRateLimiter();
    app.UseMiddleware<FirebaseAuthMiddleware>(); // SEC-004: Firebase JWT validation
    app.UseAuthorization();
    app.UseExceptionHandler();

    app.MapHealthChecks("/healthz");

    // Auto-discover and register all EndpointGroupBase subclasses in this assembly
    app.MapEndpoints(Assembly.GetExecutingAssembly());

    // Hangfire recurring jobs — registered via ApplicationStarted callback so that
    // JobStorage.Current is guaranteed to be initialized (the HangfireServer hosted service
    // starts before ApplicationStarted fires). Using the static RecurringJob.AddOrUpdate()
    // at builder time throws InvalidOperationException: Current JobStorage instance has not
    // been initialized yet. (BUG-IMS-GSTSTART-001)
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        // IMS Deemed Acceptance: 14th of every month at 02:00 IST (20:30 UTC on 13th).
        // GSTN GSTR-2B is generated on the 14th; any PENDING invoice is deemed ACCEPTED.
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();
        recurringJobs.AddOrUpdate<ImsDeemedAcceptanceJob>(
            recurringJobId: "ims-deemed-acceptance-monthly",
            methodCall: job => job.RunAsync(),
            cronExpression: "30 20 13 * *", // 13th at 20:30 UTC = 14th at 02:00 IST
            options: new RecurringJobOptions
            {
                TimeZone = TimeZoneInfo.Utc
            });
        Log.Information("GstService: Hangfire recurring job 'ims-deemed-acceptance-monthly' registered.");
    });

    // GAP-005: Fail-fast in non-Development when SESSION_JWT_SECRET is absent.
    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "GstService failed to start."); }
finally { Log.CloseAndFlush(); }
