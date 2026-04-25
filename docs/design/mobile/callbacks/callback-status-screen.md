# CallbackStatusScreen — Mobile Live Status

> **Screen:** `CallbackStatusScreen`
> **Nav param:** `{ callbackId }`
> **Deep-link target:** `snapaccount://callbacks/{id}` (registered in Expo Linking config)
> **Phase:** 6E
> **Design system:** tokens + component-library.

---

## 1. Purpose

Give the user a calm, clear "what happens next" view after requesting a callback, with the ability to reschedule or cancel, and a live-updating status.

---

## 2. Layout

```
┌─ Header ─────────────────────────────────────┐
│  ←  Your callback                             │
├─ Hero ───────────────────────────────────────┤
│                                                │
│              [ large status glyph ]           │
│                                                │
│              Scheduled for                    │
│            3:30 PM today (IST)                │
│         with ca-kumar from SnapAccount        │
│                                                │
│          [ 📞 Call will arrive on ]           │
│           +91 98765 43210  [Edit]             │
│                                                │
├─ Timeline ───────────────────────────────────┤
│  ● 13:42  You requested a callback            │
│  ● 13:58  Assigned to ca-kumar                │
│  ● 14:05  Scheduled for 15:30                 │
│  ○ —      Expected call at 15:30              │
├─ About this callback ────────────────────────┤
│ Category: GST                                  │
│ Linked: GSTR-3B · Mar 2026  [Open ↗]          │
│ Your note:                                     │
│  "I'm not sure how to reconcile ITC…"          │
├─ Actions ────────────────────────────────────┤
│  [ Reschedule ]                                │
│  [ Cancel this callback ]                      │
│                                                │
│  [ Add more context ]                          │
└────────────────────────────────────────────────┘
```

### 2.1 Header
- Back button 44×44pt.
- Title: `fontSize.lg semibold`.
- Trailing "⋯" menu only for advanced actions (Escalate request — rarely visible).

### 2.2 Hero
- Vertically padded `spacing.8` top and bottom.
- Status glyph 96×96 tinted circle:
  - PENDING → `color.warning.100` bg, `clock` `color.warning.600`.
  - SCHEDULED → `color.info.100` bg, `calendar-check` `color.info.600`.
  - IN_PROGRESS → `color.brand.100` bg, `phone-call` `color.brand.600`, pulsing 2s ring.
  - COMPLETED → `color.success.100` bg, `check-circle` `color.success.600`.
  - FOLLOW_UP_NEEDED → `color.accent.100` bg, `rotate-ccw` `color.accent.600`.
  - ESCALATED_TO_CA → `color.error.100` bg, `arrow-up-circle` `color.error.600`.
  - CANCELLED → `color.neutral.100` bg, `x-circle` `color.neutral.500`.
- Primary label: `fontSize.2xl semibold`, state-specific (see §3).
- Secondary label: `fontSize.base regular color.neutral.600`.
- Assigned agent line with `Avatar` xs + name, only visible once assigned.
- Phone row: monospace phone, "Edit" ghost link opens profile phone editor.

### 2.3 Timeline
- Reuses `StatusTimeline` vertical variant with actor prop.
- Shows requested / assigned / scheduled / started / completed as applicable.
- Future events shown as outline-dot rows with dimmed text "Expected call at 15:30".

### 2.4 About card
- `Card` `shadow.xs` `radius.lg` `spacing.4` padding.
- Rows: Category, Linked entity (tappable with chevron), Your note (collapsible if long).

### 2.5 Actions
- All 44pt+ height buttons stacked with `spacing.3` between.
- **Reschedule** (`SecondaryButton`): visible when status ∈ {PENDING, SCHEDULED, FOLLOW_UP_NEEDED}.
- **Cancel this callback** (`GhostButton` destructive tone): visible when status ∈ {PENDING, SCHEDULED, IN_PROGRESS}. Requires confirm sheet with reason textarea (optional, max 200 chars).
- **Add more context** (`GhostButton`): opens small modal `Textarea` to append a user-note (becomes a timeline event "User added context").
- **Mark as completed** — NOT available to user; only CA-side. If user insists: "Add more context" to flag it; we surface COMPLETED only after CA marks.
- **Request follow-up** (`SecondaryButton`): visible only when status = COMPLETED, within 48h window. Creates a new PENDING callback linked to this one.

