var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapDefaultEndpoints();

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", service = "api-gateway" }));

app.MapReverseProxy();

app.Run();
