---
name: project-wave7-mobile-reconciliation
description: Wave 7 mobile reconciliation residuals — 6 items closed across ChatService, AuthService, GstService. Migration 086. 920 unit tests green.
metadata:
  type: project
---

Wave 7 Mobile Reconciliation — all 6 items closed (2026-06-12).

**Why:** Mobile client had documented residual contract mismatches in `mobile/src/api/appointments.ts` and `mobile/src/api/auth.ts` that caused workarounds (list-scan for single appt, notes prefix for topic, polling disappearance for device approval).

**How to apply:** When reviewing subsequent mobile API changes, these residuals are now closed. Note the deferred items (approximate-location, resend-push) remain product-gated.

## Changes

### ChatService
- `GET /appointments/{id}` — single appointment detail, IDOR-guarded. `GetAppointmentQuery` + `AppointmentDetailDto`.
- `POST /appointments` — `topic` (VARCHAR(50), CHECK enum) now first-class. `BookAppointmentCommand` + `BookAppointmentRequest` updated. Migration 086.
- `GET /appointments/slots/day-map?caProfileId&from&to` — GROUP BY day, returns `{date, availableCount}` per day for DateStrip. `GetSlotDayMapQuery`. 90-day max range.
- `GET /appointments/bookmarks` — `BookmarkDto` enriched: `messageCreatedAt`, `senderUserId`, `senderRole`, `threadSubject`. Join: bookmarks→messages→threads. No cross-schema join (senderDisplayName deferred — schema isolation).
- Appointment.Create signature: `(orgId, userId, caId, slotId, notes=null, topic=null)`.
- AppointmentSummaryDto: now includes `topic` and `notes`.

### AuthService
- `GET /auth/devices/my-approval-status` — NEW device polling endpoint. Returns `{approvalRequestId, status, decidedAt, expiresAt, mode}`. `GetMyApprovalStatusQuery`. Mode from `DeviceApproval:Enforce` config: ENFORCE/NOTIFY_ONLY.
- Status values: PENDING/APPROVED/DENIED/EXPIRED/UNKNOWN. EXPIRED-by-clock computed in handler (PENDING past ExpiresAt → EXPIRED string, decidedAt = ExpiresAt).

### GstService
- Legacy status shim in `ListNotices` endpoint: Open→RECEIVED, Overdue→UNDER_REVIEW, Responded→RESPONDED, Closed→CLOSED. Shim is at endpoint layer (not validator), deprecated, forward-compat with canonical values.

## Migration 086
- File: `database/migrations/086_chat_appointment_topic.sql`
- Additive: `chat.appointments.topic VARCHAR(50) NULL` with CHECK constraint + `ix_appointments_topic` index.
- Applied and scratch-replayed (idempotent).

## Deferred (product-gated)
- Approximate location on approval request (IP geolocation TL decision pending).
- Resend-push action (notification idempotency TL decision pending).
- Documented in `docs/api/endpoints.md` Wave 7 Mobile Reconciliation section.

## Test counts
- ChatService: 97 unit + 20 EfSmoke (was 79 + 17)
- AuthService: 641 unit (was 627)
- GstService: 182 unit (was 164)
- Total across 3 services: 920 unit + 20 EfSmoke
