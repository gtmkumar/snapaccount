---
name: dg-infra-04-callback-recurring-jobs
description: DG-INFRA-04 — CallbackRecurringJobsSubscriber + /callbacks/internal/refresh-kpi-mv; KPI MV refresh in prod
metadata:
  type: project
---

DG-INFRA-04 implementation (2026-06-28): KPI MV refresh pipeline in AssistService.

**What:** The callback.kpi_daily_snapshot materialized view was only refreshed once at migration time (migration 073 line 65). The infra side (callback-service-recurring-jobs-sub Pub/Sub subscription + Cloud Scheduler job callback-kpi-mv-refresh) was already provisioned, but the backend had no consumer.

**Files added:**
1. `Assist.Infrastructure/Callback/Messaging/CallbackRecurringJobsSubscriber.cs` — BackgroundService consuming callback-service-recurring-jobs-sub; handles CALLBACK_KPI_MV_REFRESH (calls RefreshKpiMvAsync) and acknowledges GST_PRE_DEADLINE_CALLBACK with PENDING-B19 note; gated on GcpStartup.IsEnabled.
2. `Assist.Application/Callback/Internal/Commands/RefreshKpiMv/RefreshKpiMvCommand.cs` — ICommand record + empty FluentValidation validator (no fields). Handler NOT here (needs DbContext.Database raw SQL).
3. `Assist.Infrastructure/Callback/Internal/RefreshKpiMvCommandHandler.cs` — Infrastructure handler implementing ICommandHandler<RefreshKpiMvCommand>; injects concrete CallbackDbContext to call db.Database.ExecuteSqlRawAsync("REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;").
4. `Assist.WebApi/Endpoints/Callback/Callbacks.cs` — added POST /callbacks/internal/refresh-kpi-mv; no RequireAuthorization (Cloud Scheduler); X-Internal-Token header validated via constant-time HMAC-SHA256 (same RV-01/SEC-AI-02 pattern as AiConfigEndpoints.CryptographicEqual); dev-mode bypass when InternalApi:SharedToken not configured.

**Files modified:**
- `Assist.Infrastructure/Callback/DependencyInjection.cs` — added AddHostedService<CallbackRecurringJobsSubscriber>() (GCP-gated) and explicit IRequestHandler<RefreshKpiMvCommand, Result> → RefreshKpiMvCommandHandler registration (MediatR only scans Application assembly, not Infrastructure).

**Key patterns:**
- Infrastructure handler (not Application) because ExecuteSqlRawAsync needs CallbackDbContext.Database, not ICallbackDbContext.
- Handler registered explicitly: `services.AddScoped<IRequestHandler<RefreshKpiMvCommand, Result>, RefreshKpiMvCommandHandler>()` — matches how Chat's AppointmentBookedEventHandler is registered.
- CONCURRENTLY keyword is safe because uq_kpi_daily_snapshot_org_date unique index is asserted by migrations 067+073.
- Subscriber env var: PUBSUB_SUBSCRIPTION_RECURRING_JOBS_CALLBACK (fallback: callback-service-recurring-jobs-sub).

**Why:** line 65 of migration 073 is the ONLY REFRESH in the entire backend. In prod the MV was permanently stale after initial migration. Cloud Scheduler + Pub/Sub were already wired on the infra side (pubsub-scheduler-recurring-jobs.sh:115,389-395) — only the backend consumer was missing.

**How to apply:** When adding future recurring-job handlers in AssistService: (1) add to CallbackRecurringJobsSubscriber switch, (2) if raw SQL is needed create command in Application + handler in Infrastructure and register explicitly in DependencyInjection.cs.

Build: 0 errors (dotnet build Services/AppHost/AppHost.csproj and Services/AssistService/Assist.WebApi/Assist.WebApi.csproj both green 2026-06-28).
