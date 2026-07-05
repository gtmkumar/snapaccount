---
name: project-dg-gst-02-03
description: DG-GST-02 ARN capture + audit trail; DG-GST-03 Guid.Empty deadline broadcast fix
metadata:
  type: project
---

## DG-GST-02 — ARN capture + audit trail (2026-06-28)

**Fact:** PATCH `/gst/returns/{id}/arn` and GET `/gst/returns/{id}/audit` did not exist. Frontend `gstApi.ts` called them and got 404.

**Implementation:**
- New domain entity: `GstService.Domain.Entities.GstReturnAudit` (BaseEntity, append-only, 7-year retention)
- EF config: `GstReturnAuditConfiguration` → table `gst.gst_return_audit`
- Added `DbSet<GstReturnAudit> GstReturnAudits` to `IGstDbContext` and `GstDbContext`
- Added `GstReturn.UpdateArn(string arnNumber)` domain method (only valid on FILED status)
- New command: `UpdateReturnArnCommand` → `PATCH /gst/returns/{id}/arn` → `ArnSaveResponseSchema { arn, savedAt, savedBy }`
- New query: `GetGstReturnAuditQuery` → `GET /gst/returns/{id}/audit?page=1&pageSize=20` → `AuditListSchema { items, totalCount, page }`
- New command: `RequestRevisionCommand` → `POST /gst/returns/{id}/revision` (flagGstReturnRevision in frontend)
- Audit rows written in: CreateGstReturn (CREATED), SubmitForApproval (SUBMITTED), ApproveReturn (APPROVED), FileReturn (FILED + ARN), UpdateReturnArn (ARN_UPDATED), RequestRevision (REVISION_REQUESTED)
- DB migration: `database/migrations/096_gst_return_audit.sql`

**AuditEventSchema field mapping:**
- `id` → `a.Id.ToString()`
- `eventType` → `a.EventType` (values: CREATED/SUBMITTED/APPROVED/FILED/REVISION_REQUESTED/ARN_UPDATED/ASSIGNED)
- `actorEmail` → `a.ActorEmail`
- `actorDisplayName` → `a.ActorDisplayName`
- `timestamp` → `a.Timestamp.ToString("O")`
- `detail` → `a.Detail`
- `previousStatus` → `a.PreviousStatus`
- `arnReceived` → `a.ArnReceived`
- `diffAvailable` → always `false` (not implemented)

**Why:** `GstReturnAudit` uses `BaseEntity` (not `BaseAuditableEntity`) — it's append-only with no UpdatedAt/DeletedAt. Timestamp is stored explicitly. Follow this pattern for future append-only audit logs.

**How to apply:** When adding audit trail to any module, use the `BaseEntity` + explicit `Timestamp` pattern (like `ImsActionLog`, `GstReturnAudit`). Never use `BaseAuditableEntity` for append-only log tables.

---

## DG-GST-03 — Guid.Empty deadline broadcast fix (2026-06-28)

**Fact:** `RecurringJobsSubscriber` dispatched `SendNotificationCommand(UserId: Guid.Empty)` for `GST_DEADLINE_CHECK` and `ITR_DEADLINE_REMINDERS` job types — failing the validator (`UserId.NotEmpty()` rule) and producing no notifications.

**Root cause (already fixed before this session):** `GstDeadlineEventsSubscriber` in Platform.Infrastructure ALREADY correctly resolves real org member UserIds from `auth.org_member` via raw SQL and dispatches per-user `SendNotificationCommand`. This is registered in Notification DI and is the correct per-user path.

**Fix applied:** `RecurringJobsSubscriber.DispatchJobAsync()` now skips dispatch entirely for sweep-only job types (`GST_DEADLINE_CHECK`, `ITR_DEADLINE_REMINDERS`) and logs a diagnostic. Only job types with real `TargetUserId` (`ITR_REFUND_POLLING`, `SUBSCRIPTION_RENEWAL_CHECK`) go through `SendNotificationCommand`. Also added guard: skips if `TargetUserId` is null or `Guid.Empty` to prevent future regressions.

**GST deadline event flow (production):**
1. GstDeadlineCheckHandler (GstService) publishes `GstDeadlineApproachingEvent` to topic `snapaccount.gst.deadline-approaching` at D-7/D-3/D-1/D+1
2. `GstDeadlineEventsSubscriber` (PlatformService/NotificationService) subscribes, resolves org members, dispatches per-user `SendNotificationCommand`
3. Templates `GST_DEADLINE_7_DAYS`, `GST_DEADLINE_3_DAYS`, `GST_DEADLINE_1_DAY` exist in `NotificationEventCatalog`

**Why:** 217 GST tests + 114 Notification tests all green. Build: 0 errors.
