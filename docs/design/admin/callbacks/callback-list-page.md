# CallbackListPage — Admin Callback Queue

> **Route:** `/admin/callbacks`
> **File:** `src/admin/src/pages/callbacks/CallbackListPage.tsx`
> **Phase:** 6E
> **Role gating:** CA + Admin + Ops (role-guard stub acceptable; real RBAC in 6F)
> **Design system:** tokens in `docs/design/tokens.json`, components in `docs/design/component-library.md`.

---

## 1. Purpose & user goals

**Purpose:** Queue view for callback handlers (CAs, ops) to triage, assign, and work through user callback requests with SLA visibility.

**Primary user goals:**
1. See all open callbacks sorted by priority and SLA breach.
2. Filter down to "mine", a specific category, or SLA-breached items fast.
3. Claim / reassign a callback in one action.
4. Open detail in a side-sheet or full page without losing queue context.

**Secondary goals:** bulk-assign, export for reporting, jump to KPI dashboard.

---

## 2. Layout (desktop ≥1280px)

```
┌─ Top bar ───────────────────────────────────────────────────────────────────┐
│ Callbacks                               [📊 KPI] [↧ Export] [+ New (intern)]│
├─ Filter bar ────────────────────────────────────────────────────────────────┤
│ Status ▾  Category ▾  Priority ▾  Assigned ▾  [☐ SLA breached only]  🔍 …  │
├─ Stats strip (4 mini metrics) ──────────────────────────────────────────────┤
│ [Open 42] [Scheduled 18] [Breached 3] [Avg TTR 2h 14m]                      │
├─ Table ─────────────────────────────────────────────────────────────────────┤
│ ☐ │ User        │ Category │ Priority │ Status     │ Requested  │ SLA │ …  │
│ ☐ │ Rajesh M.   │ GST      │ HIGH     │ PENDING    │ 2m ago     │ 🟢  │ ⋯  │
│ ☐ │ Priya K.    │ ITR      │ URGENT   │ SCHEDULED  │ 14m ago    │ 🟡  │ ⋯  │
│ ☐ │ Arun V.     │ LOAN     │ NORMAL   │ IN_PROGRESS│ 1h 8m ago  │ 🔴  │ ⋯  │
│ …                                                                           │
├─ Pagination + density toggle ───────────────────────────────────────────────┤
│ [◀ Prev] Page 1 of 4 [Next ▶]                     Density: [Roomy] [Dense] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Responsive collapsing

- **≥1280px:** full table as above.
- **1024–1279px:** drop the "Assigned" column into the `⋯` row-menu; filter bar wraps to two rows.
- **768–1023px:** switch to stacked card list — each card shows user, category chip, priority, status badge, requested time, breach indicator. No bulk-select.
- **<768px:** Not supported as primary admin surface; show message "Use desktop for callback queue" with link to KPI page (mobile-friendly). Admin is desktop-first per design system rules.

---

## 3. Filter bar

All filters are multi-select dropdowns (`Select` component with multi-select variant) except the SLA-breach toggle.

| Filter | Options | Default | URL param |
|---|---|---|---|
| Status | PENDING, SCHEDULED, IN_PROGRESS, COMPLETED, FOLLOW_UP_NEEDED, ESCALATED_TO_CA, CANCELLED | `[PENDING, SCHEDULED, IN_PROGRESS]` (open only) | `status` |
| Category | GST, ITR, DOC, LOAN, BILLING, OTHER | (all) | `category` |
| Priority | LOW, NORMAL, HIGH, URGENT | (all) | `priority` |
| Assigned to | "Me", "Unassigned", (list of teammates) | (all) | `assigned` |
| SLA breached only | toggle | false | `breached=1` |
| Search | free text by user name / phone / GSTIN / linked-entity id | empty | `q` |

Filters persist in URL query string for shareable links. "Clear all" `GhostButton` at the right of the filter row when any filter is non-default.

---

## 4. Column specification

| # | Column | Width (roomy / dense) | Content | Sort |
|---|---|---|---|---|
| 1 | Checkbox | 44 / 36 | Bulk-select | no |
| 2 | User | 200 / 160 | `Avatar` xs + name + phone (mono, `fontSize.xs`) | by name |
| 3 | Category | 110 / 90 | `Badge` variant per category (see §5) | yes |
| 4 | Priority | 100 / 80 | `Badge` with priority color (see §5) | yes |
| 5 | Status | 160 / 130 | `StatusBadge` (see §5) | yes |
| 6 | Requested | 130 / 100 | Relative time + tooltip with absolute IST | default sort (desc) |
| 7 | SLA | 80 / 60 | Traffic-light dot + time-to-breach (e.g., "1h 12m" or "Breached 18m") | yes |
| 8 | Assigned to | 160 / 130 | `Avatar` xs + short name OR "Unassigned" in `color.neutral.400` | yes |
| 9 | Linked entity | 180 / 140 | Module icon + entity id, e.g., "GSTR-3B · Mar 2026" | no |
| 10 | Row actions `⋯` | 44 / 36 | Menu: Claim, Assign to…, Schedule, Escalate, Cancel, View | no |

### 4.1 Density variants
- **Roomy** (default): 64px row height, `spacing.4` padding, full avatars, two-line user cell.
- **Dense**: 44px row height (still meets 44pt-equivalent click target for row actions via full-row hit), `spacing.2` padding, single-line cells, avatars hidden (name only).

Density toggle stored in `localStorage` per user.

---

## 5. Badge variant map

All reuse existing `Badge` / `StatusBadge` tokens — no new colors.

### 5.1 Callback **status** — extends `StatusBadge`

Append the following block to `docs/design/component-library.md` §2.5 under "Phase 6E — Callback statuses":

| Status | Color variant | Icon |
|---|---|---|
| PENDING | `warning` (bg `color.warning.100`, text `color.warning.700`) | `clock` |
| SCHEDULED | `info` (bg `color.info.100`, text `color.info.700`) | `calendar` |
| IN_PROGRESS | `brand` (bg `color.brand.100`, text `color.brand.700`) | `phone-call` |
| COMPLETED | `success` (bg `color.success.100`, text `color.success.700`) | `check-circle` |
| FOLLOW_UP_NEEDED | `accent` (bg `color.accent.100`, text `color.accent.700`) | `rotate-ccw` |
| ESCALATED_TO_CA | `error` (bg `color.error.100`, text `color.error.700`) | `arrow-up-circle` |
| CANCELLED | `neutral` (bg `color.neutral.100`, text `color.neutral.500`), strikethrough label | `x` |

All text-on-background pairs above meet WCAG 2.1 AA (verified against tokens: 700-on-100 shades ≥ 4.5:1 contrast).

### 5.2 Category badges (reuse module colors)

| Category | Color | Label |
|---|---|---|
| GST | `color.module.gst` | GST |
| ITR | `color.module.itr` | ITR |
| DOC | `color.module.docs` | Docs |
| LOAN | `color.module.loan` | Loan |
| BILLING | `color.neutral.600` | Billing |
| OTHER | `color.neutral.400` | Other |

### 5.3 Priority badges

| Priority | Visual |
|---|---|
| LOW | `neutral` ghost (outline, `color.neutral.500`) |
| NORMAL | `neutral` filled (bg `color.neutral.100`) |
| HIGH | `warning` filled |
| URGENT | `error` filled with pulsing 6px ring (2s loop) |

### 5.4 SLA dot
- 🟢 green (`color.success.500`): > 50% of SLA window remaining.
- 🟡 amber (`color.warning.500`): 10–50% remaining.
- 🔴 red (`color.error.500`): < 10% remaining OR breached.
- Dot paired with text ("1h 12m" remaining, or "Breached 18m ago") — never color alone (accessibility).

---

## 6. Row actions

Row `⋯` menu (opens on click or keyboard `Enter`; uses existing `Menu` component):

- **Open detail** (default on row click; opens side-sheet 640px on desktop, full page on tablet).
- **Claim** (disabled if assigned to others) — assigns to current user, transitions PENDING → SCHEDULED implicit "now+30min" default.
- **Assign to…** — opens user picker modal.
- **Schedule** — opens schedule dialog (date + time window picker).
- **Escalate to CA** — opens confirm modal; transitions to ESCALATED_TO_CA.
- **Cancel** — opens confirm modal with required reason text; transitions to CANCELLED.
- **View linked entity** — deep link to GST return / ITR filing / document / loan.

Bulk actions bar appears when ≥1 row selected (sticky top): "Assign", "Schedule", "Cancel", "Clear selection". Max 50 selections per batch.

---

## 7. States

### 7.1 Loading
- First load: full-table `SkeletonLoader` with 10 rows.
- Filter/page change: 300ms delay before showing skeleton (avoid flash), otherwise keep stale data with top progress bar (`ProgressBar` indeterminate).

### 7.2 Empty
- No callbacks at all: `EmptyState` with illustration "clipboard-check" icon, title "No callbacks yet", body "User callback requests will appear here."
- Empty due to filters: same layout with body "No callbacks match these filters" and `GhostButton` "Clear filters".

### 7.3 Error
- `ErrorState` component centered in table area with `Retry` CTA. Top-of-page `AlertBanner` type=error persists after retry fail.

### 7.4 Realtime update indicator
- When a new callback arrives via WebSocket/SignalR, prepend row with a 2s `color.brand.50` highlight fade.
- Badge "New" (accent color) on the row for 60 seconds until acknowledged.

---

## 8. Accessibility

- Table uses `<table>` with `<thead>` `<th scope="col">` and sortable columns as `<button>` inside `<th>` with `aria-sort` values.
- Row selection checkboxes have `aria-label="Select callback from <user name>"`.
- Row-action menu: `<button aria-haspopup="menu" aria-expanded>`.
- Keyboard: `Tab` moves across filter bar → table → pagination. Arrow keys navigate rows when focus is in table body. `Space` toggles row checkbox. `Enter` on a row opens detail.
- SLA dot has `aria-label="SLA status: <breach state>, <time remaining>"`.
- Focus ring: 2px `color.brand.500` outline with 2px offset on all interactive elements.
- Color contrast: all badges verified above 4.5:1; SLA dot paired with text label.

---

## 9. i18n keys (en, hi, bn)

```
admin.callbacks.title
admin.callbacks.cta.kpi
admin.callbacks.cta.export
admin.callbacks.cta.newInternal
admin.callbacks.filter.status
admin.callbacks.filter.category
admin.callbacks.filter.priority
admin.callbacks.filter.assigned
admin.callbacks.filter.breachedOnly
admin.callbacks.filter.search
admin.callbacks.filter.clearAll
admin.callbacks.stats.open
admin.callbacks.stats.scheduled
admin.callbacks.stats.breached
admin.callbacks.stats.avgTtr
admin.callbacks.column.user
admin.callbacks.column.category
admin.callbacks.column.priority
admin.callbacks.column.status
admin.callbacks.column.requested
admin.callbacks.column.sla
admin.callbacks.column.assigned
admin.callbacks.column.linked
admin.callbacks.density.roomy
admin.callbacks.density.dense
admin.callbacks.empty.title
admin.callbacks.empty.body
admin.callbacks.emptyFiltered.body
admin.callbacks.rowAction.claim
admin.callbacks.rowAction.assign
admin.callbacks.rowAction.schedule
admin.callbacks.rowAction.escalate
admin.callbacks.rowAction.cancel
admin.callbacks.rowAction.viewLinked
admin.callbacks.bulk.assign
admin.callbacks.bulk.schedule
admin.callbacks.bulk.cancel
admin.callbacks.bulk.clear
admin.callbacks.sla.remaining       # "{time} remaining"
admin.callbacks.sla.breached        # "Breached {time} ago"
admin.callbacks.status.pending
admin.callbacks.status.scheduled
admin.callbacks.status.inProgress
admin.callbacks.status.completed
admin.callbacks.status.followUpNeeded
admin.callbacks.status.escalatedToCa
admin.callbacks.status.cancelled
admin.callbacks.priority.low
admin.callbacks.priority.normal
admin.callbacks.priority.high
admin.callbacks.priority.urgent
admin.callbacks.category.gst
admin.callbacks.category.itr
admin.callbacks.category.doc
admin.callbacks.category.loan
admin.callbacks.category.billing
admin.callbacks.category.other
```

---

## 10. API / data contract

- `GET /callbacks?status=&category=&priority=&assigned=&breached=&q=&page=&size=&sort=`
- Response: `{ items, page, total, summary: { open, scheduled, breached, avgTtrMinutes } }`
- TanStack Query key: `['callbacks', filterParams, pageParams]`.
- Realtime: SignalR `/hubs/callbacks` group by org — events: `callback.created`, `callback.updated`, `callback.assigned`.

*End of CallbackListPage spec.*
