# SnapAccount Backend — Local Development Guide

## Prerequisites

- .NET 10 SDK
- PostgreSQL 17 (or Docker: `docker run -e POSTGRES_PASSWORD=postgresql -p 5432:5432 postgres:17`)
- (Optional) Google Cloud SDK for Pub/Sub and Secret Manager emulation

## SEC-018: Database Password — User Secrets

The `appsettings.json` connection strings use a `#{DB_PASSWORD}#` placeholder instead of the
real password. This prevents credentials from being committed to version control.

**Set the database password via dotnet user-secrets (run once per service):**

```bash
cd backend/Services/PlatformService/Platform.WebApi
dotnet user-secrets init
dotnet user-secrets set "DB_PASSWORD" "postgresql"
```

Set once per composite WebApi host you run locally (Platform, Finance, or Assist).

**Alternative: environment variable**

Set `DB_PASSWORD=postgresql` in your shell before running the service.

## SEC-013: PAN Encryption Key

The `PanEncryption:Key` in `AuthService/appsettings.json` is a placeholder
(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` — 32 zero bytes, base64-encoded).

For local dev this is acceptable. In production, set via GCP Secret Manager:

```bash
# Generate a real 256-bit key
openssl rand -base64 32

# Store in Secret Manager
gcloud secrets create pan-encryption-key --replication-policy=user-managed --locations=asia-south1
echo -n "<your-base64-key>" | gcloud secrets versions add pan-encryption-key --data-file=-
```

The Cloud Run service injects it as the `PanEncryption__Key` environment variable.

## Running Locally

```bash
cd backend
dotnet run --project Services/AppHost
```

Aspire dashboard: https://localhost:17241

## Environment Variables Summary (local dev)

| Variable | Purpose | Where to set |
|---|---|---|
| `DB_PASSWORD` | PostgreSQL password | dotnet user-secrets or shell |
| `PanEncryption__Key` | AES-256 PAN encryption key | dotnet user-secrets or shell |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook HMAC secret | dotnet user-secrets or shell |
| `Firebase__ServiceAccountJson` | Firebase Admin SDK JSON | dotnet user-secrets (never commit) |
| `GCP__ProjectId` | GCP project ID | appsettings.Development.json |
