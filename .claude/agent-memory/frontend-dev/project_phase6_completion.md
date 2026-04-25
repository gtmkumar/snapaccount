---
name: Phase 6A+6E Frontend Completion
description: Phase 6A (GstReturnReviewPage real data + ARN + audit trail) and Phase 6E (Callbacks UI + NotificationCenter) completion state and key patterns discovered
type: project
---

Phase 6A+6E frontend admin panel work completed on 2026-04-25.

**Phase 6A deliverables:**
- `src/lib/gstApi.ts` — Zod-validated API functions: getGstReturn, getGstReturnAudit, saveGstReturnArn, submitGstReturnForFiling, flagGstReturnRevision, list/create/approve/assign functions
- `GstReturnReviewPage.tsx` — fully rewired to real API, ARN capture section (FILED/REVISION_NEEDED only), collapsible audit trail panel with IST timestamps
- ARN regex: `^[A-Z]{2}\d{2}[A-Z0-9]{12}$`
- AuditTrailPanel renders TWICE for responsive layout: `xl:hidden` in main column (tablet/mobile), `hidden xl:block` in right rail (desktop) — causes all tests to find multiple elements

**Phase 6E deliverables:**
- `src/lib/callbackApi.ts` — Zod schemas + API functions for full callback lifecycle
- `src/lib/notificationApi.ts` — Notification inbox, preferences, push token registration
- `src/pages/callbacks/CallbackListPage.tsx` — filters, dual mobile/desktop render, stats strip, density toggle, SLA indicator, pagination
- `src/pages/callbacks/CallbackDetailPage.tsx` — state machine transitions, note composer, timeline stepper, ConfirmDialog via Modal(open=)
- `src/pages/callbacks/CallbackKpiPage.tsx` — Recharts charts (Bar, Area, Pie), team performance table, SLA breaches, range selector, 60s refetch
- `src/components/shared/NotificationCenter.tsx` — bell button, unread badge, grouped-by-day dropdown, category filters, mark-all-read
- Router, sidebar wired; TODO Phase 6F comments for role-gating

**Dual-render test pattern (IMPORTANT):**
Any component that renders UI elements twice for responsive layout (mobile cards + desktop table, or xl:hidden + hidden:xl:block sections) will cause `findByText/getByText` to throw "Found multiple elements". ALWAYS use `findAllByText()[0]` / `getAllByText()` / `findAllByText()` and check `length > 0` in these test files. Pattern confirmed in GstReturnReviewPage, CallbackListPage.

**Pre-existing failing tests (not introduced by Phase 6):**
- `StatusBadge.test.tsx` — checks `bg-{color}-100` but component uses `bg-{color}-50`
- `Button.test.tsx` — checks `bg-brand-500` but component uses gradient classes
- `DocumentQueuePage.test.tsx` — checks `bg-error-100` but component uses `bg-error-50`
These 12 tests were failing before Phase 6 work began.

**i18n setup:**
No react-i18next installed. Custom lightweight `src/i18n/index.ts` reads from JSON files (en/hi/bn), uses localStorage key `snap_locale`, supports `{{param}}` interpolation. All Phase 6 strings in en.json, hi.json, bn.json.

**Zod install note:**
Must use `npm install zod --legacy-peer-deps` due to peer dependency conflicts.

**Why:** Phase 6 backend services (AccountingService, NotificationService, CallbackService) required admin UI wiring to complete the full-stack feature.

**How to apply:** Future phases that add responsive dual-render layouts must write tests using `findAllBy*` variants. New packages require `--legacy-peer-deps`.
