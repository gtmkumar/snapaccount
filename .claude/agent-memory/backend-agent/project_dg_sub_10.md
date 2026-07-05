---
name: dg-sub-10-mrr-history-events
description: DG-SUB-10 MRR history time-series and subscription events feed backend implementation (2026-06-28)
metadata:
  type: project
---

DG-SUB-10 (medium) implemented: 2 new queries + 2 new endpoints on GET /subscriptions/mrr/history and GET /subscriptions/events.

**Why:** Admin subscriptions page SubscriptionsPage.tsx had a static Skeleton for the MRR chart and no events table. Frontend subscriptionApi.ts already had getMrrHistory()/listSubscriptionEvents() stubs calling these routes (marked NOT YET IMPLEMENTED).

**What was built:**
- `GetMrrHistoryQuery(Months=12)` → `IReadOnlyList<MrrHistoryPointDto>` — builds monthly points client-side after a single EF query; normalises plan price by BillingCycle enum integer value; returns `{ month: "yyyy-MM", totalMrr, activeCount }`.
- `ListSubscriptionEventsQuery(Limit=20)` → `IReadOnlyList<SubscriptionEventDto>` — derives synthetic events from subscription columns (CreatedAt→Subscribed, CancelledAt→Cancelled, Status=PastDue/Paused→respective events) plus PAID/REFUNDED/VOID invoice timestamps; batch-resolves org names from auth.organizations via IAuthDbContext; returns `{ eventId, eventType, organizationId, organizationName?, planName?, mrr?, occurredAt }`.
- Both wired in `Subscriptions.cs` with `[RequiresPermission("subscription.plan.create")]` and standard rate limiter.

**Key decisions:**
- No new DB table — events are derived from existing columns (avoids a migration for this gap).
- BillingCycle cast to `(int)` in EF anonymous projection is safe; MRR division happens client-side.
- UpdatedAt on BaseAuditableEntity is `DateTime` (non-nullable) — used as timestamp for PastDue/Paused events.
- eventId is a synthetic string `"{guid}:{type}"` — stable and unique per event type per entity.

**How to apply:** If events table divergence causes confusion later, a proper audit-log table (subscription_event_log) with explicit rows would be more accurate but requires a migration and wiring state-transition writes.

Build: 0 errors, 24 warnings (pre-existing).
