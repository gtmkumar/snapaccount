# Notification Center — Phase 6E Enhancements

> **Scope:** Admin notification center (header dropdown + full page) + mobile NotificationCenterScreen enhancements.
> **Existing spec:** `docs/design/screens/mobile/notifications-profile.md` (mobile) and implicit coverage via admin header in `docs/design/screens/web-admin/dashboard.md`.
> **Phase:** 6E
> **Design system:** tokens + component-library.

This document lists *additions* only. Existing notification list item visuals, swipe-to-read, and badge count remain unchanged except where noted.

---

## 1. Goals for Phase 6E

1. Group notifications by day so users scanning a long inbox find "today" quickly.
2. Swipe-to-dismiss (mobile) with undo, matching Gmail/Apple Mail convention.
3. Deep-link **preview** on long-press / hover — show where a notification will take you before committing.
4. Filter bar by category (GST / ITR / Docs / Loan / Billing / Callback / System).
5. Leverage the 26-event notification model (plan I2) with correct icons + colors per category.

---

## 2. Admin header dropdown

Invoked by the bell icon in the top navbar; shows up to 8 most-recent notifications.

```
┌─ Notification dropdown (360px wide, anchored to bell) ─┐
│  Notifications                        [Mark all read]  │
│  Filter: [ All ] [ GST ] [ ITR ] [ Callback ] [ + ]    │
├──────────────────────────────────────────────────────── │
│  Today                                                  │
│  ● [GST icon] GSTR-3B due in 3 days                    │
│        "File by 20 Apr 2026"           2m ago   [⋯]   │
│  ○ [Callback] Your callback scheduled for 3:30pm       │
│        "with ca-kumar"                 14m ago  [⋯]   │
│                                                         │
│  Yesterday                                              │
│  ○ [ITR] ITR-1 ready for review                        │
│  ○ [Docs] OCR complete for Invoice-224                 │
│                                                         │
│  Earlier this week                                      │
│  ...                                                    │
├──────────────────────────────────────────────────────── │
│  [ View all notifications → ]                          │
└─────────────────────────────────────────────────────────┘
```

### 2.1 Anatomy
- Width 360px desktop; full-screen sheet on tablet and narrower.
- Filter chips at top (reuses `Badge` pill styling for selected state).
- Section headers: `fontSize.xs uppercase tracking-wide color.neutral.500`.
- Row: 12px vertical padding; 40×40 category-tinted icon tile; title (semibold) + body (neutral-600 `fontSize.sm`) + relative time; unread dot on left in `color.brand.500`.
- Row hover: background `color.neutral.50`.
- Row right-side "⋯" reveals per-notification actions (Mark as read/unread, Mute category, Report).

### 2.2 Deep-link preview

- **Desktop hover** (500ms delay) or **Long-press** (mobile equivalent) on a row: small popover anchored to row showing:
  - Target screen name (e.g., "GSTR-3B Review · Mar 2026")
  - A 2-line breadcrumb path (`Admin › GST › Returns › GSTR-3B Mar 2026`)
  - A thumbnail snapshot or module icon tile.
  - CTA `[Open]` (`PrimaryButton` size=xs).
- Popover width 280px, `shadow.md`, `radius.lg`, `color.surface.default`.
- Dismiss on pointer leave OR Esc.
- Accessibility: popover has `role="tooltip"` AND `aria-describedby` linking from the row when focused via keyboard; tab navigation through Open button.

---

## 3. Full-page admin `/admin/notifications`

Same layout as dropdown, but:
- 720px max-width, centered, with full-height scroll.
- Filter chips plus "Unread only" toggle and date range picker.
- Multi-select + bulk mark-read / bulk-dismiss.
- Sticky group headers while scrolling.
- Pagination with infinite scroll (TanStack Query).

---

## 4. Mobile NotificationCenterScreen enhancements

### 4.1 Grouping by day
- Section headers inserted between notifications — same copy as dropdown: "Today" / "Yesterday" / "This week" / specific date (`DD MMM`).
- Sticky header on scroll with subtle `color.neutral.100` bg + `shadow.xs` when pinned.

### 4.2 Swipe to dismiss
- Left swipe reveals two actions: [Mark read] (info color) and [Dismiss] (error color).
- Right swipe dismisses directly (matching Gmail).
- Threshold 40% width to commit; partial swipe snaps back.
- On dismiss: row collapses over 200ms; toast "Notification dismissed · Undo" appears at bottom for 5s.
- Undo restores row to its original position.
- Haptic feedback: light tap at threshold, medium on commit (iOS); equivalent Android vibration 10ms.
- Minimum 44×44pt for each revealed action button.

### 4.3 Category filter bar
- Sticky below the screen title.
- Horizontally scrollable chip row: `All`, `GST`, `ITR`, `Docs`, `Loan`, `Callback`, `Billing`, `System`.
- Selected chip: category module color bg (`color.module.*` for module categories; `color.brand.500` for All/Callback/System/Billing — document mapping below).

| Category filter | Active chip color |
|---|---|
| All | `color.brand.500` bg, white text |
| GST | `color.module.gst` bg, white text |
| ITR | `color.module.itr` bg, white text |
| Docs | `color.module.docs` bg, white text |
| Loan | `color.module.loan` bg, white text |
| Callback | `color.accent.500` bg, white text |
| Billing | `color.neutral.700` bg, white text |
| System | `color.neutral.500` bg, white text |

Inactive chip: `color.neutral.100` bg, `color.neutral.700` text.

