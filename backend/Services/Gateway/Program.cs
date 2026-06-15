var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Expo web (:8081), admin Vite (:3000+), any local dev port on loopback.
            p.SetIsOriginAllowed(origin =>
                !string.IsNullOrEmpty(origin)
                && Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                && uri.Host is "localhost" or "127.0.0.1");
        }
        else
        {
            p.WithOrigins(
                builder.Configuration["AllowedOrigins:AdminPanel"] ?? "https://admin.snapaccount.in",
                builder.Configuration["AllowedOrigins:Mobile"] ?? "https://snapaccount.in");
        }

        p.AllowAnyMethod().AllowAnyHeader().AllowCredentials();
    }));

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapDefaultEndpoints();

app.UseCors();

app.MapGet("/healthz", () => Results.Ok(new { status = "healthy", service = "api-gateway" }));

app.MapReverseProxy();

app.Run();
