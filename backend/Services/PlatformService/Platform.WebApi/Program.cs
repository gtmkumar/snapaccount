using AuthService.Api;
using AuthService.Application;
using AuthService.Application.Common.Interfaces;
using AuthService.Infrastructure;
using AuthService.Infrastructure.Auth;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.RateLimiting;
using NotificationService.Infrastructure;
using Scalar.AspNetCore;
using Serilog;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Infrastructure.Auth;
using SubscriptionService.Infrastructure;
using System.Reflection;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

// ═══════════════════════════════════════════════════════════════
// PlatformService.Api — Phase 2 modular monolith composite host
// Merges: AuthService + SubscriptionService + NotificationService
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
        .Enrich.WithProperty("Service", "PlatformService"));

    builder.Services.AddAuthInfrastructure(builder.Configuration);
    builder.Services.AddAuthApplicationServices();
    builder.Services.AddSubscriptionInfrastructure(builder.Configuration);
    builder.Services.AddNotificationInfrastructure(builder.Configuration);

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

    var redisConnectionString = builder.Configuration["REDIS_CONNECTION_STRING"] ?? "localhost:6379";
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "subscription:";
    });

    builder.Services.AddSnapAuthentication();
    builder.Services.AddHttpContextAccessor();

    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter("standard", opt =>
        {
            opt.PermitLimit = 100;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddSlidingWindowLimiter("otp", opt =>
        {
            opt.PermitLimit = 5;
            opt.Window = TimeSpan.FromMinutes(10);
            opt.SegmentsPerWindow = 2;
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddSlidingWindowLimiter("password-reset", opt =>
        {
            opt.PermitLimit = 5;
            opt.Window = TimeSpan.FromMinutes(10);
            opt.SegmentsPerWindow = 2;
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.AddFixedWindowLimiter("invite-token-lookup", opt =>
        {
            opt.PermitLimit = 20;
            opt.Window = TimeSpan.FromMinutes(1);
            opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
            opt.QueueLimit = 0;
        });

        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    });

    builder.Services.AddExceptionHandler<CustomExceptionHandler>();
    builder.Services.AddProblemDetails();

    var app = builder.Build();

    app.UseSerilogRequestLogging();
    app.UseCors();
    app.UseRateLimiter();
    app.UseMiddleware<FirebaseAuthMiddleware>();
    app.UseMiddleware<DeviceIntegrityMiddleware>();
    app.UseAuthorization();
    app.UseExceptionHandler();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    app.UseHangfireDashboard("/hangfire", new DashboardOptions
    {
        Authorization = [new HangfireRoleAuthorizationFilter("SUPER_ADMIN")]
    });

    app.MapHealthChecks("/healthz");

    app.MapEndpoints(Assembly.GetExecutingAssembly());

    SessionTokenSecret.ValidateOrThrow(app.Configuration, app.Environment.EnvironmentName);

    if (!string.Equals(app.Environment.EnvironmentName, "Development", StringComparison.OrdinalIgnoreCase))
    {
        var internalToken = app.Configuration["InternalApi:SharedToken"];
        if (string.IsNullOrWhiteSpace(internalToken) || internalToken.Length < 32)
        {
            throw new InvalidOperationException(
                "InternalApi:SharedToken is not configured or is shorter than 32 characters.");
        }
    }

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
catch (Exception ex) { Log.Fatal(ex, "PlatformService failed to start."); }
finally { Log.CloseAndFlush(); }
