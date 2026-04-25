# NoticesDueWidget — Admin Dashboard Widget

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Mounting point:** `GstFilingQueuePage` (above existing filing queue table) and `AdminHomeDashboard` (right rail card row).
> **Code target:** `src/admin/src/components/gst/NoticesDueWidget.tsx`
> **Design system:** extends `docs/design/component-library.md`. No new tokens.

---

## 1. Purpose

A small, glanceable card surfacing notices whose due date falls within the next 7 days, so CAs see deadline pressure on first paint of the GST landing pages. It is **not** a replacement for the full Notice Tracker — it is a teaser + jump-off.

## 2. User goal

> "When I land on the GST page, in 1 second I should know whether anything is going to blow up this week."

## 3. Anatomy

```
┌─ Notices due this week ───────────────────────── [View all ›]──┐
│                                                                  │
│        7                                                         │
│   notices                                                        │
│   due this week                                                  │
│                                                                  │
│   • [DueDateChip Critical] GST/24/ASMT/0931 · 27ABCDE…F1Z5      │
│   • [DueDateChip Warning ] GST/24/DRC/0212  · 29XYZAB…G2H4      │
│   • [DueDateChip Warning ] GST/24/REG-17/14 · 27MNOPQ…R5S6      │
│                                                                  │
│   [Open Notice Tracker ›]                                        │
└──────────────────────────────────────────────────────────────────┘
```

- Width: 320px on dashboard right rail; full-width container on `GstFilingQueuePage` (≤ 720px).
- Height: fixed at 220px so the dashboard grid stays aligned regardless of state.

## 4. Components used

| Region | Component | Source |
|---|---|---|
| Card frame | `Card padding=md radius=lg shadow=sm border=true` | existing |
| Big count | `MetricCard`-style typography (no full MetricCard wrapper — inline H1) | existing scale |
| Row pill | `DueDateChip` | NEW (defined in notice-tracker-list-page.md §6.1) |
| Header link | `Link` | existing |
| Footer CTA | `Button variant=secondary size=sm fullWidth` | existing |
| Skeleton | `SkeletonBlock` | existing |

## 5. Variants

| Variant | When |
|---|---|
| `default` | At least 1 notice with `dueDate ≤ now + 7d` and `status ∉ {RESPONDED, CLOSED}` |
| `urgent` | At least 1 notice in `Critical` or `Overdue` bucket — entire card gains a 2px left bar in `error.500`; count text in `error.700` |
| `clear` | No notices in window — count `0`, illustration `check-circle`, body "All clear — no notices due this week" |
| `loading` | Skeleton: count placeholder + 3 row placeholders |
| `error` | `AlertBanner type=error` inline + `[Retry]` |

## 6. Row preview rules

- Up to **3** rows, sorted by `dueDate` ascending then `status` (RECEIVED before UNDER_REVIEW).
- Each row clickable → navigates to `NoticeDetailPage`.
- Truncate notice number after 18 chars with ellipsis; full value on `title` tooltip.
- Mask GSTIN: show first 5 + `…` + last 4 ("27ABC…F1Z5") for shoulder-surfing safety on shared screens.
- Mobile-web (<480px): show only `[DueDateChip] {noticeNumber}`; drop GSTIN.

## 7. Header link

`[View all ›]` — top-right of card. Navigates to `/admin/gst/notices?due=overdue,thisWeek` (preserves the urgency filter so the list opens scoped). Hides when `count === 0`.

## 8. Footer CTA

- Default / urgent: `[Open Notice Tracker ›]` (secondary, full-width).
- Clear: `[Open Notice Tracker]` (ghost, less emphasized — no chevron).
- Error: `[Retry]` primary instead.

## 9. Polling & freshness

- Data fetched via TanStack Query, `staleTime = 60s`, `refetchOnWindowFocus = true`.
- Caption "Updated {{relativeTime}}" small grey text, bottom-right of card; updates each minute via interval.

## 10. Accessibility

- Card is a `<section aria-labelledby="widget-notices-due-title">`.
- Big count: `<span aria-label="7 notices due this week">7</span>` followed by visually-styled label.
- Each row is a `<a>` (link), 44px tall, full-row hit target.
- Color is not the only signal: each `DueDateChip` includes text countdown.
- Empty + error states announced via `aria-live="polite"` when transitioning from loading.

## 11. Responsive

| Width | Layout |
|---|---|
| ≥720 | As shown |
| 480–719 | Same; rows compress horizontally; truncate earlier |
| <480 | Drop GSTIN per §6; count and rows stack tightly; footer CTA spans full width |

## 12. i18n keys

```
admin.gst.notices.widget.title
admin.gst.notices.widget.viewAll
admin.gst.notices.widget.count               // "{{count}} notices due this week"
admin.gst.notices.widget.empty.title         // "All clear"
admin.gst.notices.widget.empty.body          // "No notices due this week"
admin.gst.notices.widget.cta                 // "Open Notice Tracker"
admin.gst.notices.widget.error               // "Couldn't load. Retry"
admin.gst.notices.widget.updatedAt           // "Updated {{relative}}"
```

`en`, `hi`, `bn`. Card is fixed-height — long Bengali / Hindi titles must wrap to max 2 lines; preview rows clip.

## 13. Telemetry

- `gst.notices.widget.viewed` { count, urgent: boolean }
- `gst.notices.widget.row_clicked` { noticeId, daysUntilDue }
- `gst.notices.widget.cta_clicked`

## 14. Handoff notes

- Reuses `DueDateChip` from `notice-tracker-list-page.md §6.1` — must land first.
- Backend endpoint expectation: `GET /gst/notices?due=upcoming&days=7&limit=3&summary=true` returning `{ totalCount, criticalCount, items: [...] }`.
- Card occupies one cell of the existing 12-column dashboard grid (spans 4 cols at xl, 6 cols at md, 12 cols at sm).
