# CallbackDetailPage — Admin Callback Detail

> **Route:** `/admin/callbacks/:id` (also renders as side-sheet from CallbackListPage)
> **File:** `src/admin/src/pages/callbacks/CallbackDetailPage.tsx`
> **Phase:** 6E
> **Role gating:** CA + Admin + Ops; org_id scope enforced by backend.

---

## 1. Purpose & user goals

**Purpose:** Give a callback handler everything needed to prepare for, run, log, and close a single callback — in one screen.

**Primary goals:**
1. See full context: who, what, why, priority, SLA, linked entity.
2. Transition state through the callback lifecycle without ambiguity.
3. Capture notes during/after the call and attach to the record.
4. Jump to the linked entity (GST return / ITR filing / document / loan) in one click.

---

## 2. Layout (desktop ≥1280px)

```
┌─ Header ────────────────────────────────────────────────────────────────────┐
│  ← Back  Callback · #CB-2404-0019                     [Escalate] [Complete] │
│          Rajesh M. · +91 98765 43210                  [Reassign] [Cancel]   │
├─ Stepper (sticky) ──────────────────────────────────────────────────────────┤
│  ● PENDING ─ ● SCHEDULED ─ ○ IN_PROGRESS ─ ○ COMPLETED                      │
│                                     ⎣ branches: FOLLOW_UP · ESCALATED · CANCELLED
├─ Main (2 col) ──────────────────────────────────────────────────────────────┤
│ ┌─ Left (2/3) ─────────────────────┐   ┌─ Right (1/3) ──────────────────┐ │
│ │ Reason                            │   │  Meta                           │ │
│ │ "Need help reconciling ITC…"     │   │  Category: GST                  │ │
│ │                                   │   │  Priority: HIGH                 │ │
│ │ Linked entity                     │   │  SLA: 34m remaining 🟡          │ │
│ │ [GSTR-3B · Mar 2026 ↗]           │   │  Preferred: 14:00–16:00 IST     │ │
│ │                                   │   │  Requested: 18 Apr · 13:42 IST  │ │
│ │ Timeline                          │   │  Assigned: [Avatar] ca-kumar    │ │
│ │  ● 13:42 requested                │   │                                 │ │
│ │  ● 13:58 assigned to ca-kumar     │   │  Contact                        │ │
│ │  ● 14:05 scheduled for 14:30      │   │  📞 +91 98765 43210             │ │
│ │  ● (now) waiting for call         │   │  [Call] [SMS]  [Copy]           │ │
│ │                                   │   │                                 │ │
│ │ Notes                             │   │  Notifications fired            │ │
│ │ [Note composer rich text]         │   │  ✓ Scheduled push · 14:05       │ │
│ │ Outcome ▾  Duration __ min        │   │  ✓ SMS · 14:05                  │ │
│ │ [Add note]                        │   │                                 │ │
│ │                                   │   │                                 │ │
│ │ Previous notes (3)                │   │                                 │ │
│ │ └─ expandable list                │   │                                 │ │
│ └───────────────────────────────────┘   └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Side-sheet variant
When opened from list: same content in a 640px right-docked sheet, header condensed (no stepper; stepper moves to top of right column as vertical).

### 2.2 Responsive
- **1024–1279px:** single column; right rail collapses into an "Info" accordion at top.
- **<1024px:** mobile-safe layout; stepper becomes horizontal scroll; notes composer sticks to bottom.

---

## 3. Stepper — visible state machine

Uses existing `StatusTimeline` component in "stepper" mode (extend component-library with `orientation: 'horizontal'` prop under Phase 6E).

### 3.1 Happy-path steps
`PENDING → SCHEDULED → IN_PROGRESS → COMPLETED`

### 3.2 Branch steps (rendered below the happy path as forks)
- `FOLLOW_UP_NEEDED` (reachable from IN_PROGRESS or COMPLETED)
- `ESCALATED_TO_CA` (reachable from any open state)
- `CANCELLED` (reachable from PENDING, SCHEDULED, IN_PROGRESS)

### 3.3 Visual rules
- Completed steps: filled dot `color.success.500`, check icon.
- Current step: filled dot in status variant color (see list-page badge map), pulsing ring.
- Future steps: empty outline dot `color.neutral.300`.
- Branch steps: dashed connector to indicate non-linear transition; use `color.accent.500` / `color.error.500` / `color.neutral.500` per branch semantic.
- Each dot clickable (if transition allowed) → opens the same confirm dialog as the corresponding action button. Dots disable with tooltip if transition invalid per state machine.

### 3.4 Allowed transitions (enforced client + server)

| From | To (allowed) |
|---|---|
| PENDING | SCHEDULED, ESCALATED_TO_CA, CANCELLED |
| SCHEDULED | IN_PROGRESS, ESCALATED_TO_CA, CANCELLED |
| IN_PROGRESS | COMPLETED, FOLLOW_UP_NEEDED, ESCALATED_TO_CA |
| COMPLETED | FOLLOW_UP_NEEDED (reopen) |
| FOLLOW_UP_NEEDED | SCHEDULED, COMPLETED, ESCALATED_TO_CA |
| ESCALATED_TO_CA | IN_PROGRESS, COMPLETED |
| CANCELLED | (terminal) |

Invalid transitions show inline `AlertBanner` type=warning: "Cannot move from X to Y. Use Z instead."

---

## 4. Timeline (status-change history)

- Reuses `StatusTimeline` vertical variant (component-library §6.3) with the `actor` prop extension introduced in Phase 6A deltas.
- Each event row: dot (color per event type), timestamp in IST (DD MMM · HH:mm IST), actor (avatar xs + name), verb (semibold), detail line (neutral-600).
- Event types: `REQUESTED`, `ASSIGNED`, `SCHEDULED`, `RESCHEDULED`, `CALL_STARTED`, `NOTE_ADDED`, `CALL_COMPLETED`, `FOLLOW_UP_FLAGGED`, `ESCALATED`, `CANCELLED`, `NOTIFICATION_SENT`.
- Dense mode: collapses "NOTIFICATION_SENT" events under an expander "+ 3 notifications fired".

---

## 5. Note composer

Right below the timeline.

### 5.1 Anatomy
```
┌─ Add note ──────────────────────────────────────────────────────┐
│ [Rich text area — plain paragraphs + bullet list + link only]  │
│                                                                  │
│ Outcome: [ Resolved ▾ ]   Duration: [ 12 ] min                   │
│ Attach to transition: [✓] Mark as COMPLETED                      │
│                                                                  │
│                                        [Cancel]  [Save note]    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Fields
- **Body** (required, 10–4000 chars) — `Textarea` with 4 row minimum, expands to 12 rows.
- **Outcome** (optional): `Select` with values: RESOLVED, NEEDS_FOLLOW_UP, ESCALATED, NO_ANSWER, WRONG_NUMBER, USER_DECLINED.
- **Duration** (optional, 0–240 min) — `TextInput` numeric, suffix "min".
- **Attach to transition** (optional) — checkbox that couples the note to a status change committed atomically.