---

## 3. State-specific hero copy

| Status | Primary label | Secondary label |
|---|---|---|
| PENDING (no assignment) | "Finding an expert for you" | "We'll confirm a time in the next few minutes." |
| PENDING (assigned, unscheduled) | "Assigned to {name}" | "They'll call you during your preferred window: {window}." |
| SCHEDULED | "Scheduled for {time}" (e.g., "3:30 PM today") | "with {name} from SnapAccount" |
| IN_PROGRESS | "On a call with {name}" | "Stay on the line — ringing now." |
| COMPLETED | "Callback completed" | "Thanks for using SnapAccount. {duration} minutes · {outcomeLabel}." |
| FOLLOW_UP_NEEDED | "Follow-up required" | "We'll reach out again within 24 hours." |
| ESCALATED_TO_CA | "Escalated to a Chartered Accountant" | "A CA will review and call you back soon." |
| CANCELLED | "Callback cancelled" | "by {you / SnapAccount} at {time}. {reasonIfPresent}" |

Time renders in IST, user-locale-aware (Hindi/Bengali numerals where locale is set to hi/bn).

---

## 4. Realtime

- Subscribes via FCM data-only pushes AND SignalR when in foreground.
- State transitions animate hero glyph: 300ms cross-fade + scale 0.9→1.0.
- Timeline prepends new events with `color.brand.50` fade (1.5s).
- Reduced-motion: cross-fade only, no scale.

---

## 5. Deep-linking

- Path: `snapaccount://callbacks/{id}` or universal `https://app.snapaccount.in/callbacks/{id}`.
- Entry points:
  - Push notification tap (FCM) with data `{ type: "callback", id: "<uuid>" }` → routes here (not app root, per gap analysis §6).
  - SMS click-link: `https://app.snapaccount.in/callbacks/{id}?from=sms`.
  - Admin CA sharing link.
- If app is cold-started via deep link and user is not authenticated: land on Login, preserve target, resume after auth.
- If callback id not found / not owned by user: show `ErrorState` full-screen: "This callback is not available" with "Back to home" CTA.

---

## 6. States

### 6.1 Loading (first mount via deep link)
- Header renders immediately.
- Hero: `SkeletonText` + circular skeleton for glyph.
- Timeline: 3× skeleton rows.
- Actions: hidden during load.

### 6.2 Empty
- Not applicable — a callback always has at least one event (REQUESTED).

### 6.3 Error
- Full-screen `ErrorState` with retry.
- Specific 404: "This callback was not found or you don't have access."

### 6.4 Offline
- Persistent top `AlertBanner` type=info "Offline — showing last known status". Actions (Reschedule / Cancel) disabled with tooltip.

### 6.5 Stale
- If last-updated > 5 min ago and foreground: auto-refetch.
- If last-updated > 2 min ago and status = IN_PROGRESS: show small "Refresh" ghost button under hero.

---

## 7. Reschedule flow

- Opens a bottom-sheet with the same time-picker segment used in the RequestCallbackModalScreen (§2.4).
- Submit → `PATCH /callbacks/{id}` with new `preferredWindow`.
- State transitions: backend may keep status SCHEDULED but update `scheduledAt`.
- Success: hero reflects new time; toast "Rescheduled for {time}".
- Error: banner with retry; sheet stays open until explicit cancel.

---

## 8. Cancel flow

- Opens a confirm sheet:
  - Title: "Cancel this callback?"
  - Body: "You can request another callback anytime."
  - Optional reason `Textarea` (0–200 chars).
  - Destructive primary `PrimaryButton` error variant "Cancel callback"; secondary `GhostButton` "Keep it".
