var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL — EXTERNAL instance managed outside Aspire (local Homebrew / PGAdmin on
// localhost:5432, schema-per-service). Aspire does NOT spin up a container for it.
var snapAccountDb = builder.AddConnectionString("snapaccount");

// Redis for session caching and SignalR backplane
var redis = builder.AddRedis("redis");

// Dev-loop env vars propagated to every composite service.
IResourceBuilder<T> WithDevLoopDefaults<T>(IResourceBuilder<T> b, int httpPort)
    where T : IResourceWithEnvironment, IResourceWithEndpoints
{
    var devBypass = Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS");
    var gac = Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS");
    var localAuth = Environment.GetEnvironmentVariable("LOCAL_AUTH");
    var localAuthSecret = Environment.GetEnvironmentVariable("LOCAL_AUTH__SECRET");
    var aspnetEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
        ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
    if (!string.IsNullOrEmpty(aspnetEnv)) b = b.WithEnvironment("ASPNETCORE_ENVIRONMENT", aspnetEnv);
    if (!string.IsNullOrEmpty(devBypass)) b = b.WithEnvironment("DEV_AUTH_BYPASS", devBypass);
    if (!string.IsNullOrEmpty(gac)) b = b.WithEnvironment("GOOGLE_APPLICATION_CREDENTIALS", gac);
    if (!string.IsNullOrEmpty(localAuth)) b = b.WithEnvironment("LOCAL_AUTH", localAuth);
    if (!string.IsNullOrEmpty(localAuthSecret)) b = b.WithEnvironment("LOCAL_AUTH__SECRET", localAuthSecret);
    // SEC-013: dev PAN encryption key (32 zero bytes) — matches CI smoke test
    b = b.WithEnvironment("PanEncryption__Key", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    return b
        .WithEndpoint("http", e => { e.Port = httpPort; e.IsProxied = false; }, createIfNotExists: false)
        .WithReference(snapAccountDb)
        .WithEnvironment("ConnectionStrings__DefaultConnection", snapAccountDb)
        .WithEnvironment("DB_PASSWORD", "postgresql")
        .WithEnvironment("HostOptions__BackgroundServiceExceptionBehavior", "Ignore");
}

var gcpProjectId = builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev";

// ── SnapAccount consolidation: 12 modules → 3 composites + gateway + apphost ─
// Pattern (same as LaundryGhar example): AppHost orchestrates gateway + 3 peer APIs.
// SnapAccount names/ports are our own — NOT LaundryGhar Core/Operations/Commerce.
//
//   AppHost → API Gateway (:5000) → Platform (:5201) | Finance (:5202) | Assist (:5203)
//                                         └──────── PostgreSQL / Redis ────────┘

// Platform — Auth, Subscription, Notification
var platformService = WithDevLoopDefaults(builder.AddProject<Projects.Platform_WebApi>("platform-service"), 5201)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", gcpProjectId)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS", "notification-service-recurring-jobs-sub")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_LOAN_EVENTS", "notification-service-loan-events-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount");

// Finance — Document, Accounting, GST, Loan, ITR, Report
var financeService = WithDevLoopDefaults(builder.AddProject<Projects.Finance_WebApi>("finance-service"), 5202)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", gcpProjectId)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_OCR", "accounting-service-ocr-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_GST", "gst-service-recurring-jobs-sub")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_ITR", "itr-service-recurring-jobs-sub")
    .WithEnvironment("GST_PRODUCTION_APIS_ENABLED", builder.Configuration["GST_PRODUCTION_APIS_ENABLED"] ?? "false")
    .WithEnvironment("GSTN_API_BASE_URL", builder.Configuration["GSTN_API_BASE_URL"] ?? "https://api.gst.gov.in")
    .WithEnvironment("IRP_API_BASE_URL", builder.Configuration["IRP_API_BASE_URL"] ?? "https://einvoice1.gst.gov.in")
    .WithEnvironment("EWB_API_BASE_URL", builder.Configuration["EWB_API_BASE_URL"] ?? "https://ewaybillgst.gov.in")
    .WithEnvironment("GCS_LOAN_PACKAGES_BUCKET", builder.Configuration["GCS_LOAN_PACKAGES_BUCKET"] ?? "snapaccount-loan-packages-dev")
    .WithEnvironment("LOAN_EVENTS_TOPIC", builder.Configuration["LOAN_EVENTS_TOPIC"] ?? "snapaccount.loan.events")
    .WithEnvironment("PARTNER_BANK_CREDS_TEMPLATE", builder.Configuration["PARTNER_BANK_CREDS_TEMPLATE"] ?? "partner-bank-creds-{bankId}")
    .WithEnvironment("ServiceUrls__GstService", "http://localhost:5202")
    .WithEnvironment("ServiceUrls__AccountingService", "http://localhost:5202")
    .WithEnvironment("GOOGLE_DOCUMENT_AI_CONFIG", builder.Configuration["GOOGLE_DOCUMENT_AI_CONFIG"] ?? "{}")
    .WithEnvironment("GCS_BUCKET_ITR", builder.Configuration["GCS_BUCKET_ITR"] ?? "snapaccount-itr-dev")
    .WithEnvironment("GCS_REPORTS_BUCKET", builder.Configuration["GCS_REPORTS_BUCKET"] ?? "snapaccount-reports-dev");

// Assist — Chat, AI, Callback
var assistService = WithDevLoopDefaults(builder.AddProject<Projects.Assist_WebApi>("assist-service"), 5203)
    .WithReference(redis)
    .WithEnvironment("GCP_PROJECT_ID", gcpProjectId)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION", "chat-service-account-deletion-sub");

// API Gateway (YARP) — single entry point; routes to all 3 composites
var apiGateway = builder.AddProject<Projects.Gateway>("api-gateway")
    .WithEndpoint("http", e => { e.Port = 5000; e.IsProxied = false; }, createIfNotExists: false)
    .WithReference(platformService)
    .WithReference(financeService)
    .WithReference(assistService)
    .WaitFor(platformService)
    .WaitFor(financeService)
    .WaitFor(assistService);

builder.Build().Run();
