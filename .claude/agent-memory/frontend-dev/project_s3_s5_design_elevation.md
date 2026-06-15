---
name: project_s3_s5_design_elevation
description: S3 skeleton/empty-state sweep and S5 dashboard hierarchy redesign from design-elevation-spec.md
metadata:
  type: project
---

S3 and S5 design elevation slices implemented (task #26 admin remainder, 2026-06-11).

**S3 — Skeleton / empty-state sweep (pages fixed):**
- `UserDetailPage.tsx` — "Loading user…" text → two Skeleton variants (card+dataTableDense); error → EmptyState generic; 4x inline "No X" text strings → EmptyState or t() tokens
- `LoansListPage.tsx` — KpiStrip `animate-pulse` blocks → `Skeleton variant="card"` with aria-busy
- `loans/PartnerBanksSettingsPage.tsx` — `animate-pulse` blocks → `Skeleton variant="card"`; empty state → EmptyState generic
- `settings/sections/PartnerBanksSettings.tsx` — "Loading partner banks…" text → Skeleton list; "No partner banks…" text → EmptyState generic; error → AlertBanner with t() strings
- `callbacks/CallbackKpiPage.tsx` — all 6 `animate-pulse` chart/table blocks → Skeleton (chart or dataTableDense); "No data" text → EmptyState generic; error banner → EmptyState with retry CTA

Pages already correctly using Skeleton/EmptyState (no changes needed):
- StaffTab, WorkloadTab, EditLogPage, ImsInboxPage, AuditLogPage, RolesPermissionsPage, OrganizationsPage, SubscriptionsPage, SettingsPage + most settings sections

**S5 — Dashboard hierarchy redesign:**
DashboardPage.tsx fully rewritten with 3-tier layout per spec §4.1:
- Tier 1: "Needs attention now" — pending docs (threshold-gated), GST due today (urgent), open callbacks — each a role="group" with accessible name, icon+text for urgent state (not colour-only)
- Tier 2: Compact KPI strip — ITR verifications, active loans, NoticesDueWidget (2-cell span)
- Tier 3: Tabbed panel (progressive disclosure) — Activity chart, Chat Queue, Team Workload — each tab follows ELG-1 ARIA pattern (role=tablist/tab/tabpanel, aria-selected, aria-controls)
- Queue mini-widgets (GST/ITR/Loan) carry SampleDataBadge per STATIC-DATA-DEBT-7
- Failed metrics render "0" (from nullish coalescing), never fabricated
- Period selector scoped to Activity tab, not entire page

**New i18n keys:** 72 dashboard.* keys, 5 partnerBanks.settings.* keys, 3 loansList.* keys, 5 userDetail.* keys, 4 callbackKpi.* keys — all in en.json, hi.json, bn.json (parity).

**Tests fixed:**
- CallbackKpiPage.test: "No data" → "No data for this range" (i18n key resolved); .animate-pulse → .skeleton-shimmer
- LoansListPage.test: .animate-pulse → .skeleton-shimmer
Result: 1007/1007 tests, 0 lint warnings, build success.

**Why:** neutral-400 text and animate-pulse blocks were ad-hoc patterns diverging from the canonical Skeleton/EmptyState components. Design elevation spec S3 mandates shaped skeletons and designed empty states on all data-backed screens. Dashboard S5 improves scannability so operators can act on urgent items without scrolling.

**tokens.json:** docs/design/tokens.json is at v2.0.0 and owned by ui-ux-agent. A v2.1.0 bump is documented in the spec as WP-T3 for ui-ux-agent — we left it alone.
