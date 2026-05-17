using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.RateLimiting;
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Infrastructure.Auth;
using SubscriptionService.Infrastructure;
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
        .Enrich.WithProperty("Service", "SubscriptionService"));

    builder.Services.AddSubscriptionInfrastructure(builder.Configuration);

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

    builder.Services.AddAuthorization();
    builder.Services.AddHttpContextAccessor();

    // SEC-051: Redis distributed cache for webhook idempotency deduplication
    var redisConnectionString = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "subscription:";
    });

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
    if (FirebaseApp.DefaultInstance == null)
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

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "SubscriptionService failed to start."); }
finally { Log.CloseAndFlush(); }
