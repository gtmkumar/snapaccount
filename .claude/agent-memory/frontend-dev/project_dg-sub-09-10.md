---
name: project_dg-sub-09-10
description: DG-SUB-09 and DG-SUB-10 fixes applied to SubscriptionsPage — plan lookup bug + chart components
type: project
---

DG-SUB-09 fix (2026-06-28): Changed `plans?.find(p => p.planId === sub?.subscriptionId)` to `plans?.find(p => p.planId === sub?.planId)` at `SubscriptionsPage.tsx` line ~74 inside `CurrentPlanCard`. The backend `GetSubscriptionQuery` returns `SubscriptionDto(SubscriptionId, PlanId, ...)` — `planId` (a separate Guid) is the field to match against `Plan.planId`, not the subscription's own id. The `SubscriptionSchema` in `subscriptionApi.ts` already declared `planId: z.string()`.

DG-SUB-10 (2026-06-28): Replaced static `<Skeleton variant="chart">` placeholder on the subscriptions overview tab with three live components:
- `PlanDistributionBar` — recharts `BarChart` rendering `mrr?.byPlan` (already in the MRR response from `/subscriptions/mrr`). No new backend needed.
- `MrrTrendChart` — recharts `LineChart` calling `getMrrHistory()` → `GET /subscriptions/mrr/history`. Backend NOT YET IMPLEMENTED; renders graceful empty state with `throwOnError: false`. Will auto-populate when backend-agent ships the endpoint.
- `RecentEventsPanel` — calling `listSubscriptionEvents()` → `GET /subscriptions/events`. Backend NOT YET IMPLEMENTED; same graceful-empty pattern.

New API functions added to `src/admin/src/lib/subscriptionApi.ts`: `getMrrHistory`, `listSubscriptionEvents`, `MrrHistoryPointSchema`, `SubscriptionEventSchema`.

New i18n keys added to en/hi/bn: `subscriptions.mrrTrend.empty`, `subscriptions.mrrTrend.emptyHint`, `subscriptions.events.title`, `subscriptions.events.empty`.

**Why:** Gap audit verified the static skeleton was never replaced and plan-lookup always resolved to Free due to wrong field comparison.

**How to apply:** The two backend-gated endpoints (`/subscriptions/mrr/history` and `/subscriptions/events`) need backend-agent to add `GetMrrHistoryQuery` and `ListSubscriptionEventsQuery` + Subscriptions.cs routes before they show data. Frontend already handles their absence gracefully.
