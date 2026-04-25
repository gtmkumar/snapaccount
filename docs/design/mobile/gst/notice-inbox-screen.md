# GstNoticeInboxScreen — Mobile Spec

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Code target:** `mobile/src/screens/gst/GstNoticeInboxScreen.tsx`
> **Design system:** extends `docs/design/component-library.md`. No new tokens.
> **Tech:** React Native (Expo SDK 52+) + NativeWind. Touch targets ≥ 44 × 44 pt.

---

## 1. Purpose

A mobile inbox of every GST notice for the orgs the signed-in user owns / is a member of. Lets owners see urgency at a glance, drill into a notice (read-only — actual response is composed by their CA on web), and archive once handled.

> **Important:** mobile users **do not** submit responses to GSTN. Per phase scope §mobile-dev, "reply goes to CA, not direct GSTN — human-in-the-loop". This screen reflects that.

## 2. User goal

> "Has the GST department sent us anything? When is it due? My CA is handling it — I just want to know what's happening and not be surprised."

## 3. Entry points

- Bottom-tab `GST` → `GstDashboardScreen` → "Notices" card → this screen.
- Push notification deep link `snapaccount://gst/notices/:id` (if `id` present, opens `GstNoticeDetailScreen`; if absent, this inbox).
- Badge dot on bottom-tab `GST` icon when `unreadOrUrgentCount > 0`.

## 4. Layout

```
┌ Status bar ─────────────────────────────────────────┐
├ Header ─────────────────────────────────────────────┤
│ ‹  GST Notices                       [⚲ Filter]    │
├ Org switcher (if multi-org) ────────────────────────┤
│ [Acme Traders ▾]                                    │
├ Filter chips (horizontal scroll) ───────────────────┤
│ [All 12] [Open 7] [Due ≤ 3d 2] [Responded 5]        │
├─────────────────────────────────────────────────────┤
│ ┌ NoticeRowMobile ───────────────────────────────┐ │
│ │ [DueDateChip] Critical · D-2          ·  ●     │ │
│ │ GST/24/ASMT/0931                               │ │
│ │ ASMT-10 · Acme Traders                         │ │
│ │ Recvd 15 Apr · CA: Priya R.                    │ │
│ └────────────────────────────────────────────────┘ │
│ ┌ NoticeRowMobile ───────────────────────────────┐ │
│ │ [DueDateChip] Warning · D-7                    │ │
│ │ GST/24/DRC/0212                                │ │
│ │ DRC-01 · Acme Traders                          │ │
│ └────────────────────────────────────────────────┘ │
│   …                                                 │
├ Pull-to-refresh ────────────────────────────────────┤
└─────────────────────────────────────────────────────┘
```

- `SafeAreaView` wraps content.
- Header height 56pt; back button 44 × 44 pt; right-side filter button 44 × 44 pt.
- Filter chip row: 44pt tall, horizontal `ScrollView`, momentum scroll, snapping disabled.

## 5. Components used

| Region | Component | Source |
|---|---|---|
| Header | `MobileHeader` | existing |
| Org switcher | `OrgSwitcher` | existing |
| Filter chips | `ChipGroup` (single-select, horizontal) | existing |
| Row | `NoticeRowMobile` (NEW — see §6) | new primitive |
| Due chip | `DueDateChip` | from notice-tracker-list-page §6.1 |
| Status badge | `StatusBadge` (notice variants) | existing + 6B extension |
| Empty state | `EmptyState` | existing |
| Skeleton | `SkeletonRow` | existing |
| Pull-to-refresh | RN built-in `RefreshControl` | — |
| Bottom sheet (filters) | `BottomSheet` | existing |
| Swipeable | `react-native-gesture-handler` Swipeable | existing dep |
| Toast | `Toast` | existing |

## 6. NoticeRowMobile (NEW primitive)

### 6.1 Anatomy

- Card padded 16pt all sides; `Card` with `radius.lg`, `shadow.sm`, white bg, 1pt border `slate.200`.
- Vertical stack:
  1. Top row: `DueDateChip` left + (optional) unread dot right (8pt `error.500` circle when `unread`).
  2. Notice number (mono, 16pt, `slate.900`, weight 600).
  3. Type + org one-liner (14pt, `slate.700`).
  4. Meta line: "Recvd {{date}} · CA: {{name|—}}" (12pt, `slate.500`).

### 6.2 Sizes
- Min height 96pt (well above 44pt minimum).
- Vertical gap between cards 12pt.

### 6.3 States
- Default
- Pressed (90 % opacity overlay `slate.900` 8 %)
- Urgent (Critical / Overdue): 2pt left bar `error.500`; entire card `bg-error.50`
- Read: unread dot hidden
- Archived: not rendered in current filter (see §7)

### 6.4 Swipe affordances
- **Swipe left → Archive** (only when `status ∈ {RESPONDED, CLOSED}` — gated; for `RECEIVED / UNDER_REVIEW`, swipe shows a tooltip and bounces back: "Can't archive an open notice").
  - Right-side action drawer: `slate.700` background, label "Archive" with icon `archive`, 88pt wide, white text.
- **Swipe right → Mark read/unread**:
  - Left-side drawer: `info.500` bg, label flips by current state.
- Long-press → context menu: View, Mark read, Share, Archive (gated).

### 6.5 Accessibility
- Each row is `accessible={true}` with `accessibilityRole="button"`.
- `accessibilityLabel`: `"Notice GST/24/ASMT/0931, ASMT-10 for Acme Traders, due in 2 days, status Under Review, unread"`.
- Custom actions exposed via `accessibilityActions=[{name: 'archive'}, {name: 'mark_read'}]` so VoiceOver / TalkBack rotor users can trigger swipe actions without gestures.

