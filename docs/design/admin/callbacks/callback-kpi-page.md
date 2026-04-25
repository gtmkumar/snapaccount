# CallbackKpiPage — Admin Callback KPI Dashboard

> **Route:** `/admin/callbacks/kpi`
> **File:** `src/admin/src/pages/callbacks/CallbackKpiPage.tsx`
> **Phase:** 6E
> **Role gating:** Admin + Ops Lead (CAs see limited view with only their own metrics)
> **Chart style:** matches `DashboardPage` — same chart library, colors drawn from `color.module.*` and status tokens.

---

## 1. Purpose & user goals

**Purpose:** Operational health dashboard for the callback system — volume, speed, SLA compliance, team load balance.

**Primary goals:**
1. Answer "are we keeping up?" in ≤5 seconds.
2. Spot SLA breaches and workload hotspots fast.
3. Compare week-over-week trend.
4. Drill into any metric to a filtered CallbackListPage.

---

## 2. Layout (desktop ≥1280px)

```
┌─ Top bar ────────────────────────────────────────────────────────────────┐
│ Callback KPIs                              [Range: Last 7 days ▾] [↻]    │
├─ KPI row (4 MetricCards) ───────────────────────────────────────────────┤
│ ┌──Open──┐ ┌Avg TTR─┐ ┌SLA Comp.┐ ┌Completed┐                            │
│ │  42    │ │ 2h 14m │ │  94.3%  │ │   128   │                            │
│ │ +8 W/W │ │ -12m   │ │ +1.2 pp │ │  +17    │                            │
│ └────────┘ └────────┘ └─────────┘ └─────────┘                            │
├─ Row 1 (2 charts) ──────────────────────────────────────────────────────┤
│ ┌─ Status distribution (stacked bar by day) ─┐ ┌─ Daily volume ────┐   │
│ │ 100% │ ████████████████████                 │ │    (line chart)   │   │
│ │  80% │ ████████████████████                 │ │                   │   │
│ │  60% │ ████████████████████                 │ │                   │   │
│ │  40% │ ████████████████████                 │ │                   │   │
│ │  20% │ ████████████████████                 │ │                   │   │
│ │   0% │─M─T─W─T─F─S─S────────                │ │                   │   │
│ └─────────────────────────────────────────────┘ └───────────────────┘   │
├─ Row 2 (2 charts) ──────────────────────────────────────────────────────┤
│ ┌─ TTR distribution (histogram) ──────────────┐ ┌─ Category mix ────┐   │
│ │                                              │ │   (donut chart)   │   │
│ └──────────────────────────────────────────────┘ └───────────────────┘   │
├─ Row 3 (table) ─────────────────────────────────────────────────────────┤
│ Team performance                                                         │
│ Handler │ Assigned │ Completed │ Avg TTR │ SLA % │ Follow-ups │         │
│ ...                                                                     │
├─ Row 4 (table) ─────────────────────────────────────────────────────────┤
│ SLA breaches (last 7d)                                                   │
│ Callback │ User │ Category │ Breach │ Duration │                        │
│ ...                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Responsive
- **1024–1279px:** KPI row wraps 2×2; charts go to single column.
- **768–1023px:** stacked; tables horizontal-scroll.
- **<768px:** KPI cards single column; charts simplified (drop secondary series); tables collapse to top-5 rows with "View all" link to list page.

---

## 3. Metric cards (KPI row)

Uses existing `MetricCard` component (component-library §2.2). Four cards:

| # | Metric | Value | Delta | Drill-down filter (on click) |
|---|---|---|---|---|
| 1 | Open callbacks | count of status ∈ {PENDING, SCHEDULED, IN_PROGRESS, FOLLOW_UP_NEEDED, ESCALATED_TO_CA} | Δ vs previous period | List page with status=open |
| 2 | Avg time-to-resolve | mean duration from REQUESTED → COMPLETED | Δ as signed minutes | List page status=COMPLETED |
| 3 | SLA compliance % | (not-breached / total) × 100 for completed in period | Δ as percentage points | List page breached=1 |
| 4 | Completed (period) | count of COMPLETED in range | Δ vs previous period | List page status=COMPLETED |

### 3.1 Delta visual
- Positive delta (improvement): `color.success.600` text + up arrow.
- Negative delta: `color.error.600` text + down arrow.
- "Positive" direction depends on metric (lower TTR is good; higher SLA % is good; `MetricCard.invert` prop handles this).

### 3.2 Range selector
- Dropdown: Last 24h, Last 7 days (default), Last 30 days, This FY, Custom…
- Custom opens `DatePicker` range.
- Applies to every chart/table on the page.

---

## 4. Charts

All charts use the same library as `DashboardPage` (Recharts). Colors map to tokens so light/dark modes work:

### 4.1 Status distribution — stacked bar per day
- X: day bucket in range.
- Y: count, stacked by status.
- Stack order (bottom → top): PENDING → SCHEDULED → IN_PROGRESS → FOLLOW_UP_NEEDED → ESCALATED_TO_CA → COMPLETED → CANCELLED.
- Color per stack: matches badge `StatusBadge` variants from CallbackListPage spec §5.1.
- Tooltip: shows all statuses + total; click bar → filter list page by that day + status hovered.
- Legend: interactive; click toggles series.

### 4.2 Daily volume — line + area
- X: day.
- Y: count requested.
- Two series: "Requested" (`color.brand.500`), "Completed" (`color.success.500`).
- Area fill `color.brand.100` under "Requested" line.
- Tooltip shows both values and the gap.

### 4.3 TTR distribution — histogram
- X: buckets (0–15m, 15–30m, 30–60m, 1–2h, 2–4h, 4–8h, 8–24h, >24h).
- Y: count of completed.
- Fill: `color.brand.500`; bucket ≤ SLA target highlighted in `color.success.500`, bucket > SLA target in `color.error.500`.
- Reference vertical line at SLA target (configurable per category; overlay if mixed).

### 4.4 Category mix — donut
- Slices per category using `color.module.*` tokens (GST violet, ITR cyan, Loan orange, Docs indigo, Billing neutral-600, Other neutral-400).
- Center label: total count.
- Legend right-side on desktop; bottom on tablet.

---

## 5. Team performance table

| Column | Content |
|---|---|
| Handler | `Avatar` + name + role chip |
| Assigned | count in period |
| Completed | count |
| Avg TTR | duration |
| SLA % | 0–100 with color-coded text (≥95 green, 85–95 amber, <85 red) |
| Follow-ups | count with FOLLOW_UP_NEEDED outcome |

- Sortable columns; default sort by Completed desc.
- Click handler row → list page filtered `assigned=<handlerId>`.
- Empty state: "No data for this range."

---

## 6. SLA breaches table

| Column | Content |
|---|---|
| Callback | `#CB-id` (link) |
| User | avatar xs + name |
| Category | `Badge` module color |
| Breach amount | e.g. "+42m past SLA" in `color.error.600` |
| Resolved in | total duration |

