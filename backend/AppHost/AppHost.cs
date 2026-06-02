var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL — EXTERNAL instance managed outside Aspire (local Homebrew / PGAdmin on
// localhost:5432, schema-per-service). Aspire does NOT spin up a container for it.
// The connection string is read from AppHost configuration (user-secrets / env):
//   ConnectionStrings:snapaccount = Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgres
// Set it once with:
//   cd backend/AppHost && dotnet user-secrets set "ConnectionStrings:snapaccount" "<connstring>"
// Schemas are created by database/migrations/*.sql (run manually) and each service's
// DbContext pins its schema via HasDefaultSchema(...), so no Search Path is needed here.
var snapAccountDb = builder.AddConnectionString("snapaccount");

// Redis for session caching and SignalR backplane (still containerized via Aspire)
var redis = builder.AddRedis("redis");

// Dev-loop env vars propagated to every service:
//   DEV_AUTH_BYPASS=true   — AuthService skips Firebase init (canned tokens)
//   GOOGLE_APPLICATION_CREDENTIALS — points to a fake but well-formed creds file so
//     services that eagerly call GoogleCredential.GetApplicationDefault() at startup
//     don't crash. Background Pub/Sub subscribers will fail later (caught), and the
//     HostOptions:BackgroundServiceExceptionBehavior=Ignore below prevents that from
//     killing the host. None of this is OK for production — those env vars must not
//     be set in staging/prod.
// Also injects the localhost DB connection string as BOTH ConnectionStrings__snapaccount
// (the name 11 services fall back to) and ConnectionStrings__DefaultConnection (overrides
// AuthService's appsettings placeholder, since its DI does not substitute #{DB_PASSWORD}#).
//
// httpPort pins a STABLE, directly-bound host port (no Aspire proxy) so the admin Vite
// dev-server proxy (src/admin/vite.config.ts) has a fixed target per service. Without
// this, Aspire assigns random ports each run and the SPA cannot reach the backend.
IResourceBuilder<T> WithDevLoopDefaults<T>(IResourceBuilder<T> b, int httpPort)
    where T : IResourceWithEnvironment, IResourceWithEndpoints
{
    var devBypass = Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS");
    var gac = Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS");
    var localAuth = Environment.GetEnvironmentVariable("LOCAL_AUTH");
    var localAuthSecret = Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET");
    // Forward the AppHost's own environment to every child so GcpStartup.IsEnabled
    // (which reads ASPNETCORE_ENVIRONMENT) sees "Development" and services boot GCP-free
    // locally. Without this, CallbackService's boot-time Firebase ADC init throws.
    var aspnetEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
        ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
    if (!string.IsNullOrEmpty(aspnetEnv)) b = b.WithEnvironment("ASPNETCORE_ENVIRONMENT", aspnetEnv);
    if (!string.IsNullOrEmpty(devBypass)) b = b.WithEnvironment("DEV_AUTH_BYPASS", devBypass);
    if (!string.IsNullOrEmpty(gac)) b = b.WithEnvironment("GOOGLE_APPLICATION_CREDENTIALS", gac);
    // LOCAL_AUTH: username/password login against the local DB instead of Firebase.
    if (!string.IsNullOrEmpty(localAuth)) b = b.WithEnvironment("LOCAL_AUTH", localAuth);
    if (!string.IsNullOrEmpty(localAuthSecret)) b = b.WithEnvironment("LOCAL_AUTH__SECRET", localAuthSecret);
    return b
        .WithEndpoint("http", e => { e.Port = httpPort; e.IsProxied = false; }, createIfNotExists: false)
        .WithReference(snapAccountDb)
        .WithEnvironment("ConnectionStrings__DefaultConnection", snapAccountDb)
        .WithEnvironment("DB_PASSWORD", "postgres")
        .WithEnvironment("HostOptions__BackgroundServiceExceptionBehavior", "Ignore");
}

// Auth Service
var authService = WithDevLoopDefaults(builder.AddProject<Projects.AuthService_Api>("auth-service"), 5101)
    .WithReference(redis);

// Document Service
var documentService = WithDevLoopDefaults(builder.AddProject<Projects.DocumentService_Api>("document-service"), 5102)
    .WithReference(redis);

// Accounting Service — P6-HANDOFF-10: env vars for Pub/Sub and GCP
var accountingService = WithDevLoopDefaults(builder.AddProject<Projects.AccountingService_Api>("accounting-service"), 5103)
    .WithReference(redis)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_OCR", "accounting-service-ocr-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// GST Service — Phase 6B: GSTN/IRP/EWB adapter env vars (P6-HANDOFF-15)
var gstService = WithDevLoopDefaults(builder.AddProject<Projects.GstService_Api>("gst-service"), 5104)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_GST", "gst-service-recurring-jobs-sub")
    .WithEnvironment("GST_PRODUCTION_APIS_ENABLED", builder.Configuration["GST_PRODUCTION_APIS_ENABLED"] ?? "false")
    .WithEnvironment("GSTN_API_BASE_URL", builder.Configuration["GSTN_API_BASE_URL"] ?? "https://api.gst.gov.in")
    .WithEnvironment("IRP_API_BASE_URL", builder.Configuration["IRP_API_BASE_URL"] ?? "https://einvoice1.gst.gov.in")
    .WithEnvironment("EWB_API_BASE_URL", builder.Configuration["EWB_API_BASE_URL"] ?? "https://ewaybillgst.gov.in");

// Loan Service — Phase 6C: GCS bucket, Pub/Sub topic, partner bank creds template
var loanService = WithDevLoopDefaults(builder.AddProject<Projects.LoanService_Api>("loan-service"), 5105)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("GCS_LOAN_PACKAGES_BUCKET",
        builder.Configuration["GCS_LOAN_PACKAGES_BUCKET"] ?? "snapaccount-loan-packages-dev")
    .WithEnvironment("LOAN_EVENTS_TOPIC",
        builder.Configuration["LOAN_EVENTS_TOPIC"] ?? "snapaccount.loan.events")
    .WithEnvironment("PARTNER_BANK_CREDS_TEMPLATE",
        builder.Configuration["PARTNER_BANK_CREDS_TEMPLATE"] ?? "partner-bank-creds-{bankId}")
    .WithEnvironment("ServiceUrls__GstService",
        builder.Configuration["ServiceUrls__GstService"] ?? "http://gst-service")
    .WithEnvironment("ServiceUrls__AccountingService",
        builder.Configuration["ServiceUrls__AccountingService"] ?? "http://accounting-service");

// ITR Service — Phase 6D: GCP env vars for Document AI, Pub/Sub, PAN encryption
var itrService = WithDevLoopDefaults(builder.AddProject<Projects.ItrService_Api>("itr-service"), 5106)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_ITR", "itr-service-recurring-jobs-sub")
    .WithEnvironment("GOOGLE_DOCUMENT_AI_CONFIG", builder.Configuration["GOOGLE_DOCUMENT_AI_CONFIG"] ?? "{}")
    .WithEnvironment("GCS_BUCKET_ITR", builder.Configuration["GCS_BUCKET_ITR"] ?? "snapaccount-itr-dev");

// Chat Service (SignalR + Redis backplane for presence tracking)
// REDIS_CONNECTION_STRING is read by ChatService.Infrastructure DI for SignalR scale-out.
// Aspire injects the Redis endpoint; we also expose it via explicit env var for the backplane.
var chatService = WithDevLoopDefaults(builder.AddProject<Projects.ChatService_Api>("chat-service"), 5107)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION", "chat-service-account-deletion-sub");

// Notification Service — Pub/Sub subscriptions for recurring jobs and loan events (P6-HANDOFF-34)
var notificationService = WithDevLoopDefaults(builder.AddProject<Projects.NotificationService_Api>("notification-service"), 5108)
    .WithReference(redis)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS", "notification-service-recurring-jobs-sub")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_LOAN_EVENTS", "notification-service-loan-events-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// Report Service — Phase 6C: GCS bucket for generated report files
var reportService = WithDevLoopDefaults(builder.AddProject<Projects.ReportService_Api>("report-service"), 5109)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("GCS_REPORTS_BUCKET",
        builder.Configuration["GCS_REPORTS_BUCKET"] ?? "snapaccount-reports-dev")
    .WithEnvironment("GCS_LOAN_PACKAGES_BUCKET",
        builder.Configuration["GCS_LOAN_PACKAGES_BUCKET"] ?? "snapaccount-loan-packages-dev");

// Subscription Service — Razorpay webhook HMAC secret (SEC-001)
var subscriptionService = WithDevLoopDefaults(builder.AddProject<Projects.SubscriptionService_Api>("subscription-service"), 5110)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// AI Service
var aiService = WithDevLoopDefaults(builder.AddProject<Projects.AiService_Api>("ai-service"), 5111)
    .WithReference(redis);

// Callback Service — Phase 6E, 12th microservice
var callbackService = WithDevLoopDefaults(builder.AddProject<Projects.CallbackService_Api>("callback-service"), 5112)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

builder.Build().Run();
