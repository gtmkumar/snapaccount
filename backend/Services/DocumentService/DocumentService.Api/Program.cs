using DocumentService.Application;
using DocumentService.Infrastructure;
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
        .Enrich.WithProperty("Service", "DocumentService"));

    // Infrastructure (EF Core, repositories, GCS, Document AI, Firebase)
    builder.Services.AddDocumentInfrastructure(builder.Configuration);

    // MediatR + JT-pattern pipeline (UnhandledException → Logging → Validation → Performance)
    builder.Services.AddDocumentApplicationServices();

    // OpenAPI
    builder.Services.AddOpenApi();

    // SEC-002: Restrict CORS to known origins — never AllowAnyOrigin() on a financial API
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

    // Rate limiting: 100 req/min for standard endpoints; 20 req/min for OCR (AI cost guardrail)
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

    // GAP-005: Fail-fast in non-Development when SESSION_JWT_SECRET is absent.
    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "DocumentService failed to start."); }
finally { Log.CloseAndFlush(); }
