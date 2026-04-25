---
name: Project Stack and GCP Cloud
description: SnapAccount runs on GCP not Azure — translation table and confirmed stack decisions
type: project
---

SnapAccount is a GCP-native project. All Azure references in agent scaffold must be translated.

**Translation table:**
- Azure Blob Storage → Google Cloud Storage (GCS)
- Azure Service Bus → Google Pub/Sub
- Azure Key Vault → GCP Secret Manager
- Azure AD B2C → Firebase Auth
- Azure Document Intelligence → Google Document AI
- Azure AI Foundry/OpenAI → Vertex AI / Gemini API

**Confirmed stack (verified from code):**
- Auth: Firebase Admin SDK (FirebaseAdmin NuGet 3.x), NOT Microsoft.Identity.Web
- GCS: `Google.Cloud.Storage.V1` (StorageClient + UrlSigner)
- Pub/Sub: `Google.Cloud.PubSub.V1` (PublisherClient)
- Secret Manager: ADC (Application Default Credentials) — no service account key files on Cloud Run
- DB: PostgreSQL 17, Npgsql EF Core, schema-per-service, pgvector enabled
- ORM: EF Core 10 with Npgsql provider
- Migrations: schema-per-service history table `__ef_migrations_history` in each schema

**Why:** GCP was chosen over Azure for cost (GCS cheaper than Azure Blob at SME scale) and Firebase Auth free tier (50K MAU).

**How to apply:** Never reference Azure packages. For Workload Identity on Cloud Run, always use `GoogleCredential.GetApplicationDefaultAsync()` — never read `GOOGLE_APPLICATION_CREDENTIALS` file path.
