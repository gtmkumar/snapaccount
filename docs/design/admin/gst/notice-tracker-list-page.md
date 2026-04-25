# NoticeTrackerListPage — Admin Spec

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Route:** `/admin/gst/notices`
> **Code target:** `src/admin/src/pages/gst/NoticeTrackerPage.tsx`
> **Design system:** extends `docs/design/component-library.md`, `docs/design/tokens.json`. No new tokens.

---

## 1. Purpose

Single source of truth for every GST notice received by orgs the operator (CA / Admin) is responsible for. Surface deadline pressure, ownership gaps, and status so notices are never missed.

## 2. User goal

> "As a CA, I need to see every open GST notice for my client orgs ranked by due date so I can plan response work and never miss a statutory deadline."

## 3. Role gating

| Role | Visibility |
|---|---|
| `ADMIN` | All notices, all orgs |
| `CA` | Notices for orgs where they are assigned (assignments table from 6E callback ownership) |
| `ORG_OWNER` | Notices for their own orgs only (read-only — no Assign / Respond action) |
| `ORG_MEMBER` | Hidden — page returns 403, nav item suppressed |

> Recommended (flagged for security-reviewer + frontend-dev): default visibility = `CA + ADMIN`. `ORG_OWNER` reads through a separate org-scoped view in 6F.

## 4. Layout (≥1024px)

```
┌─ TopBar (existing AdminShell) ─────────────────────────────────────┐
├─ Sidebar ┬─ PageHeader ────────────────────────────────────────────┤
│          │  GST Notices                                             │
│          │  <breadcrumbs: GST › Notices>           [+ Upload Notice]│
│          ├──────────────────────────────────────────────────────────┤
│          │ ┌─ FilterBar (sticky) ──────────────────────────────┐   │
│          │ │ [Status ▾] [GSTIN ▾] [Due ▾] [Assignee ▾] [Search]│   │
│          │ │ Active filters: chips + [Clear all]               │   │
│          │ └───────────────────────────────────────────────────┘   │
│          │                                                          │
│          │ ┌─ DataTable ───────────────────────────────────────┐   │
│          │ │ ☐ │Notice #│Type│GSTIN  │Received│Due ▼│Status│CA│⋮│  │
│          │ │ ───────────────────────────────────────────────── │   │
│          │ │ ☐ │GST/24/.│ASMT│27ABC..│15 Apr  │D-2 ⚠│Under │PR│⋮│  │
│          │ │ ☐ │GST/24/.│DRC │29XYZ..│10 Apr  │D-7  │Recvd │— │⋮│  │
│          │ └───────────────────────────────────────────────────┘   │
│          │ Pagination · 25 per page · 142 total                     │
└──────────┴──────────────────────────────────────────────────────────┘
```

Below 1024px: sidebar collapses to drawer. Below 768px: table degrades to `NoticeRowCard` stack (one card per notice, see §6.4).

## 5. Components used

| Region | Component | Source |
|---|---|---|
| Page header | `PageHeader` | component-library §3.x |
| Filter bar | `FilterBar` (Select × N + SearchInput + ChipGroup) | composition of existing primitives |
| Table | `DataTable` | component-library |
| Status pill | `StatusBadge` (notice variants — see §7) | extended below |
| Due-date pill | `DueDateChip` (NEW — see §6.1) | new primitive |
| Row menu | `IconButton` + `DropdownMenu` | existing |
| Empty state | `EmptyState` | existing |
| Skeleton | `SkeletonTable` | existing |
| Bulk-action bar | `SelectionToolbar` (NEW — see §6.2) | new primitive |
| Upload modal | `UploadNoticeModal` (composes `Modal` + `FileUpload` + form fields) | composition |

## 6. New / extended primitives

### 6.1 DueDateChip (NEW)

**Purpose:** compact, color-coded countdown for any deadline cell.

**Props:**
| Prop | Type | Default | Description |
|---|---|---|---|
| `dueDate` | ISO string | required | The deadline |
| `referenceDate` | ISO string | now | For deterministic test rendering |
| `size` | `sm \| md` | `md` | sm used in cards |

**Variants (computed from `dueDate - referenceDate`):**
| Bucket | Days | Color tokens | Label format |
|---|---|---|---|
| Overdue | < 0 | `error.100` bg + `error.700` text + `error.600` left bar | `Overdue · 3d` |
| Critical | 0–2 | `warning.100` + `warning.800` | `Due in 2d` |
| Warning | 3–7 | `warning.50` + `warning.700` | `Due in 5d` |
| Normal | 8–30 | `slate.100` + `slate.700` | `Due 12 May` |
| Far | > 30 | `slate.50` + `slate.600` | `Due 21 Jun` |

