var builder = DistributedApplication.CreateBuilder(args);

// Dev-loop env vars propagated to every service:
//   DEV_AUTH_BYPASS=true   — AuthService skips Firebase init (canned tokens)
//   GOOGLE_APPLICATION_CREDENTIALS — points to a fake but well-formed creds file so
//     services that eagerly call GoogleCredential.GetApplicationDefault() at startup
//     don't crash. Background Pub/Sub subscribers will fail later (caught), and the
//     HostOptions:BackgroundServiceExceptionBehavior=Ignore below prevents that from
//     killing the host. None of this is OK for production — those env vars must not
//     be set in staging/prod.
static IResourceBuilder<T> WithDevLoopDefaults<T>(IResourceBuilder<T> b) where T : IResourceWithEnvironment
{
    var devBypass = Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS");
    var gac = Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS");
    if (!string.IsNullOrEmpty(devBypass)) b = b.WithEnvironment("DEV_AUTH_BYPASS", devBypass);
    if (!string.IsNullOrEmpty(gac)) b = b.WithEnvironment("GOOGLE_APPLICATION_CREDENTIALS", gac);
    return b.WithEnvironment("HostOptions__BackgroundServiceExceptionBehavior", "Ignore");
}

// PostgreSQL resource (shared cluster with schema-per-service)
// Uses pgvector/pgvector:pg17 image so the `vector` extension is available
// (required by database/init/00_extensions_and_schemas.sql).
// The init bind-mount runs database/init/*.sql on first container start,
// creating all 12 schemas + extensions before any service-owned migration
// runs. Run database/migrations/*.sql manually after AppHost startup for now;
// a proper migration runner job is on the roadmap.
var initScriptDir = Path.GetFullPath(Path.Combine(
    builder.AppHostDirectory, "..", "..", "database", "init"));

var postgres = builder.AddPostgres("postgres")
    .WithImage("pgvector/pgvector", "pg17")
    .WithEnvironment("POSTGRES_DB", "snapaccount")
    .WithInitFiles(initScriptDir);

var snapAccountDb = postgres.AddDatabase("snapaccount");

// Redis for session caching and SignalR backplane
var redis = builder.AddRedis("redis");

// Auth Service
var authService = WithDevLoopDefaults(builder.AddProject<Projects.AuthService_Api>("auth-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Document Service
var documentService = WithDevLoopDefaults(builder.AddProject<Projects.DocumentService_Api>("document-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Accounting Service — P6-HANDOFF-10: env vars for Pub/Sub and GCP
var accountingService = WithDevLoopDefaults(builder.AddProject<Projects.AccountingService_Api>("accounting-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_OCR", "accounting-service-ocr-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// GST Service — Phase 6B: GSTN/IRP/EWB adapter env vars (P6-HANDOFF-15)
var gstService = WithDevLoopDefaults(builder.AddProject<Projects.GstService_Api>("gst-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_GST", "gst-service-recurring-jobs-sub")
    .WithEnvironment("GST_PRODUCTION_APIS_ENABLED", builder.Configuration["GST_PRODUCTION_APIS_ENABLED"] ?? "false")
    .WithEnvironment("GSTN_API_BASE_URL", builder.Configuration["GSTN_API_BASE_URL"] ?? "https://api.gst.gov.in")
    .WithEnvironment("IRP_API_BASE_URL", builder.Configuration["IRP_API_BASE_URL"] ?? "https://einvoice1.gst.gov.in")
    .WithEnvironment("EWB_API_BASE_URL", builder.Configuration["EWB_API_BASE_URL"] ?? "https://ewaybillgst.gov.in");

// Loan Service — Phase 6C: GCS bucket, Pub/Sub topic, partner bank creds template
var loanService = WithDevLoopDefaults(builder.AddProject<Projects.LoanService_Api>("loan-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
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
var itrService = WithDevLoopDefaults(builder.AddProject<Projects.ItrService_Api>("itr-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS_ITR", "itr-service-recurring-jobs-sub")
    .WithEnvironment("GOOGLE_DOCUMENT_AI_CONFIG", builder.Configuration["GOOGLE_DOCUMENT_AI_CONFIG"] ?? "{}")
    .WithEnvironment("GCS_BUCKET_ITR", builder.Configuration["GCS_BUCKET_ITR"] ?? "snapaccount-itr-dev");

// Chat Service (SignalR + Redis backplane for presence tracking)
// REDIS_CONNECTION_STRING is read by ChatService.Infrastructure DI for SignalR scale-out.
// Aspire injects the Redis endpoint; we also expose it via explicit env var for the backplane.
var chatService = WithDevLoopDefaults(builder.AddProject<Projects.ChatService_Api>("chat-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION", "chat-service-account-deletion-sub");

// Notification Service — Pub/Sub subscriptions for recurring jobs and loan events (P6-HANDOFF-34)
var notificationService = WithDevLoopDefaults(builder.AddProject<Projects.NotificationService_Api>("notification-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS", "notification-service-recurring-jobs-sub")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_LOAN_EVENTS", "notification-service-loan-events-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// Report Service — Phase 6C: GCS bucket for generated report files
var reportService = WithDevLoopDefaults(builder.AddProject<Projects.ReportService_Api>("report-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("GCS_REPORTS_BUCKET",
        builder.Configuration["GCS_REPORTS_BUCKET"] ?? "snapaccount-reports-dev")
    .WithEnvironment("GCS_LOAN_PACKAGES_BUCKET",
        builder.Configuration["GCS_LOAN_PACKAGES_BUCKET"] ?? "snapaccount-loan-packages-dev");

// Subscription Service — Razorpay webhook HMAC secret (SEC-001)
var subscriptionService = WithDevLoopDefaults(builder.AddProject<Projects.SubscriptionService_Api>("subscription-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// AI Service
var aiService = WithDevLoopDefaults(builder.AddProject<Projects.AiService_Api>("ai-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Callback Service — Phase 6E, 12th microservice
var callbackService = WithDevLoopDefaults(builder.AddProject<Projects.CallbackService_Api>("callback-service"))
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

builder.Build().Run();
