# Web Admin Screens: Dashboard (Screen 58)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 58: Admin Dashboard

**Purpose:** Central operations overview — pending work queues, KPIs, team workload, daily activity.

**Roles:** Operations Manager, System Admin (full view); CA, Support Executive, Data Entry Operator (role-filtered view)

**Layout:**
```
[Sidebar: expanded, all nav items visible]
[Top bar: Breadcrumb "Dashboard" | Date/time | Notifications bell | User avatar + name]
---
[Main content area: scrollable]

[Row 1: Urgency KPI cards — 5 cards]
  [MetricCard: "Pending Documents" — count, warning if >50, link to Document Queue]
  [MetricCard: "GST Returns Due Today" — count, error if any, link to GST Filing Queue]
  [MetricCard: "ITR Verifications Pending" — count, link to ITR Queue]
  [MetricCard: "Open Callbacks" — count, link to Callback Queue]
  [MetricCard: "Loan Applications Active" — count, link to Loan Queue]

[Row 2: Daily Activity Chart — full width]
  [Line chart: Documents processed / Returns filed / ITRs verified — last 7 days]
  [Legend: colored lines per metric]
  [Today highlighted with vertical line]
  [Period selector: 7D / 30D / 90D]

[Row 3: Two columns — Team Workload + Chat Queue]

  [Left: Team Workload table]
    [Columns: Staff Name | Role | Assigned Today | Completed | SLA Breaches]
    [Rows: one per active staff member]
    [SLA breach count: red badge if > 0]
    [Link: "View full team" → Staff List screen]

  [Right: Live Chat Queue]
    [Active conversations: list with user name, query type, wait time]
    [Wait time > 15 min: warning color]
    [Unassigned: orange badge, "Assign" button per item]
    [Link: "Open Chat Dashboard" → Chat Management screen]

[Row 4: Three columns — GST Queue + ITR Queue + Loan Queue]

  [GST Queue mini-widget]
    [Count by status: Draft / Pending / Overdue]
    [Overdue items: error color with count]
    [PrimaryButton: "Open GST Queue"]

  [ITR Queue mini-widget]
    [Count by status]
    [Upcoming deadline items highlighted]
    [PrimaryButton: "Open ITR Queue"]

  [Loan Queue mini-widget]
    [Count by status: Active / Under Review / Decision Pending]
    [PrimaryButton: "Open Loan Queue"]

[Row 5: System Health (System Admin only)]
  [Metrics: API response time | Error rate | OCR queue depth | DB connections]
  [Green/Yellow/Red indicators per metric]
  [Link: "System Health Dashboard"]

[Row 6: Recent Audit Events (compact)]
  [Last 10 audit log entries: timestamp | user | action]
  [Link: "View full audit log"]
```

**Key Components:**
- MetricCard (x5), Chart (line chart), Table (team workload)
- Badge, AlertBanner, PrimaryButton, GhostButton
- Live data refresh indicators (auto-refresh 30s)

**Navigation:**
- Arrives: Post-login (default landing) or Sidebar "Dashboard"
- Exits to: All linked queue/management screens

**Key Interactions:**
- MetricCard click → direct link to relevant queue with pre-applied filters
- Chart: Hover tooltips with exact values, click data point to see details
- Team workload: Click staff row → Staff detail page
- Chat queue: Click conversation → Chat management interface
- Auto-refresh: Data refreshes every 30 seconds, subtle "Last updated X sec ago" indicator
- Refresh button: Manual refresh (spinning arrow icon, top right of each widget)

**Role-filtered view:**
- **Data Entry Operator:** Only sees Document Queue widget and their own workload
- **Support Executive:** Sees Callback Queue, Chat Queue, GST/ITR status
- **CA:** Sees GST Queue, ITR Queue, Chat Queue (their assigned cases)
- **Operations Manager:** Full view
- **System Admin:** Full view including System Health row
- **Partner Bank Rep:** Only sees Loan Application widget (their bank's applications)

**Loading state:** All widgets show SkeletonMetricCard and SkeletonTable while fetching

**Data display notes:**
- All amounts in INR Indian format
- Timestamps in IST (Indian Standard Time) — always show IST label
- Pending items counts should be zero-indexed where 0 = good state (green)
