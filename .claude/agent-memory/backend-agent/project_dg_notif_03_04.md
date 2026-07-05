---
name: project-dg-notif-03-04
description: DG-NOTIF-03 RecurringJobsSubscriber event codes + DG-NOTIF-04 admin notification center backend contract fixes
metadata:
  type: project
---

## DG-NOTIF-03 — RecurringJobsSubscriber catalog event codes

**Status:** Already correct in branch `feature/repository-refactor` (committed in `86deea2`).

The switch in `RecurringJobsSubscriber.DispatchJobAsync` already maps:
- `GST_DEADLINE_CHECK` → `GST_DEADLINE_3_DAYS`
- `ITR_DEADLINE_REMINDERS` → `ITR_EFILE_VERIFY_D1`
- `ITR_REFUND_POLLING` → `ITR_REFUND_CREDITED`
- `SUBSCRIPTION_RENEWAL_CHECK` → `SUB_RENEWAL_3_DAYS`

All match `NotificationEventCatalog` uppercase codes.

## DG-NOTIF-04 — Admin notification center backend contract fixes

**Files changed:**
- `Platform.Domain/Notification/Entities/InboxNotification.cs` — added `ReadAt`, `ReferenceType`, `ReferenceId`, `DataPayload` properties + `MarkAsRead()` method; extended `Create()` factory with optional deep-link params
- `Platform.Infrastructure/Notification/Persistence/Configurations/InboxNotificationConfiguration.cs` — mapped new EF columns (`read_at`, `reference_type`, `reference_id`, `data_payload`)
- `Platform.Application/Notification/Notifications/Queries/GetInbox/GetInboxQuery.cs` — extended `GetInboxQuery` with `Category` + `UnreadOnly` params; `InboxItem` DTO now returns `title`, `category` (derived from event-type prefix), `status` as `READ|UNREAD` (from `IsRead`), `deepLinkUrl`, `deepLinkLabel`, `linkedEntityType`, `linkedEntityId`, `linkedEntityLabel`
- `Platform.Application/Notification/Notifications/Commands/MarkRead/MarkReadCommand.cs` — fixed to operate on `InboxNotifications` DbSet (not stale `NotificationLog`); calls `entry.MarkAsRead()`
- `Platform.Application/Notification/Notifications/Commands/MarkAllRead/MarkAllReadCommand.cs` — NEW: `MarkAllReadCommand(UserId)` → `ICommand<MarkAllReadResult>`; loads all unread InboxNotifications for user, calls `MarkAsRead()` on each
- `Platform.WebApi/Endpoints/Notification/Notifications.cs` — wired `category` + `unreadOnly` query params to `GetInbox`; added `POST /notifications/read-all` → `MarkAllReadCommand`

**Category derivation (event-type prefix → frontend enum):**
- `GST_` → `GST`, `ITR_` → `ITR`, `DOC_` → `DOCS`, `LOAN_` → `LOAN`, `CB_` → `CALLBACK`, `SUB_` → `BILLING`, `ACCT_`/`CHAT_` → `SYSTEM`

**No new SQL migration needed** — the DB columns `reference_type`, `reference_id`, `data_payload`, `read_at`, `is_read` all exist in `notification.notification` (migration 008).

**Why:** `status` returning `DispatchStatus` enum broke Zod parse on the frontend; `title` was absent; `category`/`deepLink*`/`linkedEntity*` fields were missing; `POST /notifications/read-all` 404'd; `MarkReadCommand` was querying the wrong table.

**How to apply:** Pattern for subsequent notification-center changes: derive category from `EventType` prefix at query time (no DB column needed); store deep-link info in `data_payload` JSONB; `IsRead` drives the `READ|UNREAD` status enum — never use `DispatchStatus` for inbox items.
