# Phase 6E — Notifications + Callbacks

> **Priority:** P0 (cross-cutting — every other feature emits notifications)
> **Duration:** 2 weeks
> **Depends on:** Phase 5 approved (done). No dependency on 6A.
> **Runs in parallel with:** Phase 6A (OCR → Accounting)
> **Source:** `phase-6-gap-analysis.md` §8.5, §5.1, §5.4, Plan I2 (26 events) + E4 + G4

---

## Why this is P0

- Plan I2 defines **26 notification events × 3 channels** (push, SMS, email). None are wired today. Without this, filing deadlines are silent and the app cannot meet its retention promises.
- The **Callback system** (plan E4 + G4) — a core human-service differentiator — has no schema, no service, no UI. "Request Callback" CTAs on mobile dead-end today.
- Both systems must land together because callbacks emit notifications, and the notification service needs the callback preference model.

---

## Scope

### db-engineer (additive migrations)

1. **`notification` schema extensions:**
   - `notification.notification_preferences` — per-user per-event-type × (push, sms, email) booleans.
   - `notification.notification_templates` — versioned templates keyed on `(event_type, channel, locale)`. Locales: en, hi, bn (plan default) + provision for additional state languages.
   - `notification.notification_log` — every send attempt: status (QUEUED/SENT/DELIVERED/FAILED/BOUNCED), provider_message_id, provider, cost_inr, retry_count.
   - `notification.dlq_items` — messages that exhausted retries.
2. **`callback` schema (new):**
   - `callback.callbacks` — id, org_id, user_id, requested_at, preferred_window tstzrange, category enum (GST, ITR, DOC, LOAN, BILLING, OTHER), priority (LOW/NORMAL/HIGH/URGENT), status enum (PENDING/SCHEDULED/IN_PROGRESS/COMPLETED/FOLLOW_UP_NEEDED/ESCALATED_TO_CA/CANCELLED), assigned_to uuid, scheduled_at tstzrange, reason_text, linked_entity_type, linked_entity_id, audit cols.
   - `callback.call_notes` — id, callback_id, author_id, body text, outcome, duration_minutes, recorded_at.
   - `callback.assignments_log` — who was assigned when, by whom, reason.
   - `callback.kpi_daily_snapshot` — materialized view or scheduled rollup (count by status, avg TTR, SLA breach count).
3. RLS: every callback visible to its org + assigned CA only.
4. DPDP cascade: right-to-erasure must soft-delete `call_notes` and anonymize `callbacks.user_id` after org erasure (same pattern as SEC-008).

### backend-agent

1. **NotificationService full build:**
   - Domain: `NotificationEvent`, `NotificationPreference`, `DispatchResult`, `Template`, `Channel` (enum).
   - Application: Commands (SendNotification, UpdatePreferences, RegisterPushToken, MarkRead) + Queries (GetInbox, GetPreferences).
   - **Dispatcher:** fan-out pipeline. Input = domain event (e.g., `GstDeadlineApproachingEvent`). Output = N channel-specific sends. Respects user preferences + quiet hours + do-not-disturb.
   - **Adapters (Infrastructure):**
     - `FcmPushAdapter` (Firebase Admin SDK) — device token from Auth.preferences.
     - `Msg91SmsAdapter` — API wrapper, DLT template id management, retry w/ backoff.
     - `SendGridEmailAdapter` — templated emails, unsubscribe link, bounce handling.
   - **Hangfire jobs** (deadline reminders):
     - GST: per-return, fire at D-7, D-3, D-1 before due date.
     - ITR: e-verify Day 1/7/15/25/29 after filing until verified.
     - Generic: subscription renewal, invoice overdue.
   - In-app message center: `GET /notifications/inbox`, `POST /notifications/{id}/read`.
   - 26 event types wired — each with template + default channel matrix.
2. **CallbackService (new microservice OR module in NotificationService — decision below):**
   - **Decision:** build as new microservice `CallbackService` under `backend/Services/CallbackService/` for scope isolation, consistent with the 11-service pattern. Reconcile with Decision 2 in status.md (11 services → 12).
   - Domain: `Callback`, `CallNote`, `CallbackCategory`, `CallbackStatus` state machine.
   - Application: RequestCallback, AssignCallback, ScheduleCallback, StartCall, AddNote, CompleteCallback, EscalateCallback, CancelCallback + queries.
   - State machine enforcement via `Result<T>` — invalid transitions return `Error.Conflict`.
   - Emits domain events that NotificationService listens to: `CallbackScheduledEvent` → notify user "call at 3:30pm"; `CallbackCompletedEvent` → notify CSAT survey push.
3. **NotificationService → CallbackService integration:**
   - Pub/Sub event contract: `callback.*.event` topic.
   - Idempotency via `event_id` dedupe on consumer side.
4. **Tests:** unit ≥80%, integration tests hitting real Postgres + a fake MSG91/SendGrid/FCM (adapter interface with a test double only for external HTTP — DB stays real).

### ui-ux-agent (docs/design/)

1. **Admin Callback Management** screen specs:
   - Callback Queue (filter by status, category, priority, assigned_to, SLA-breach).
   - Callback Detail (timeline of status changes + notes + linked entity).
   - Callback KPI dashboard (count by status, avg TTR, SLA compliance).
2. **Mobile "Request Callback" flow** specs:
   - CTA placement on GstDashboard, ItrDashboard, LoanStatus, ChatList.
   - Request modal (category auto-detected from context, preferred time, reason).
   - Status screen ("Scheduled for 3:30pm today — [Reschedule] [Cancel]").
