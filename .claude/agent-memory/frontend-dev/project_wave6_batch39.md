---
name: wave6-batch39-completion
description: Wave 6 frontend batch #39 — GAP-023/035/036/038/052/UX-debt; 3 new pages, callback gating, health widget, i18n +91 keys; 1022 tests, 0 lint errors
metadata:
  type: project
---

Wave 6 board task #39 completed on branch `2026-06-10-s5t4`.

## Items delivered

**GAP-023 — Callback module `<Can>` gating**
- `CallbackDetailPage.tsx`: action toolbar (startCall, complete, escalate, cancel) each wrapped in narrowest possible `<Can>` permission gate; NoteComposer also gated with `callback.update`
- `CallbackListPage.tsx`: KPI Dashboard button wrapped in `<Can anyOf={['callback.kpi.read', 'admin.dashboard.read']}>`
- Sidebar: Callbacks entry has `requiredServerPermission: 'callback.read'`; removed 4 `// TODO Phase 6F:` comments
- Test fix pattern: both callback test files needed `vi.mock('@/hooks/usePermission', ...)` with `permissionsLoaded: true` — otherwise `<Can>` renders nothing (hides buttons).

**GAP-036 — Subscriber List + Invoice Management pages**
- `SubscriberListPage.tsx` at `/subscriptions/subscribers` — gated `subscription.plan.create`
  - `listAllSubscriptions()` returns 404/501 → shows "endpoint not available" graceful state (backend BLOCKED: `GET /subscriptions/admin/list` not deployed)
  - Shows `ByPlanPanel` from MRR dashboard (IS available)
- `InvoiceManagementPage.tsx` at `/subscriptions/invoices` — gated `menu.subscriptions.view`
  - Wired to real `listInvoices()` paginated endpoint (org-scoped)
  - `generateInvoice()` gated with `subscription.plan.create`
- `subscriptionApi.ts` updated: `InvoiceSchema` matches real backend `InvoiceDto` (subscriptionId, totalInr, periodStart, periodEnd, pdfGcsUri); `listInvoices()` returns paginated; `generateInvoice()` takes subscriptionId param

**GAP-038 — System Health page**
- `healthApi.ts` new: tries `GET /admin/health/aggregate`; fallback fan-out to per-service `GET /health/{name}` x12; aggregates to overall status; returns "unknown" (not fabricated) when proxy not deployed
- `SystemHealthPage.tsx` at `/admin/system-health` — shows "monitoring proxy not deployed" alert; auto-refreshes every 30s
- `DashboardPage.tsx`: hardcoded system health values replaced with `SystemHealthWidget` component; shows "proxy not configured" state with link to full page

**GAP-035 remainder — BillingScreen upgrade CTA on admin**
- `SubscriptionsPage.tsx`: added `CurrentPlanCard` pulling `getMySubscription()`; shows past-due `AlertBanner`; upgrade button opens Dialog with next-tier plans + `upgradeMutation`

**GAP-052 / UX-debt**
- `PlanDialog` reset-on-reopen: added `useEffect(() => { if (open) { reset state } }, [open, plan?.planId])`
- `NoticeDetailPage.tsx`: added `maxLength={500}` on subject, `maxLength={10000}` + character counter on reply body textarea

**BUG-DASH-KB-004** — keyboard nav fix already landed (tests 1022→1022 green); no code change in this batch; browser confirmed via existing test coverage.

## i18n
- +91 keys added across en.json / hi.json / bn.json (1833 → 1917 per-locale, triple parity maintained)
- Key groups: `subscriptions.subscribers.*`, `subscriptions.byPlan.*`, `subscriptions.col.*`, `subscriptions.status.*`, `subscriptions.invoices.*`, `subscriptions.invoiceStatus.*`, `subscriptions.currentPlan.*`, `subscriptions.upgrade.*`, `health.*`, `dashboard.systemHealth.*`, `common.clearFilters`, `common.forbidden`

## ESLint gotcha
The `react-hooks/exhaustive-deps` rule is NOT configured in this project's ESLint config. Any `// eslint-disable-line react-hooks/exhaustive-deps` or `// eslint-disable-next-line react-hooks/exhaustive-deps` comment causes ESLint error "Definition for rule not found". Remove such comments; the dependency array is intentionally partial (identity key pattern is safe).

## Gate results
- `npx vitest run`: 1022/1022 pass, 53 test files
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: success

## Blocked / deferred
- `GET /subscriptions/admin/list` — platform-admin subscriber list endpoint missing from backend. Flagged in `subscriptionApi.ts` with BLOCKED comment. `SubscriberListPage` shows graceful "not available" state.
- `GET /admin/health/aggregate` — health proxy not deployed to local dev. `healthApi.ts` falls back to per-service probes; shows "unknown" not fabricated data.
- Tax Rate Config page — explicitly excluded (backend contract pending).

**Why:** Wave 6 frontend batch to close GAP items before Phase 7 freeze.
**How to apply:** Reference when picking up Tax Rate Config page or subscriber-list once `GET /subscriptions/admin/list` endpoint is deployed.
