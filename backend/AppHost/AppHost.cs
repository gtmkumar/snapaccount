var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL resource (shared cluster with schema-per-service)
var postgres = builder.AddPostgres("postgres")
    .WithEnvironment("POSTGRES_DB", "snapaccount");

var snapAccountDb = postgres.AddDatabase("snapaccount");

// Redis for session caching and SignalR backplane
var redis = builder.AddRedis("redis");

// Auth Service
var authService = builder.AddProject<Projects.AuthService_Api>("auth-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Document Service
var documentService = builder.AddProject<Projects.DocumentService_Api>("document-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Accounting Service — P6-HANDOFF-10: env vars for Pub/Sub and GCP
var accountingService = builder.AddProject<Projects.AccountingService_Api>("accounting-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_OCR", "accounting-service-ocr-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithHttpEndpoint(port: 5005, name: "http")
    .WithHttpsEndpoint(port: 5006, name: "https");

// GST Service — Phase 6B: GSTN/IRP/EWB adapter env vars (P6-HANDOFF-15)
var gstService = builder.AddProject<Projects.GstService_Api>("gst-service")
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
var loanService = builder.AddProject<Projects.LoanService_Api>("loan-service")
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
var itrService = builder.AddProject<Projects.ItrService_Api>("itr-service")
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
var chatService = builder.AddProject<Projects.ChatService_Api>("chat-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION", "chat-service-account-deletion-sub");

// Notification Service — Pub/Sub subscriptions for recurring jobs and loan events (P6-HANDOFF-34)
var notificationService = builder.AddProject<Projects.NotificationService_Api>("notification-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("PUBSUB_SUBSCRIPTION_RECURRING_JOBS", "notification-service-recurring-jobs-sub")
    .WithEnvironment("PUBSUB_SUBSCRIPTION_LOAN_EVENTS", "notification-service-loan-events-sub")
    .WithEnvironment("PUBSUB_TOPIC_PREFIX", "snapaccount")
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// Report Service — Phase 6C: GCS bucket for generated report files
var reportService = builder.AddProject<Projects.ReportService_Api>("report-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev")
    .WithEnvironment("GCS_REPORTS_BUCKET",
        builder.Configuration["GCS_REPORTS_BUCKET"] ?? "snapaccount-reports-dev")
    .WithEnvironment("GCS_LOAN_PACKAGES_BUCKET",
        builder.Configuration["GCS_LOAN_PACKAGES_BUCKET"] ?? "snapaccount-loan-packages-dev");

// Subscription Service — Razorpay webhook HMAC secret (SEC-001)
var subscriptionService = builder.AddProject<Projects.SubscriptionService_Api>("subscription-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

// AI Service
var aiService = builder.AddProject<Projects.AiService_Api>("ai-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb);

// Callback Service — Phase 6E, 12th microservice
var callbackService = builder.AddProject<Projects.CallbackService_Api>("callback-service")
    .WithReference(snapAccountDb)
    .WithReference(redis)
    .WaitFor(snapAccountDb)
    .WithEnvironment("GCP_PROJECT_ID", builder.Configuration["GCP_PROJECT_ID"] ?? "snapaccount-dev");

builder.Build().Run();