**Accessibility:** `aria-label="Due in 2 days, 28 April 2026"` (full label always announced; visible label can be terse).

### 6.2 SelectionToolbar (NEW)

**Purpose:** floats above table when ≥1 row selected. Shows count + bulk actions.

**Actions for notices:** `Assign to CA`, `Mark Under Review`, `Export PDF`, `Cancel`.

States: hidden / visible / pending (action in progress, button shows inline spinner).

### 6.3 Filters (concrete spec)

| Filter | Component | Options |
|---|---|---|
| Status | `Select` (multi) | RECEIVED, UNDER_REVIEW, RESPONDED, CLOSED |
| GSTIN | `Combobox` (searchable) | Org GSTINs the user can see |
| Due | `Select` | All, Overdue, Due this week, Due this month, Custom range (opens DatePicker range) |
| Assignee | `Select` | Unassigned, Me, + each CA in tenant |
| Search | `SearchInput` | Free text — matches notice number, type, body excerpt |

URL state: every filter is reflected in the query string (`?status=RECEIVED,UNDER_REVIEW&due=overdue&assignee=me`) so views are shareable.

Debounce: search 300ms; other filters apply on change.

### 6.4 NoticeRowCard (mobile-web ≤768px)

```
┌────────────────────────────────────────────────┐
│ [StatusBadge: Under review]      [DueDateChip] │
│ GST/24/ASMT/0931                               │
│ ASMT-10 · GSTIN 27ABCDE1234F1Z5                │
│ Recvd 15 Apr · Assigned to Priya R.            │
│                                       [Open ›] │
└────────────────────────────────────────────────┘
```

Whole card is a link to detail page. Min height 88px.

## 7. StatusBadge — Notice variants (extension)

Append to component-library status table:

| Status | Variant | Icon | Notes |
|---|---|---|---|
| `RECEIVED` | `info` (`info.100` + `info.700`) | `inbox` | New, not yet triaged |
| `UNDER_REVIEW` | `warning` (`warning.100` + `warning.800`) | `eye` | Assigned, in progress |
| `RESPONDED` | `accent` (`indigo.100` + `indigo.700`) | `send` | Awaiting officer outcome |
| `CLOSED` | `success` (`emerald.100` + `emerald.700`) | `check-circle` | Officer closed / dropped |

All pairs verified WCAG AA ≥ 4.5:1 against the table row background (`white` / `slate.50` zebra).

## 8. Columns (default order, drag to reorder, hide via column-picker)

| # | Column | Default visible | Sort | Note |
|---|---|---|---|---|
| 1 | Selection checkbox | yes | — | bulk |
| 2 | Notice # | yes | yes | mono font |
| 3 | Type | yes | yes | enum (ASMT-10, DRC-01, …) |
| 4 | GSTIN (org name on hover) | yes | yes | mono, last 4 highlighted |
| 5 | Received | yes | yes | DD/MM/YYYY |
| 6 | Due | yes | **default sort: asc** | DueDateChip |
| 7 | Status | yes | yes | StatusBadge |
| 8 | Assigned CA | yes | yes | Avatar + name; "Unassigned" muted |
| 9 | Last activity | hidden | yes | relative time |
| 10 | Row menu | yes | — | View · Assign · Mark · Download · Archive |

Default sort: **Due date ascending** (most urgent first).

## 9. States

### 9.1 Loading
First load: `SkeletonTable` 8 rows × 9 columns. Filter changes: shimmer on table body only, header + filter bar stay interactive.

### 9.2 Empty (no notices for filter)
`EmptyState` with `inbox` illustration:
- Title: `t('admin.gst.notices.empty.title')` → "No notices match these filters"
- Body: "Try clearing filters or change the date range."
- CTA: `[Clear filters]` (secondary) + `[+ Upload Notice]` (primary).

### 9.3 Empty (no notices ever — first run)
Different EmptyState:
- Title: "No GST notices yet"
- Body: "When the GST department issues an ASMT-10, DRC-01 or any other notice, upload it here so the team can track and respond before the deadline."
- CTA: `[+ Upload Notice]` primary, `[Read CBIC notice guide ↗]` link.

### 9.4 Error
Inline `AlertBanner type=error` above table:
- "Couldn't load notices. [Retry]" — does not unmount the filter bar; keeps URL state intact.

