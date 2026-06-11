using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.RateLimiting;
using NotificationService.Infrastructure;
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Infrastructure.Auth;
using System.Reflection;
using System.Text.Json.Serialization;
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
        .Enrich.WithProperty("Service", "NotificationService"));

    builder.Services.AddNotificationInfrastructure(builder.Configuration);

    // BUG-W7-01: Register JsonStringEnumConverter globally so that PascalCase string enum values
    // (e.g. {"channel":"Push"}) are correctly deserialized from request bodies and serialized to
    // responses. The UpperSnakeEnumConverter in EF config only affects DB persistence — it has no
    // effect on ASP.NET Core minimal-API JSON binding.
    builder.Services.ConfigureHttpJsonOptions(opts =>
        opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

    builder.Services.AddOpenApi();
    builder.Services.AddHealthChecks();

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
    builder.Services.AddHttpContextAccessor();

    // SEC-011: Standard rate limiting for authenticated endpoints
    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
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

    // CustomExceptionHandler: maps ValidationException/NotFoundException/ForbiddenAccessException → ProblemDetails
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

    // GAP-005: Fail-fast in non-Development when SESSION_JWT_SECRET is absent.
    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "NotificationService failed to start."); }
finally { Log.CloseAndFlush(); }