- Rows sorted by breach magnitude desc.
- Limit 20 rows; "View all breaches" link → list page `breached=1&range=<current>`.

---

## 7. States

### 7.1 Loading
- KPI row: 4× `SkeletonMetricCard`.
- Charts: grey rectangles with centered `Spinner`.
- Tables: `SkeletonText` rows.

### 7.2 Empty
- When no callbacks in range: centered `EmptyState` occupying full page area with "No callbacks in this range" + CTA "Change range".

### 7.3 Error
- Per-widget `ErrorState` inline with Retry — do NOT fail the whole page if one chart errors.

### 7.4 Stale (>60s since refresh)
- Auto-refresh every 60s (TanStack Query `refetchInterval`).
- Indicator "Updated 12s ago" in top bar; click ↻ to force refresh.

---

## 8. Accessibility

- Each chart has an `aria-label` description AND an accessible data table toggle ("View as table" link) for screen readers.
- Chart colors paired with patterns in high-contrast mode (stacked bar uses hatching patterns for colorblind users).
- KPI card delta arrows include sr-only text: "up 8 week over week" / "down 12 minutes".
- Range selector: `Combobox` pattern with `aria-controls` pointing to page main.
- Drill-down clicks announce before navigation: "Filtering callback list by <filter>".

---

## 9. i18n keys (en, hi, bn)

```
admin.callbacks.kpi.title
admin.callbacks.kpi.range.24h
admin.callbacks.kpi.range.7d
admin.callbacks.kpi.range.30d
admin.callbacks.kpi.range.fy
admin.callbacks.kpi.range.custom
admin.callbacks.kpi.refresh
admin.callbacks.kpi.updatedAgo          # "Updated {time} ago"
admin.callbacks.kpi.metric.open
admin.callbacks.kpi.metric.avgTtr
admin.callbacks.kpi.metric.slaCompliance
admin.callbacks.kpi.metric.completed
admin.callbacks.kpi.metric.deltaWw       # "{sign}{value} vs last period"
admin.callbacks.kpi.chart.statusDist
admin.callbacks.kpi.chart.dailyVolume
admin.callbacks.kpi.chart.ttrHistogram
admin.callbacks.kpi.chart.categoryMix
admin.callbacks.kpi.chart.seriesRequested
admin.callbacks.kpi.chart.seriesCompleted
admin.callbacks.kpi.chart.viewAsTable
admin.callbacks.kpi.team.title
admin.callbacks.kpi.team.col.handler
admin.callbacks.kpi.team.col.assigned
admin.callbacks.kpi.team.col.completed
admin.callbacks.kpi.team.col.avgTtr
admin.callbacks.kpi.team.col.sla
admin.callbacks.kpi.team.col.followUps
admin.callbacks.kpi.breaches.title
admin.callbacks.kpi.breaches.col.callback
admin.callbacks.kpi.breaches.col.user
admin.callbacks.kpi.breaches.col.category
admin.callbacks.kpi.breaches.col.breach
admin.callbacks.kpi.breaches.col.resolvedIn
admin.callbacks.kpi.breaches.viewAll
admin.callbacks.kpi.empty.title
admin.callbacks.kpi.empty.body
```

---

## 10. API / data contract

- `GET /callbacks/kpi?range=7d&category=&assigned=` → `{ open, avgTtrSeconds, slaCompliance, completed, deltas: {...}, statusDistribution: [...], dailyVolume: [...], ttrHistogram: [...], categoryMix: [...], teamPerformance: [...], slaBreaches: [...] }`.
- Backend aggregates from `callback.kpi_daily_snapshot` materialized view (db-engineer owned).
- TanStack Query: `['callback-kpi', rangeParams]` with 60s refetch.

*End of CallbackKpiPage spec.*