3. **In-app Notification Center** enhancements: group by date, swipe-to-dismiss, deep-link preview, filter by category.
4. Design tokens already exist (from Phase 5 design system refresh). Extend Toast + Badge variants for new statuses.

### frontend-dev (src/admin/)

1. New page `src/admin/src/pages/callbacks/CallbackListPage.tsx` — queue view with filters.
2. `src/admin/src/pages/callbacks/CallbackDetailPage.tsx` — detail + note composer + status transitions.
3. `src/admin/src/pages/callbacks/CallbackKpiPage.tsx` — dashboard with TanStack Query subscribing to `GET /callbacks/kpi`.
4. Router entries + sidebar nav entry (role-gated: CA + admin + ops only — role guard stub is OK; real RBAC in 6F).
5. Notification Center in admin header: `GET /notifications/inbox` dropdown + badge count.
6. API clients: `src/admin/src/lib/callbackApi.ts`, `src/admin/src/lib/notificationApi.ts`.
7. All text via `t()` — en + hi + bn strings added.
8. Vitest coverage for new pages.

### mobile-dev (mobile/)

1. "Request Callback" CTA component — reusable, attached to GstDashboard, ItrDashboard, LoanStatus, ChatList screens.
2. `RequestCallbackModalScreen` — form (category auto, preferred window, reason).
3. `CallbackStatusScreen` — live status w/ reschedule/cancel actions.
4. FCM token registration flow: verify existing flow publishes token to `POST /auth/me/push-tokens` AND that NotificationService picks it up. Fix if broken (per gap analysis line 190).
5. Push notification **deep-link routing**: tapping a GST-deadline push → `GstDashboardScreen`, not app root. Use Expo Notifications `addNotificationResponseReceivedListener`.
6. NotificationCenterScreen: ensure real API wiring (already listed as API-wired in gap analysis — verify).
7. SecureStore for tokens only.
8. Jest coverage for new screens.

### devops-engineer

1. **Hangfire vs Cloud Scheduler decision (risk #8 in gap analysis):**
   - Recommendation: Cloud Scheduler + Pub/Sub topic `recurring-jobs.due` → NotificationService subscriber. Reasons: Cloud Run scales to zero; Hangfire needs min-instances=1 (cost); Cloud Scheduler is 3 free jobs/month then $0.10/job/month. Decision doc: `docs/devops/recurring-jobs-decision.md`.
   - Fallback: if team lead prefers Hangfire, dedicate NotificationService Cloud Run with min-instances=1.
2. **MSG91 + SendGrid + Firebase Admin credentials** in GCP Secret Manager. Names: `msg91-api-key`, `sendgrid-api-key`, `firebase-admin-json`. Update terraform/gcloud scripts and `.env.example`.
3. **CallbackService** Cloud Run service definition in terraform. Same pattern as other services.
4. **Aspire AppHost** wire CallbackService reference.

### qa-web + qa-mobile + security-reviewer

- qa-web: notification preference CRUD, callback queue filter/sort, role-gated sidebar, a11y keyboard nav through Callback Detail.
- qa-mobile: full callback request flow (iOS + Android), push-deep-link routing (simulate via `xcrun simctl push` and `adb shell`), FCM token registration verification.
- security-reviewer: Callback RBAC (user sees only their org callbacks, CA sees assigned, admin sees all), notification spoofing prevention (HMAC on webhooks?), MSG91 DLT template compliance (regulatory), DPDP cascade on callback deletion.

---

## Exit Criteria

1. `/notifications/*` endpoints return real data — zero 501 responses.
2. `/callbacks/*` endpoints return real data — zero 501 responses.
3. A GST filing deadline at D-3 fires a push + SMS + email to subscribed users within 1 min of scheduler trigger.
4. User taps "Request Callback" on mobile → admin sees it in Callback Queue within 2s.
5. Admin schedules callback → user receives push + "Scheduled for 3:30pm" status screen within 2s.
6. Deep-link: tapping a GST-deadline push opens `GstDashboardScreen` (not app root).
7. 26 event types covered with templates in en + hi + bn.
8. NotificationService Hangfire OR Cloud Scheduler + Pub/Sub recurring jobs verified in staging.
9. Callback state machine enforced — invalid transitions rejected.
10. DPDP erasure cascades callbacks + notes.
11. Tests: xUnit ≥80% both services; frontend vitest green; mobile jest green.
12. Zero new Critical/High security findings.

---

## Dependencies & Risks

- **MSG91 DLT templates** — Indian SMS regulation requires pre-registered templates; lead time 2–3 days. Kick off registration on day 1.
- **SendGrid domain authentication** — SPF/DKIM; needs DNS change from team lead. Raise on day 1.
- **FCM server key** — already in place per Phase 1; verify still valid.
- **12th microservice** — adding CallbackService changes the 11-service count. Update `CLAUDE.md` + `project-brief.md` + `AppHost` + terraform. Flag to orchestrator for team-lead confirmation.
- **Hangfire vs Cloud Scheduler** — devops-engineer decision blocks NotificationService handlers. Pre-empt by day 2.
- **Notification fatigue** — per preferences model, quiet hours + dedup rules required. Don't send same event twice in 6h window.

---

## Owner Agents (in execution order)

1. db-engineer (both schemas) → blocks backend-agent.
2. devops-engineer (MSG91/SendGrid/FCM creds + Hangfire vs Scheduler decision) → parallel to db-engineer.
3. backend-agent (NotificationService + CallbackService) → blocks frontend-dev + mobile-dev.
4. ui-ux-agent (specs) → can run parallel from day 1.
5. frontend-dev + mobile-dev (parallel).
6. qa-web + qa-mobile + security-reviewer (parallel, final gate).
7. orchestrator approval gate.

---

*End of Phase 6E scope.*