## 7. Filters

### 7.1 Quick chips (always visible)
- `All` — everything not archived.
- `Open` — `status ∈ {RECEIVED, UNDER_REVIEW}`.
- `Due ≤ 3d` — overdue + critical bucket.
- `Responded` — `status === RESPONDED`.

Each chip shows a count suffix; counts come from a single summary fetch.

### 7.2 Full filter sheet
Tapping `[⚲ Filter]` opens a `BottomSheet` (`SnapPoints=[60%, 90%]`):

| Section | Control |
|---|---|
| Status (multi) | `Toggle` chips: Received, Under Review, Responded, Closed |
| Due window | Segmented control: All, Overdue, This week, This month |
| Org | `Select` listing user's orgs |
| Show archived | `Toggle` |

Footer: `[Reset]` + `[Apply (n)]`. Selected filter count surfaces on the header `[⚲ Filter]` button as a badge.

## 8. States

- **Loading:** 6 `SkeletonRow` cards.
- **Empty (filter):** EmptyState illustration `inbox-empty`, "No notices match this view", `[Clear filters]`.
- **Empty (first run):** "No GST notices yet — when the GST department issues one, you'll see it here."
- **Error:** `AlertBanner type=error` inline above list + full-row `[Retry]`. Pull-to-refresh also triggers retry.
- **Offline:** banner `slate` "You're offline — showing cached notices from {{relative}}". Swipe actions disabled with toast on attempt: "Reconnect to archive."

## 9. Header dashboard badge

`GstDashboardScreen` exposes a `notices` card. Badge rules:

| Count | Visual |
|---|---|
| 0 | No badge |
| 1–9 | Small `error.500` circle with white digit |
| 10–99 | Same circle, two digits |
| ≥100 | "99+" |

Bottom-tab `GST` icon mirrors this badge using the existing `BottomTabBar` `badge` prop.

`unreadOrUrgentCount` definition: `count of notices where (unread === true) OR (dueDate ≤ now + 3d AND status ∈ {RECEIVED, UNDER_REVIEW})`.

## 10. Pull-to-refresh

- `RefreshControl` with brand tint `indigo.500`.
- Refresh triggers full re-fetch of summary + first page.
- Haptic: light impact on release of pull when threshold crossed.

## 11. Pagination

- Infinite scroll (`onEndReached`, threshold 0.5).
- Footer spinner row 56pt while loading next page.
- "End of inbox" caption when fully loaded.

## 12. Deep-link from notification

- Tapping a push notification with payload `{ type: 'gst.notice.due_soon', noticeId: 'abc' }`:
  - If app cold-start: open inbox, then auto-navigate to `GstNoticeDetailScreen` with that id; mark as read.
  - If app warm: same navigation; show a `Toast info` if user is on a different stack ("Opened notice from notification").
- Always log `gst.notice.deeplink_opened` telemetry.

## 13. Archive flow

- Optimistic: row animates out (slide left + opacity, 240ms ease-in).
- Toast snackbar at bottom: `"Notice archived"` with `[Undo]` action (8s window).
- `[Undo]` re-inserts row with brief highlight (yellow flash 600ms then fade).
- Network failure: revert + toast `error` "Couldn't archive — try again".

## 14. i18n keys

```
mobile.gst.notices.title
mobile.gst.notices.filter.title
mobile.gst.notices.filter.apply
mobile.gst.notices.filter.reset
mobile.gst.notices.filter.status
mobile.gst.notices.filter.due
mobile.gst.notices.filter.org
mobile.gst.notices.filter.archived
mobile.gst.notices.chip.all
mobile.gst.notices.chip.open
mobile.gst.notices.chip.dueSoon
mobile.gst.notices.chip.responded
mobile.gst.notices.row.recvd
mobile.gst.notices.row.ca
mobile.gst.notices.row.caUnassigned
mobile.gst.notices.row.unread
mobile.gst.notices.swipe.archive
mobile.gst.notices.swipe.archive.blocked
mobile.gst.notices.swipe.markRead
mobile.gst.notices.swipe.markUnread
mobile.gst.notices.empty.filter.title
mobile.gst.notices.empty.first.title
mobile.gst.notices.empty.first.body
mobile.gst.notices.error.load
mobile.gst.notices.offline
mobile.gst.notices.toast.archived
mobile.gst.notices.toast.archived.undo
mobile.gst.notices.toast.deepLinked
```

`en`, `hi`, `bn`. Hindi/Bengali strings are typically 25–40 % longer; row text uses `numberOfLines={2}` with `ellipsizeMode="tail"` to absorb overflow without breaking the 96pt min height.

## 15. Telemetry

- `gst.notice.inbox.viewed` { count, urgentCount }
- `gst.notice.inbox.filterChanged` { filter, value }
- `gst.notice.inbox.opened` { noticeId, source: 'list'|'deeplink' }
- `gst.notice.inbox.archived` { noticeId }
- `gst.notice.inbox.archive_undo` { noticeId }
- `gst.notice.inbox.deeplink_opened` { noticeId, coldStart: boolean }

## 16. Handoff notes

- Push payload schema must include `noticeId`. Coordinate with NotificationService (Phase 6E).
- `archive` mutation is mobile-only (does not affect web / CA inbox state). Backend should track per-user `archivedAt` rather than rewriting global notice status.
- Reuses `DueDateChip` from list page spec — must land in shared mobile components.
