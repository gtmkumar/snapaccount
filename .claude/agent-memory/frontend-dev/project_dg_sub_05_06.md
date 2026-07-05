---
name: dg-sub-05-06-mrr-kpi-and-razorpay-save
description: DG-SUB-05 MRR KPI field name fix + DG-SUB-06 PaymentGatewaySettings Save wired to real API
metadata:
  type: project
---

## DG-SUB-05: MRR KPI cards read wrong field names (fixed 2026-06-28)

Backend `GetMrrDashboardQuery.MrrDashboardDto` emits:
- `activeSubscriptions` / `pastDueSubscriptions` / `cancelledThisMonth` / `trialingSubscriptions`

The `MrrDashboardSchema` in `subscriptionApi.ts` previously accepted BOTH naming sets
(`activeCount` alias + `activeSubscriptions`) but all call sites used `mrr?.activeCount` which
always resolved to `undefined` → KPI cards showed 0.

**Fix:**
- Removed the `*Count` aliases from `MrrDashboardSchema`; only the backend-canonical names remain
- Updated 4 call sites: `SubscriptionsPage.tsx`, `SubscriberListPage.tsx`, `SettingsPage.tsx`, and the test fixture in `SubscriptionsPage.test.tsx`

**Files changed:**
- `src/lib/subscriptionApi.ts` — MrrDashboardSchema cleaned up
- `src/pages/subscriptions/SubscriptionsPage.tsx` — activeSubscriptions / pastDueSubscriptions / cancelledThisMonth
- `src/pages/subscriptions/SubscriberListPage.tsx` — same
- `src/pages/settings/SettingsPage.tsx` — same
- `src/__tests__/SubscriptionsPage.test.tsx` — mock fixture updated

## DG-SUB-06: PaymentGatewaySettings Save wired to PATCH /subscriptions/config/razorpay (fixed 2026-06-28)

Backend: `PATCH /subscriptions/config/razorpay` → `UpdateRazorpayConfigCommand`
Permission: `subscription.config.write`
Request body: `{ keyId, keySecret, webhookSecret?, testMode, isEnabled }`

**Fix:**
- Added `updateRazorpayConfig(params)` to `subscriptionApi.ts`
- Rewrote `PaymentGatewaySettings.tsx` with `useMutation` calling `updateRazorpayConfig`
- Validation guard: fires `toast.error` with `settings.paymentGateway.validationError` if keyId or keySecret empty
- On success: `toast.success(t('settings.paymentGateway.saved'))`
- `common.saving` key added to all 3 locale files
- 43 `settings.paymentGateway.*` keys added to en/hi/bn.json
- Also fixed 2 pre-existing i18n parity gaps: `admin.gst.notice.widget.loadError` and `dashboard.statsPartialError` (missing from hi/bn)
- Test in `SettingsSections.test.tsx` updated: added `vi.mock('@/lib/subscriptionApi')`, changed assertion from "local only" stub toast to validation-error toast check

**Note (DG-SUB-01):** persisting credentials activates the DB row but does NOT start live billing until DG-SUB-01 (RazorpayHttpClient wiring) is resolved. UI shows an info banner explaining this.

**Build:** clean (0 TS errors, 0 lint warnings)
**Tests:** 1087 pass, 10 pre-existing StatusBadge failures (className format changed from Tailwind classes to CSS vars — not my regression)