- Submit → `POST /callbacks/{id}/transition { to: "CANCELLED", reason }`.
- On success: hero updates to CANCELLED state; actions collapse; toast "Callback cancelled".

---

## 9. Accessibility

- Hero glyph is decorative (`accessibilityElementsHidden` / `importantForAccessibility=no`); the primary + secondary labels carry the semantic meaning.
- Status announcements on transition: use `AccessibilityInfo.announceForAccessibility` with full-sentence text.
- All buttons labeled with verbs; Cancel button has `accessibilityHint="Cancels your callback request"`.
- Minimum 44×44pt on every tap target.
- Color contrast verified AA on all hero tints (100-bg + 600-icon passes).
- Deep-link lands with focus on the page title.

---

## 10. i18n keys (en, hi, bn)

```
mobile.callback.status.title
mobile.callback.status.header.back
mobile.callback.status.hero.pendingNoAssign.primary
mobile.callback.status.hero.pendingNoAssign.secondary
mobile.callback.status.hero.pendingAssigned.primary
mobile.callback.status.hero.pendingAssigned.secondary
mobile.callback.status.hero.scheduled.primary
mobile.callback.status.hero.scheduled.secondary
mobile.callback.status.hero.inProgress.primary
mobile.callback.status.hero.inProgress.secondary
mobile.callback.status.hero.completed.primary
mobile.callback.status.hero.completed.secondary
mobile.callback.status.hero.followUp.primary
mobile.callback.status.hero.followUp.secondary
mobile.callback.status.hero.escalated.primary
mobile.callback.status.hero.escalated.secondary
mobile.callback.status.hero.cancelled.primary
mobile.callback.status.hero.cancelled.secondary
mobile.callback.status.phoneRow.label
mobile.callback.status.phoneRow.edit
mobile.callback.status.timeline.requested
mobile.callback.status.timeline.assigned
mobile.callback.status.timeline.scheduled
mobile.callback.status.timeline.rescheduled
mobile.callback.status.timeline.callStarted
mobile.callback.status.timeline.callCompleted
mobile.callback.status.timeline.userNoteAdded
mobile.callback.status.timeline.expectedCall
mobile.callback.status.about.title
mobile.callback.status.about.category
mobile.callback.status.about.linked
mobile.callback.status.about.note
mobile.callback.status.action.reschedule
mobile.callback.status.action.cancel
mobile.callback.status.action.addContext
mobile.callback.status.action.requestFollowUp
mobile.callback.status.confirm.cancel.title
mobile.callback.status.confirm.cancel.body
mobile.callback.status.confirm.cancel.reasonLabel
mobile.callback.status.confirm.cancel.confirm
mobile.callback.status.confirm.cancel.keepIt
mobile.callback.status.reschedule.sheetTitle
mobile.callback.status.reschedule.submit
mobile.callback.status.toast.rescheduled
mobile.callback.status.toast.cancelled
mobile.callback.status.error.notFound
mobile.callback.status.offlineBanner
mobile.callback.status.refresh
```

---

## 11. API / data contract

- `GET /callbacks/{id}` → full callback with timeline, linkedEntity.
- `PATCH /callbacks/{id}` body `{ preferredWindow }` for reschedule.
- `POST /callbacks/{id}/transition { to: "CANCELLED", reason }`.
- `POST /callbacks/{id}/notes { body }` for "Add more context" (reuses admin endpoint with user role).
- FCM data-only messages with `{ type: "callback", id, event }` to drive live updates.

---

## 12. Tokens / components summary

- No new tokens.
- Reuses: `Card`, `StatusTimeline`, `Avatar`, `PrimaryButton`, `SecondaryButton`, `GhostButton`, `Modal` (bottom-sheet), `AlertBanner`, `Toast`, `Textarea`.
- No new components required.

*End of CallbackStatusScreen spec.*