### 4.4 Deep-link preview (mobile)
- Long-press on a notification row (500ms) opens a bottom-sheet preview with:
  - Target screen name.
  - Breadcrumb (e.g., "GST › Returns › GSTR-3B Mar 2026").
  - Module icon + a short snippet of the target content if available.
  - Primary CTA `[Open]` full-width, secondary `[Mark read]`, tertiary `[Dismiss]`.
- Sheet auto-dismisses on Open or backdrop tap.
- Haptic: light impact on long-press trigger.

### 4.5 Filter + category combined with preferences
- A "Manage notification preferences" link at the top-right of the screen jumps to the existing Preferences screen (no change in 6E beyond the link).

---

## 5. Category icon + color mapping

Applies to both admin and mobile. All reuse existing tokens.

| Event category | Icon | Tint bg | Tint fg |
|---|---|---|---|
| GST | `file-check-2` | `color.module.gst/10` (alpha) | `color.module.gst` |
| ITR | `book-open-check` | `color.module.itr/10` | `color.module.itr` |
| Docs | `scan-line` | `color.module.docs/10` | `color.module.docs` |
| Loan | `coins` | `color.module.loan/10` | `color.module.loan` |
| Callback | `phone-call` | `color.accent.100` | `color.accent.700` |
| Billing | `credit-card` | `color.neutral.100` | `color.neutral.700` |
| System | `info` | `color.info.100` | `color.info.700` |

All pairs verified WCAG AA for foreground-on-background.

---

## 6. Empty + error states

### 6.1 Empty
- No notifications: full-area `EmptyState` with illustration "bell-off", title "You're all caught up", body "We'll notify you about deadlines, documents, and callbacks."

### 6.2 Empty after filter
- Same pattern; body "No notifications match this filter"; GhostButton "Clear filter".

### 6.3 Error
- `ErrorState` with retry for initial load.
- Per-row load errors (rare): inline "Couldn't load this notification" + retry link.

### 6.4 Loading
- 6× `SkeletonText` row shape for initial mount.
- When filter changes: 200ms delay, otherwise progressive reveal without skeleton flash.

---

## 7. Accessibility

- Grouped list: use `<section aria-labelledby="group-today">` with `<h2>` headings; entire group navigable with landmarks.
- Swipe actions on mobile: each swipe action button has clear `accessibilityLabel`; screen readers expose "swipe actions available" via `accessibilityActions` prop (Mark read / Dismiss).
- Undo toast: `aria-live="polite"`; button accessible via "Undo dismiss".
- Long-press preview: surface as `accessibilityAction` "preview" for VoiceOver/TalkBack; also reachable by focusing row + pressing a keyboard key on admin (Shift+Enter).
- Category chips: role="radiogroup" with current filter as `selected`.
- Focus order: filter chips → first row → sequential rows → "View all".

---

## 8. Realtime

- SignalR `/hubs/notifications` joins user's channel.
- New notification: prepended with 1.5s `color.brand.50` fade.
- Bell icon badge count updates atomically.
- Dismiss / read events sync across devices.

---

## 9. i18n keys (en, hi, bn)

```
notifications.title
notifications.markAllRead
notifications.viewAll
notifications.filter.all
notifications.filter.gst
notifications.filter.itr
notifications.filter.docs
notifications.filter.loan
notifications.filter.callback
notifications.filter.billing
notifications.filter.system
notifications.filter.unreadOnly
notifications.filter.clear
notifications.group.today
notifications.group.yesterday
notifications.group.thisWeek
notifications.group.earlier                   # falls back to date
notifications.rowAction.markRead
notifications.rowAction.markUnread
notifications.rowAction.muteCategory
notifications.rowAction.report
notifications.swipe.markRead
notifications.swipe.dismiss
notifications.swipe.undo
notifications.preview.openCta
notifications.preview.breadcrumb
notifications.empty.title
notifications.empty.body
notifications.emptyFiltered.body
notifications.error.loadFailed
notifications.error.retry
notifications.loading
notifications.managePreferences
```

---

## 10. API / data contract

- `GET /notifications/inbox?filter=&before=&limit=` → paginated list.
- `POST /notifications/{id}/read`.
- `POST /notifications/{id}/dismiss`.
- `POST /notifications/bulk/read` body `{ ids: [] }`.
- `GET /notifications/{id}/preview` (optional performance optimization) → lightweight target metadata.
- SignalR events: `notification.created`, `notification.read`, `notification.dismissed`.

---

## 11. Tokens / components summary

- **No new color tokens.** Alpha-10% tints applied at render time via CSS `color-mix` or NativeWind opacity utility.
- Reuses: `Badge`, `StatusBadge`, `Card`, `EmptyState`, `ErrorState`, `Spinner`, `Toast`, `Modal` (bottom-sheet).
- **New component variants:**
  - `NotificationRow` — append to component-library under Phase 6E.
  - `NotificationPreviewPopover` (desktop) / `NotificationPreviewSheet` (mobile) — append under Phase 6E.

---

## 12. Status

| Item | Status |
|---|---|
| Grouping by day | **Good to implement** |
| Category filter chip bar | **Good to implement** |
| Swipe-to-dismiss with undo | **Good to implement** |
| Deep-link preview (long-press/hover) | **Good to implement** — popover/sheet patterns reuse existing primitives |
| Per-category icon + color mapping | **Good to implement** |
| Mute-category row action | **Needs design review** — requires backend support for per-category silence; confirm with backend-agent that `notification_preferences` schema supports category-level mute |

*End of Notification Center enhancements spec.*
