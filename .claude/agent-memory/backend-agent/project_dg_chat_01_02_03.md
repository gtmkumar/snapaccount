---
name: project-dg-chat-01-02-03
description: DG-CHAT-01 RAG semantic upgrade (pgvector), DG-CHAT-02 appointment completion endpoints + auto-complete job, DG-CHAT-03 appointment notification catalog + event handlers
type: project
---

# DG-CHAT-01/02/03 — RAG Semantic + Appointment Lifecycle + Notifications (2026-06-28)

## DG-CHAT-01: RAG Semantic Cosine Retrieval
Applied the deferred P7b DDL (migration 098) and wired Pgvector.EntityFrameworkCore.

**Why:** RAG retrieval was OrderBy ChunkIndex (arbitrary), not by semantic cosine distance. Query embedding computed then discarded.

**Changes:**
- Migration `098_ai_embeddings_pgvector_and_chat_appointment_notifications.sql`:
  - Adds `embedding vector(768)` column to `ai.embeddings`
  - Backfills from `float_vector` (cast float4[] → vector; zero vector for empty/wrong-dim)
  - HNSW index `ix_ai_embeddings_hnsw` with `vector_cosine_ops`, m=16, ef_construction=64
  - `float_vector` retained per additive-migration rule
- NuGet packages added: `Pgvector` + `Pgvector.EntityFrameworkCore` to Domain, Application, Infrastructure
- `AiEmbedding.Embedding` changed from `float[]` to `Pgvector.Vector` (constructor wraps float[])
- `AiEmbeddingConfiguration`: maps `embedding` column as `vector(768)` + HNSW index declaration
- `AiServiceDbContext`: adds `HasPostgresExtension("vector")`
- `AiInfrastructure DI`: `npgsql.UseVector()` in AddDbContext call
- `AiChatQueryHandler` step 5: `OrderBy(x => x.emb.Embedding.CosineDistance(queryVector))` (CosineDistance from Pgvector.EntityFrameworkCore extension method)

**API:** `CosineDistance()` is an extension method on `Vector` from `Pgvector.EntityFrameworkCore` — translates to `embedding <=> $param ORDER BY` in SQL. `IPubSubPublisher.PublishAsync<TEvent>` requires `TEvent : IDomainEvent` — payload records must extend `DomainEvent`.

## DG-CHAT-02: Appointment Completion + MarkNoShow + AutoComplete Job

**Why:** `Appointment.Complete()` and `MarkNoShow()` existed but had zero call sites. `Rate()` requires Status==COMPLETED, so the entire rating flow was unreachable.

**Changes:**
- `CompleteAppointmentCommand` + handler: `chat.slots.manage` RBAC, CA-scoped IDOR, `SkipOwnerCheck=true` for system path
- `MarkNoShowCommand` + handler: CA-scoped IDOR, releases slot
- `AutoCompleteAppointmentsJob` (Hangfire, every 5 min): queries CONFIRMED appointments joined to slots where `slot.EndUtc <= NOW()`, calls `appointment.Complete()` directly (no MediatR — follows `GenerateSlotsFromRulesJob` pattern of bypassing PermissionBehavior)
- New endpoints: `POST /appointments/{id}/complete`, `POST /appointments/{id}/no-show`
- Registered in `Program.cs` as `"auto-complete-appointments"` recurring job (cron `"*/5 * * * *"`)

## DG-CHAT-03: Appointment Reminder + CA-Cancel Notifications

**Why:** `AppointmentBookedEvent` and `AppointmentCancelledByCaEvent` raised but had no subscribers anywhere.

**Changes:**
- `NotificationEventCatalog`: added 4 entries: `APPT_BOOKED`, `APPT_REMINDER_30`, `APPT_REMINDER_5`, `APPT_CANCELLED_BY_CA` (seeded at Platform startup)
- `AppointmentBookedEventHandler` (Infrastructure, `INotificationHandler<AppointmentBookedEvent>`): schedules two delayed Hangfire jobs via `IBackgroundJobClient.Schedule<SendAppointmentReminderJob>` at `slotStart-30m` and `slotStart-5m`
- `AppointmentCancelledByCaEventHandler` (Infrastructure): enqueues `SendAppointmentCancellationJob` immediately
- `SendAppointmentReminderJob`: delayed Hangfire job; checks appointment still CONFIRMED before publishing `AppointmentReminderPayload` to `snapaccount.appointment.reminder` topic; null-checks `IPubSubPublisher` (local dev degradation)
- `SendAppointmentCancellationJob`: immediate Hangfire job; publishes `AppointmentCancellationPayload` to same topic
- Both payload records extend `DomainEvent` (required by `IPubSubPublisher.PublishAsync<TEvent> where TEvent : IDomainEvent`)
- Handlers registered in `ChatService.Infrastructure.DependencyInjection` as scoped `INotificationHandler<T>` (placed in Infrastructure not Application because they depend on `IBackgroundJobClient`)
- `SendAppointmentReminderJob` + `SendAppointmentCancellationJob` registered as `AddTransient<>` in DI

**How to apply:** Event handlers requiring Hangfire or Pub/Sub belong in Infrastructure (not Application) since Application layer has no access to Hangfire or Shared.Infrastructure types. Pattern: DI manual registration via `services.AddScoped<INotificationHandler<TEvent>, THandler>()`.

**Build result:** AppHost 0 errors, 24 pre-existing NuGet warnings.
