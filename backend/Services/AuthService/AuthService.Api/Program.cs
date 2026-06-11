using AuthService.Api;
using AuthService.Application;
using AuthService.Application.Common.Interfaces;
using AuthService.Infrastructure;
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
// Serilog Bootstrap Logger
// ═══════════════════════════════════════════════════════════════
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Bind HostOptions from config (allows env HostOptions__BackgroundServiceExceptionBehavior=Ignore
    // to keep host alive when a BackgroundService throws — dev-loop only).
    builder.Services.Configure<HostOptions>(builder.Configuration.GetSection("HostOptions"));

    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .WriteTo.Console()
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Service", "AuthService"));

    // Infrastructure (EF Core, Firebase, Repos, Services)
    builder.Services.AddAuthInfrastructure(builder.Configuration);

    // Application services: MediatR + JT-pattern pipeline + SEC-012 PermissionBehavior
    builder.Services.AddAuthApplicationServices();

    // OpenAPI / Scalar
    builder.Services.AddOpenApi();

    // Hangfire
    var connStr = builder.Configuration.GetConnectionString("DefaultConnection");
    builder.Services.AddHangfire(config => config
        .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connStr)));
    builder.Services.AddHangfireServer();

    // SEC-002: CORS — restrict to known origins only. Never AllowAnyOrigin() on a financial API.
    builder.Services.AddCors(options =>
        options.AddDefaultPolicy(p =>
            p.WithOrigins(
                    builder.Configuration["AllowedOrigins:AdminPanel"] ?? "https://admin.snapaccount.in",
                    builder.Configuration["AllowedOrigins:Mobile"] ?? "https://snapaccount.in")
             .AllowAnyMethod()
             .AllowAnyHeader()
             .AllowCredentials()));

    // SEC-011: Rate limiting
    builder.Services.AddRateLimiter(options =>
    {
        // OTP endpoints: 5 req / 10 min per client IP (sliding window)
        options.AddSlidingWindowLimiter("otp", opt =>
        {
            opt.PermitLimit = 5;
            opt.Window = TimeSpan.FromMinutes(10);
            opt.SegmentsPerWindow = 2;
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        // Password reset: 5 req/10 min per IP (mirrors OTP rate to prevent abuse)
        options.AddSlidingWindowLimiter("password-reset", opt =>
        {
            opt.PermitLimit = 5;
            opt.Window = TimeSpan.FromMinutes(10);
            opt.SegmentsPerWindow = 2;
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        // M1-R-INFO-001: Public invite-token lookup — fixed window 20 req/min per IP.
        // Prevents token enumeration on the public GET /auth/invite/{token} endpoint.
        options.AddFixedWindowLimiter("invite-token-lookup", opt =>
        {
            opt.PermitLimit = 20;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    });

    // Health Checks
    builder.Services.AddHealthChecks();

    // Authentication + Authorization
    // FirebaseAuthMiddleware sets HttpContext.User directly, but RequireAuthorization() still needs
    // a registered IAuthenticationService scheme — see AddSnapAuthentication for the full rationale.
    builder.Services.AddSnapAuthentication();

    // CustomExceptionHandler: maps ValidationException/NotFoundException/ForbiddenAccessException → ProblemDetails
    builder.Services.AddExceptionHandler<CustomExceptionHandler>();
    builder.Services.AddProblemDetails();

    var app = builder.Build();

    // Middleware pipeline
    app.UseSerilogRequestLogging();
    app.UseCors();
    app.UseRateLimiter(); // SEC-011
    // Firebase JWT validation
    app.UseMiddleware<FirebaseAuthMiddleware>();
    app.UseAuthorization();
    app.UseExceptionHandler();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    // Hangfire dashboard — restricted to SUPER_ADMIN role, not exposed in production without VPN
    app.UseHangfireDashboard("/hangfire", new DashboardOptions
    {
        Authorization = [new HangfireRoleAuthorizationFilter("SUPER_ADMIN")]
    });

    // Health check (Cloud Run health check endpoint)
    app.MapHealthChecks("/healthz");

    // Auto-discover and register all EndpointGroupBase subclasses in this assembly
    app.MapEndpoints(Assembly.GetExecutingAssembly());

    // GAP-005: Fail-fast in non-Development when SESSION_JWT_SECRET is absent.
    // A missing secret would cause the service to silently accept tokens signed with the
    // well-known repo default key (auth bypass risk). Dev is intentionally unaffected.
    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    // RV-02 (SEC-AI-02): Fail-fast in non-Development when InternalApi:SharedToken is absent.
    // Without this secret, AiService's AiProviderResolver cannot authenticate its service-to-service
    // call to /auth/config/ai/effective and silently degrades to MockAiProvider in production.
    // Dev is intentionally unaffected (local env has no Secret Manager binding).
    if (!string.Equals(app.Environment.EnvironmentName, "Development", StringComparison.OrdinalIgnoreCase))
    {
        var internalToken = app.Configuration["InternalApi:SharedToken"];
        if (string.IsNullOrWhiteSpace(internalToken) || internalToken.Length < 32)
        {
            throw new InvalidOperationException(
                "InternalApi:SharedToken is not configured or is shorter than 32 characters. " +
                "In non-Development environments this secret MUST be set (e.g. via GCP Secret Manager) " +
                "to enable authenticated service-to-service communication between AiService and AuthService. " +
                "Without it, AiService silently degrades to the mock AI provider in production.");
        }
    }

    // LOCAL_AUTH: idempotently seed a dev admin (admin@snapaccount.local) for local login.
    var localAuthEnabled =
        string.Equals(app.Configuration["LOCAL_AUTH"], "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Environment.GetEnvironmentVariable("LOCAL_AUTH"), "true", StringComparison.OrdinalIgnoreCase);
    if (localAuthEnabled)
    {
        using var seedScope = app.Services.CreateScope();
        var localAuth = seedScope.ServiceProvider.GetService<ILocalAuthService>();
        if (localAuth is not null)
        {
            try { localAuth.EnsureDevAdminAsync(CancellationToken.None).GetAwaiter().GetResult(); }
            catch (Exception seedEx) { Log.Warning(seedEx, "LOCAL_AUTH dev-admin seed failed."); }
        }
    }

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "AuthService failed to start.");
}
finally
{
    Log.CloseAndFlush();
}
