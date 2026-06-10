# Phase 7 Tasks — frontend-dev

> Ownership: `src/admin/` only. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.
> Every task: TanStack Query (no manual fetch), Zod-validated API clients in `src/admin/src/lib/`, all strings through `t()`, zero lint warnings, Vitest coverage, visual QA screenshots.

## HIGH priority

### F1 — Wire Document Queue & Review to real APIs (GAP-010)
- Create `src/admin/src/lib/documentApi.ts` (Zod-validated) against the existing `/documents` group (list w/ filters+pagination, get, categorize, OCR results, admin stats) plus the new review-decision/archive endpoints from backend B15.
- `DocumentQueuePage`: remove `mockDocuments`; real filters (category/status/date/amount), SLA/overdue indicators (B15), pagination, bulk-assign.
- `DocumentReviewPage`: remove `mockFields`; real OCR fields with green/yellow/red confidence (>80 / 50–80 / <50), signed-URL image display, editable fields posting correction deltas (feeds `ocr_feedback`), Approve / Reject(reason) / Need-Clarification mutations with toasts.
- Acceptance: zero `mock` identifiers in `pages/documents/`; tests for queue filters + review mutations; screenshots attached.

### F2 — Wire ITC Mismatch page (GAP-011)
- Replace `mockMismatches` with the real reconciliation endpoints (`ReconcileItc`, `GetItcMismatches`); group by mismatch cause (timing / rounding / GSTIN error / genuine); "Create callback" action linking CallbackService; trigger-reconciliation button.
- Acceptance: zero mock data; pagination; tests.

### F3 — Subscription admin completion (GAP-034/036)
- Wire `PaymentGatewaySettings` to `PATCH /subscriptions/config/razorpay` (backend B9).
- Replace hardcoded Settings "Subscription Tiers" stats (4 plans / 1,247 / ₹8.4L) with `/subscriptions/mrr` + real counts.
- New pages: Subscriber List (`/subscriptions/subscribers`) and Invoice Management (`/subscriptions/invoices`) using the already-existing `listInvoices` client; filters, pagination, CSV export.

## MEDIUM priority

### F4 — i18n consolidation (GAP-050)
- Single react-i18next runtime properly initialized (fix the ~13 `useTranslation()` components without init); extract hardcoded strings from DashboardPage, Documents pages, ItcMismatchPage, SettingsPage + sections, LoginPage; backfill `hi` (60 keys) and `bn` (341 keys); add a key-parity unit test.

### F5 — Admin auth hardening (GAP-051)
- Move access token out of `localStorage` to memory; refresh via httpOnly cookie or silent re-auth (coordinate with backend's existing `/auth/token/refresh`); CSRF protection; session restored across reloads without persisting the JWT.

### F6 — System Health honesty (GAP-052)
- Remove fabricated metrics from DashboardPage (lines ~446–451); wire to the devops-exposed monitoring proxy when available (D6); until then show real queue depths only (documents pending, DLQ count from `notificationApi`); delete the stale "mock" comment at line 35.

### F7 — Tax Rate Configuration page (GAP-022)
- New `/settings/tax-rates` page over the versioned `gst.tax_rates` + ITR slab config endpoints (backend support): effective-dated versions, preview of impact, audit trail display. This delivers the "zero code deployments for rate changes" principle.

### F8 — Notification Template Manager (GAP-037)
- New `/settings/notification-templates` page (event × channel × language editor, variable placeholder helper, preview + test-send) over backend B14.

### F9 — HSN/SAC Manager page (GAP-038)
- Standalone `/settings/hsn-sac` page: search (reuses typeahead), edit description, activate/deactivate; pagination over the ~12k dataset.

### F10 — Permission catalog truthfulness (GAP-054)
- Wire `isActive` toggle and `roleCount` to backend B12; remove optimistic-only behavior.

### F11 — Security/UX fixes
- SEC-042: move GST notice draft autosave from `localStorage` to sessionStorage or server draft.
- I1.1-INFO-001 / I1.4A-INFO-001: output-encode permission descriptions and reference-data names where rendered.

## LOW priority

### F12 — Callback role narrowing (GAP-053)
- Apply RoleGuard/Can per matrix (KPI page = SUPER_ADMIN + OPERATIONS_MANAGER; list/detail = CA + Support + Ops); remove the four `TODO Phase 6F` comments (3 pages + Sidebar).

### F13 — UX debt batch (GAP-055)
- PlanDialog reset on reopen; HsnSacTypeahead keyboard navigation; NoticeDetailPage `maxLength={500}`; Menu Management drag-to-reorder; fix "Pending Invites" display bug.