### 5.3 States
- **Idle**: Save button disabled until body ≥10 chars.
- **Saving**: Button shows spinner; form disabled; optimistic render in previous-notes list.
- **Saved**: Toast "Note saved" (success); composer resets.
- **Error**: Inline `AlertBanner` under composer with retry; form preserves input.

### 5.4 Previous notes list
- Reverse-chronological; each note as a `Card` with author avatar + name, timestamp, outcome `Badge`, duration chip, body text (markdown-lite rendering for bullet + link).
- Long notes (>200 chars) collapsed with "Show more".
- Author-only: edit within 5 min of save. Admin-only: delete (soft-delete; preserved in audit trail per DPDP).

---

## 6. Linked entity card

```
┌─ Linked entity ─────────────────────────────────────┐
│ [Module icon]  GSTR-3B · Mar 2026                   │
│                Status: PENDING_APPROVAL             │
│                Amount: ₹ 2,45,800                    │
│                                       [ Open ↗ ]     │
└─────────────────────────────────────────────────────┘
```

- Module icon sized 24×24 with module-color background tint (`color.module.*/10`).
- Clicking "Open" navigates to the linked entity detail page; middle-click opens new tab; deep-link honors role guard.
- If `linked_entity_type` is null: render as empty-state text "No linked entity" with a "Link entity…" `GhostButton` that opens a picker.

---

## 7. Notifications fired panel

Shows what the system has sent to the user regarding this callback. Reads from `notification.notification_log` filtered by callback id.

- Each row: channel icon (push / sms / email), template name (e.g. `CALLBACK_SCHEDULED`), timestamp, status dot.
- Status dot colors: SENT = success, DELIVERED = success + ring, FAILED = error, QUEUED = neutral pulsing.
- Tap row → opens modal with full template rendered preview + provider message id.

---

## 8. Primary action buttons (header)

