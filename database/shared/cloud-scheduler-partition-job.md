# Cloud Scheduler — Audit Log Partition Automation

> SEC-019: Automated monthly partition creation for `shared.audit_log`

## Overview

The function `shared.create_audit_log_partitions(months_ahead)` creates monthly partitions for the `shared.audit_log` table up to N months in advance. It is idempotent -- existing partitions are skipped.

A Cloud Scheduler job should invoke this function on the **1st of each month** to ensure partitions always exist well ahead of time.

## Setup: Cloud Scheduler + Cloud SQL

Since Cloud Scheduler cannot connect directly to Cloud SQL, use one of these approaches:

### Option A: Cloud Scheduler -> Cloud Run Job (Recommended)

1. **Create a lightweight Cloud Run job** that connects to Cloud SQL and executes the partition function:

```bash
# Build and push a minimal container with psql
gcloud run jobs create audit-partition-job \
  --image=gcr.io/cloud-marketplace/google/postgresql:latest \
  --region=asia-south1 \
  --set-env-vars="PGHOST=/cloudsql/snapaccount-prod:asia-south1:snapaccount-db" \
  --set-env-vars="PGDATABASE=snapaccount" \
  --set-env-vars="PGUSER=snapaccount_admin" \
  --set-cloudsql-instances=snapaccount-prod:asia-south1:snapaccount-db \
  --service-account=auth-service-sa@snapaccount-prod.iam.gserviceaccount.com \
  --command="psql" \
  --args="-c","SELECT shared.create_audit_log_partitions(12);"
```

2. **Create the Cloud Scheduler job** to trigger it monthly:

```bash
gcloud scheduler jobs create http audit-partition-scheduler \
  --location=asia-south1 \
  --schedule="0 2 1 * *" \
  --time-zone="Asia/Kolkata" \
  --uri="https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/snapaccount-prod/jobs/audit-partition-job:run" \
  --http-method=POST \
  --oauth-service-account-email=scheduler-sa@snapaccount-prod.iam.gserviceaccount.com \
  --description="SEC-019: Creates audit_log partitions 12 months ahead on the 1st of each month at 02:00 IST"
```

### Option B: Cloud Scheduler -> Cloud Function

1. **Create a Cloud Function** (Python/Node) that uses the Cloud SQL connector to execute:

```sql
SELECT shared.create_audit_log_partitions(12);
```

2. **Schedule it** with Cloud Scheduler on the same `0 2 1 * *` cron expression.

### Option C: Hangfire (Application-Level)

If using Hangfire in the AuthService (already deployed), register a recurring job:

```csharp
RecurringJob.AddOrUpdate(
    "audit-partition-creation",
    () => dbContext.Database.ExecuteSqlRawAsync("SELECT shared.create_audit_log_partitions(12)"),
    "0 2 1 * *", // 1st of month, 02:00 IST
    new RecurringJobOptions { TimeZone = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time") }
);
```

## Verification

After setup, verify partitions exist:

```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'shared' AND tablename LIKE 'audit_log_%'
ORDER BY tablename;
```

## Schedule

- **Cron:** `0 2 1 * *` (1st of every month at 02:00 IST)
- **Time zone:** Asia/Kolkata
- **Months ahead:** 12 (creates partitions one full year in advance)
- **Idempotent:** Yes -- safe to run multiple times; existing partitions are skipped
