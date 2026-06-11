---
name: wave7a-ca-residuals
description: Wave 7A addendum — CA residuals: CA profiles list, CA-cancel, recurring availability rules. Migration 085. 133 tests.
metadata:
  type: project
---

Wave 7A addendum (2026-06-12): 3 CA admin UI contract residuals closed in ChatService only.
**Why:** Frontend-dev was using workarounds (/auth/admin/team-members?role=CA, one-by-one slot management). Proper backend contracts needed.
**How to apply:** Migration 085 is applied and replay-tolerant on top of 080–084.

## Endpoints added (6)
- GET /appointments/ca-profiles — list CaProfile entries; perm: chat.appointments.book
- POST /appointments/{id}/cancel-by-ca — CA cancel, no 2h rule, mandatory reason, fires AppointmentCancelledByCaEvent; perm: chat.slots.manage
- POST /appointments/availability-rules — create recurring weekly rule; perm: chat.slots.manage
- GET /appointments/availability-rules — list rules; perm: chat.slots.manage
- DELETE /appointments/availability-rules/{id} — deactivate rule; perm: chat.slots.manage
- POST /appointments/availability-rules/generate — on-demand slot generation; perm: chat.slots.manage

## Domain changes
- Appointment: CancelledByCa (bool), CaCancellationReason (string?), CancelByCa(reason) method
- AppointmentCancelledByCaEvent — new domain event (Pub/Sub to NotificationService)
- CaAvailabilityRule — new aggregate: weekday, startTimeIst, endTimeIst (TimeSpan), slotDurationMinutes, effectiveFrom/To (DateOnly), isActive
- AppointmentSlot.CreateFromRule(...) — public factory, no "must be future" guard (caller has checked)

## ISlotGenerationService pattern
Shared slot generation logic lives in Application layer (ISlotGenerationService interface) + Infrastructure (SlotGenerationService impl). GenerateSlotsFromRulesJob (Hangfire) calls ISlotGenerationService directly — NOT through MediatR — to bypass PermissionBehavior (which would fail with no HTTP context). The user-facing command GenerateSlotsFromRulesCommand does have [RequiresPermission("chat.slots.manage")] and resolves the CA profile from ICurrentUser.

## Hangfire job
GenerateSlotsFromRulesJob — weekly cron "30 19 * * 6" (Saturday 19:30 UTC = Sunday 01:00 IST). Registered via app.Lifetime.ApplicationStarted. Idempotent (skips existing slots by (ca_profile_id, start_utc)).

## Migration 085
- CREATE TABLE chat.ca_availability_rules (weekday SMALLINT, start_time_ist INTERVAL, end_time_ist INTERVAL, slot_duration_minutes INTEGER, effective_from DATE, effective_to DATE, is_active BOOL, audit cols, RLS)
- ALTER chat.appointments ADD cancelled_by_ca BOOL DEFAULT FALSE, ca_cancellation_reason VARCHAR(1000)

## Test count
79 unit + 17 EfSmoke = 96 total in ChatService.Tests (up from 50 unit + 11 EfSmoke = 61 before this work).
133 total in the combined run (includes idempotency + chat/domain tests from prior builds).