| Action | Button style | Enabled when |
|---|---|---|
| Complete | `PrimaryButton` success tone | state ∈ {IN_PROGRESS, FOLLOW_UP_NEEDED} |
| Escalate to CA | `SecondaryButton` warning tone | state ∈ {PENDING, SCHEDULED, IN_PROGRESS, FOLLOW_UP_NEEDED} |
| Reassign | `SecondaryButton` | always (except CANCELLED/COMPLETED) |
| Cancel | `GhostButton` destructive tone | state ∈ {PENDING, SCHEDULED, IN_PROGRESS} |
| Reschedule | `SecondaryButton` | state ∈ {PENDING, SCHEDULED} — appears in header between Complete and Escalate |
| Start call | `PrimaryButton` (replaces Complete) | state = SCHEDULED — transitions to IN_PROGRESS and starts timer |

All destructive actions go through confirm modal with reason-text required where server validation demands it.

---

## 9. States

### 9.1 Loading
- Header: `SkeletonText` for user name + id.
- Stepper: skeleton dots.
- Main: 4× `SkeletonCard` blocks.

### 9.2 Not found / no permission
- `ErrorState` centered: "Callback not found or you don't have access." CTA "Back to queue".

### 9.3 Stale data warning
- If callback was last updated <2s ago by another user (SignalR event received), show `AlertBanner` type=info at top: "Updated by <user> — refresh to see changes." [Refresh] ghost button.

### 9.4 Realtime
- SignalR per-callback channel `/hubs/callbacks/{id}` streams events. Timeline prepends new events with 2s highlight.

---

## 10. Accessibility

- Header action buttons grouped in `<div role="toolbar" aria-label="Callback actions">`.
- Stepper as `<ol aria-label="Callback state progress">` with each `<li aria-current="step">` for current.
- Each action button announces its effect: `aria-label="Complete callback — transitions status to Completed"`.
- Confirm modals: focus moves to modal heading; `Esc` cancels; primary action is first focused only after user reads (`aria-describedby` prose).
- Composer: `<label>` for every field; Save button disabled state reflects via `aria-disabled`.
- Keyboard: `Ctrl/Cmd+Enter` in composer submits note.
- Color contrast verified AA for all status dots + labels.

---

## 11. i18n keys (en, hi, bn — sample subset)

```
admin.callback.detail.title
admin.callback.detail.back
admin.callback.detail.id                      # "#CB-{yearMonth}-{seq}"
admin.callback.action.complete
admin.callback.action.escalate
admin.callback.action.reassign
admin.callback.action.cancel
admin.callback.action.reschedule
admin.callback.action.startCall
admin.callback.section.reason
admin.callback.section.linkedEntity
admin.callback.section.linkedEntity.empty
admin.callback.section.linkedEntity.linkCta
admin.callback.section.timeline
admin.callback.section.notes
admin.callback.section.notes.composerPlaceholder
admin.callback.section.notes.outcomeLabel
admin.callback.section.notes.outcome.resolved
admin.callback.section.notes.outcome.needsFollowUp
admin.callback.section.notes.outcome.escalated
admin.callback.section.notes.outcome.noAnswer
admin.callback.section.notes.outcome.wrongNumber
admin.callback.section.notes.outcome.userDeclined
admin.callback.section.notes.duration
admin.callback.section.notes.attachTransition
admin.callback.section.notes.save
admin.callback.section.notes.edit
admin.callback.section.notes.delete
admin.callback.section.meta.category
admin.callback.section.meta.priority
admin.callback.section.meta.sla
admin.callback.section.meta.preferredWindow
admin.callback.section.meta.requestedAt
admin.callback.section.meta.assignedTo
admin.callback.section.contact.call
admin.callback.section.contact.sms
admin.callback.section.contact.copy
admin.callback.section.notifications.title
admin.callback.section.notifications.channel.push
admin.callback.section.notifications.channel.sms
admin.callback.section.notifications.channel.email
admin.callback.confirm.cancel.title
admin.callback.confirm.cancel.reasonLabel
admin.callback.confirm.cancel.confirm
admin.callback.confirm.escalate.title
admin.callback.confirm.reassign.title
admin.callback.confirm.reschedule.title
admin.callback.stale.updatedBy
admin.callback.stale.refresh
admin.callback.error.notFound
admin.callback.error.noAccess
admin.callback.invalidTransition
```

---

## 12. API / data contract

- `GET /callbacks/{id}` → callback with embedded timeline, linked entity summary, recent notes.
- `POST /callbacks/{id}/notes` → add note.
- `POST /callbacks/{id}/transition` body `{ to: Status, reason?: string, note?: string, scheduledAt?, assigneeId? }`.
- `POST /callbacks/{id}/reassign`.
- `GET /callbacks/{id}/notifications`.
- All writes return updated callback + new timeline event for optimistic UI update.
- SignalR hub path: `/hubs/callbacks/{id}`.

*End of CallbackDetailPage spec.*
