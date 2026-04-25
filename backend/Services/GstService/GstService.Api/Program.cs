using GstService.Application;
using GstService.Infrastructure;
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

    builder.Host.UseSerilog((ctx, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .WriteTo.Console()
        .Enrich.WithProperty("Service", "GstService"));

    // Infrastructure (EF Core, repositories, calculation service, Firebase)
    builder.Services.AddGstInfrastructure(builder.Configuration);

    // MediatR + JT-pattern pipeline (UnhandledException → Logging → Validation → Performance)
    builder.Services.AddGstApplicationServices();

    builder.Services.AddOpenApi();

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

    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "GstService failed to start."); }
finally { Log.CloseAndFlush(); }