### 9.5 Permission denied
Full-page `EmptyState` with `lock` icon: "You don't have access to GST notices. Contact your admin." — no upload CTA.

## 10. Interactions

- **Row click** anywhere except checkbox / menu → navigate to `NoticeDetailPage` (`/admin/gst/notices/:id`).
- **Cmd/Ctrl-click** on row → open in new tab.
- **Selection** → `SelectionToolbar` slides up from bottom (200ms ease-out); table bottom padding increases to compensate so last row is not hidden.
- **Upload Notice** primary button → opens `UploadNoticeModal`:
  - Fields: GSTIN (Combobox required), Notice number (TextInput required), Notice type (Select required: ASMT-10, ASMT-11, DRC-01, DRC-03, REG-17, others…), Notice date (DatePicker required), Due date (DatePicker required), Body summary (Textarea optional), Attachments (FileUpload, accept=`application/pdf,image/*`, multiple, max 10MB each — see §6.5 in detail page for upload affordance).
  - On submit → POST → returns notice id → close modal → toast "Notice uploaded" with `[View]` action linking to detail.

## 11. Accessibility

- Page `<main>` has `aria-labelledby="gst-notices-title"`.
- Table uses real `<table>` semantics. Sortable headers are `<button>` inside `<th aria-sort="ascending|descending|none">`.
- Each row: `aria-rowindex` + `aria-selected` when checkbox checked.
- Focus order: skip-link → page header → filter bar → search → table → pagination → upload CTA.
- Filter chips: each chip is a focusable `<button aria-label="Remove filter Status: Under review">`.
- DueDateChip: full-text aria-label as in §6.1.
- Touch targets in any responsive view ≥ 44 × 44 pt.
- Live region `aria-live="polite"` announces row count after filter change ("142 notices match").

## 12. Responsive behavior

| Breakpoint | Layout |
|---|---|
| ≥1280px | Full table, all default columns visible |
| 1024–1279 | Hide "Last activity" column even if user enabled it (forced) |
| 768–1023 | Hide "Type" column; assignee column shows avatar only |
| <768 | Card stack (`NoticeRowCard`); filter bar collapses behind a `[Filters · 3]` button that opens a bottom sheet |

## 13. i18n keys

```
admin.gst.notices.title
admin.gst.notices.subtitle
admin.gst.notices.upload
admin.gst.notices.filters.status
admin.gst.notices.filters.gstin
admin.gst.notices.filters.due
admin.gst.notices.filters.assignee
admin.gst.notices.filters.search
admin.gst.notices.filters.clearAll
admin.gst.notices.column.notice
admin.gst.notices.column.type
admin.gst.notices.column.gstin
admin.gst.notices.column.received
admin.gst.notices.column.due
admin.gst.notices.column.status
admin.gst.notices.column.assignee
admin.gst.notices.column.lastActivity
admin.gst.notices.due.overdue           // "Overdue · {{days}}d"
admin.gst.notices.due.in                // "Due in {{days}}d"
admin.gst.notices.due.on                // "Due {{date}}"
admin.gst.notices.status.received
admin.gst.notices.status.under_review
admin.gst.notices.status.responded
admin.gst.notices.status.closed
admin.gst.notices.empty.filtered.title
admin.gst.notices.empty.filtered.body
admin.gst.notices.empty.first.title
admin.gst.notices.empty.first.body
admin.gst.notices.error.load
admin.gst.notices.bulk.assign
admin.gst.notices.bulk.markUnderReview
admin.gst.notices.bulk.export
admin.gst.notices.bulk.cancel
admin.gst.notices.toast.uploaded
admin.gst.notices.toast.assigned
```

All keys must ship in `en`, `hi`, `bn`. Hindi labels typically run +25 % wider than English; Bengali +35 %. Filter chips and column headers use `text-overflow: ellipsis` with `title` tooltip to absorb overflow.

## 14. Telemetry events (frontend-dev hook)

- `gst.notice.list.viewed` { filters }
- `gst.notice.list.filter_changed` { filter, value }
- `gst.notice.list.row_opened` { noticeId, status, daysUntilDue }
- `gst.notice.upload.opened`
- `gst.notice.upload.submitted` { type, hasAttachments, attachmentCount }

## 15. Open questions / handoff notes

- **Role-gating recommendation:** default to `CA + ADMIN` for write actions; `ORG_OWNER` reads via separate org-scoped widget. Confirm with security-reviewer in 6F.
- **Bulk export PDF format:** placeholder action; backend endpoint not yet scoped — render disabled with tooltip "Coming soon" until backend confirms.
