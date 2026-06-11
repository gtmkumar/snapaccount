# Wave 7 — Feature UI Specs (implementation-ready)

> **Status:** Specs first; two backend agents are building Wave 7A/7B contracts CONCURRENTLY. Any detail marked **`[confirm 7A]`** / **`[confirm 7B]`** must be reconciled against `docs/api/endpoints.md` Wave 7A/7B sections when they land — do not block UI build on it; use the named field as a placeholder.
> **Grounding:** `docs/design/tokens.json` v2.1.0 (canonical values), `docs/design/component-library.md` (incl. Phase 7 IMS + 6B/6C/6D additions), `docs/design/accessibility-standard.md` (WCAG 2.1 AA + IS 17802 — **mandatory**), `docs/design/design-elevation-spec.md` §3 (ListStates skeleton/empty/error + haptics).
> **Frontend-dev** builds admin (`src/admin/`, React 19 + Tailwind v4); **mobile-dev** builds mobile (`mobile/`, Expo + NativeWind). All user-visible text via `t()` (en/hi/bn). New components are appended to `component-library.md` → "Wave 7 Additions" (see end of this doc).

Covered:
1. CA appointment booking — GAP-031 (mobile + admin)
2. Notification template manager — GAP-037 (admin)
3. Chat bookmarks + thread export — GAP-043 (mobile)
4. Old-device approval — GAP-047 (mobile)
5. GST notice taxonomy & deadlines — GAP-108 (admin + mobile read-only)

**Token / pattern conventions used throughout** (no re-derivation):
- Module accents: GST = `module.gst` Violet `#7C3AED`; Chat/CA = `brand.500` Indigo `#6366F1` (chat surface). ITR = `module.itr`.
- Meaningful secondary text ≥ `text.secondary` (light `#475569`) / `text.tertiary` (light `#64748B`); **never `neutral[400]` for meaning** (a11y §4). `success` text = `success[700] #047857`.
- Every data screen ships **skeleton (shaped) + empty + filtered-empty + error** states (elevation-spec §3.1/3.2/3.6). Mobile uses the `ListStates` kit; admin uses `Skeleton` + `EmptyState` + `ErrorState`.
- Mobile touch targets ≥ **44×44pt**; status chips reserve min-width + allow 2-line wrap (Indic; `[[project_indic_typography]]`).
- hi/bn: +30–40% string expansion, +2pt line-height bump on `sm`/`base` body; amounts stay Western numerals + Indian grouping (₹1,50,000). Apply to every mobile spec below.
- Haptics per elevation-spec §3.3; reduce-motion + reduce-haptics respected.

---

## 1. CA Appointment Booking (GAP-031)

CA (Chartered Accountant) video consultation: slot booking, Meet/Zoom link, reschedule/cancel under a ≥2h rule, reminders (30/5 min), 1–5★ post-call rating. ChatService is additive (Appointment / AppointmentSlot / CaProfile entities). **`[confirm 7A]`** entity/field names, slot granularity, and Meet-link field.

### 1.1 Information architecture & placement

**Mobile** (entry from Chat / CA-consult area — tab 4 "Expert Chat"):
- `CaConsultEntryScreen` is the existing Chat/CA hub. Add an **"Book a video consultation"** primary card at the top (above message threads).
- New `CaBookingStack` (modal stack, pushed from the entry card):
  - `CaSelectScreen` — choose CA (skip if single assigned CA → straight to slots).
  - `SlotPickerScreen` — date strip + time slots.
  - `BookingConfirmScreen` — topic + confirm.
  - `AppointmentConfirmedScreen` — `ResultScreen` (existing mobile generic, Phase 6B §8) success variant.
- `MyAppointmentsScreen` — reached from a "My appointments" row on `CaConsultEntryScreen` and from `MoreScreen`. Tabs: **Upcoming** / **Past**.
- `AppointmentDetailScreen` — reschedule, cancel, join, post-call rating entry.
- `RatingSheet` — bottom sheet, opened post-call (or from a "Rate" CTA on a past appointment).

**Admin** (Sidebar → new "CA Consultations" group, or under existing Chat/Support):
- `/ca/availability` — `CaAvailabilityPage`: define recurring + ad-hoc availability, block slots.
- `/ca/appointments` — `CaAppointmentsPage`: calendar + list views of all bookings, status filter.
- Perms **`[confirm 7A]`**: suggest `ca.availability.manage`, `ca.appointments.read`, `ca.appointments.manage`.

### 1.2 Mobile flows

**Flow A — Book**
1. Tap "Book a video consultation" → `selectionAsync` haptic → `CaSelectScreen` (or skip).
2. `SlotPickerScreen`:
   - **Date strip** = horizontal `DateStrip` (new, §Wave7-Additions): 14–21 day chips (Mon 16 / Tue 17…), today highlighted `brand.500`, selected filled, days with zero free slots rendered disabled (`text.disabled`, not tappable, `accessibilityState={{disabled:true}}`). Each chip ≥ 44pt wide × 56pt tall.
   - **Time-slot grid** = `SlotGrid` of `SlotChip`s below, grouped by part-of-day (Morning / Afternoon / Evening). Each chip shows local IST time `10:30 AM`; booked/past = disabled. **All times rendered IST** with an explicit "All times IST" caption (`text.tertiary`).
   - States: **loading** = `ListStates` skeleton (strip of grey chips + grid silhouette); **empty for selected day** = inline "No slots on this day — try another date"; **error** = `ListStates` error + Try again.
3. Select slot → "Continue" (`PrimaryButton`, sticky bottom) → `BookingConfirmScreen`.
4. `BookingConfirmScreen`:
   - Read-only `SummaryList`: CA name+photo (`Avatar`), date `DD/MM/YYYY`, time `10:30 AM IST`, duration **`[confirm 7A]`** (e.g. 30 min), channel (Google Meet) with platform icon.
   - **Consult topic**: required `Select` (Accounting / GST / ITR / Loan / Other) + optional multiline `TextInput` "What would you like to discuss?" (helps CA prep). `maxLength` 500; counter.
   - "Confirm booking" `PrimaryButton`. On submit: optimistic disabled + spinner; success → `notificationAsync(Success)` → `AppointmentConfirmedScreen`.
5. `AppointmentConfirmedScreen` (`ResultScreen` success): "You're booked", date/time, "Add to calendar" (device calendar deep-link, optional), "View appointment", reminder note: *"We'll remind you 30 minutes and 5 minutes before."*

**Flow B — My appointments**
- `MyAppointmentsScreen` Upcoming/Past via top segmented control (44pt segments).
- Each row = `AppointmentCard` (new): CA avatar+name, topic tag, date/time line, `StatusBadge` (appointment statuses below), and a context CTA:
  - Upcoming & within join window → **"Join call"** (filled `brand.500`) deep-links the Meet/Zoom URL.
  - Upcoming & outside window → time-until line + "Manage" (→ detail).
  - Past, not yet rated → **"Rate"** (opens `RatingSheet`).
  - Past, rated → inline ★ rating read-only.
- Empty (upcoming) → `EmptyState`: calendar icon, "No upcoming consultations", CTA "Book a consultation". Empty (past) → "No past consultations yet" (no CTA).

**Flow C — Reschedule / Cancel (≥2h rule — make the cutoff explicit)**
- `AppointmentDetailScreen` shows full details + an **explicit cutoff line** always visible:
  - When **>2h away**: `text.secondary` info line *"You can reschedule or cancel until {{cutoffTime}} (2 hours before)."* Buttons **Reschedule** + **Cancel** enabled.
  - When **≤2h away (or in progress/past)**: buttons **disabled** (`text.disabled`), with an inline `Alert Banner` (warning variant) explaining *"Rescheduling/cancellation closed — it's within 2 hours of your appointment. Need help? Contact your CA in chat."* + a "Message CA" secondary path. Never silently disable.
  - `[confirm 7A]` whether the 2h rule is server-enforced (it should be — UI computes the same cutoff client-side for display, server is source of truth; on 4xx "too late", show the same warning banner).
- **Reschedule** → returns to `SlotPickerScreen` (reuse) pre-loaded with same CA; confirm replaces the slot. `notificationAsync(Success)`.
- **Cancel** → confirm dialog (mobile bottom sheet, focus-trapped) "Cancel this consultation?" → `notificationAsync(Warning)` on destructive confirm → row moves to Past with `CANCELLED` badge.

**Flow D — Reminders (expectation only; delivery is Notification events `[confirm 7A]`)**
- No dedicated screen. Set expectations on confirm screen + a `reminderNote` row on `AppointmentDetailScreen`: *"Reminders: 30 min and 5 min before, via push."* If push is disabled, show inline hint + "Enable notifications" deep-link to settings.

**Flow E — Post-call rating**
- `RatingSheet` bottom sheet (elevation 4): "How was your consultation with {{caName}}?", a **1–5 star** `StarRatingInput` (each star ≥ 44pt, `accessibilityRole="adjustable"`, value announced "3 of 5 stars"), optional comment `TextInput` (maxLength 300), "Submit". Skippable ("Maybe later"). On submit → `notificationAsync(Success)`, sheet closes, row shows read-only stars.

### 1.3 Admin flows

**`CaAvailabilityPage`** (`/ca/availability`):
- Weekly grid (Mon–Sun columns × time rows) OR list of availability rules. Recommend **rule-based**: `AvailabilityRuleEditor` rows — "Every {{weekday}} {{start}}–{{end}}, {{slotLength}} min slots". Add/edit/delete rules. Plus ad-hoc **block** (vacation/leave) date-range picker that greys those days.
- Live preview column: resolved bookable slots for the next 7 days (so CA sees the effect). Booked slots tinted, free slots outlined.
- Loading = `Skeleton` grid; empty = `EmptyState` "No availability defined — clients can't book yet → Add availability"; error = `ErrorState`.
- Save → `Toast` success.

**`CaAppointmentsPage`** (`/ca/appointments`):
- Two views (tab toggle): **Calendar** (week/day, appointments as blocks colored by status) and **List** (`DataTable`).
- List columns: Client (name + business), Date/Time (IST), Topic, Channel (Meet link icon → copy), `StatusBadge`, actions (View, Join, Cancel-with-reason for CA-initiated).
- Filters: status, date range, CA (if multi-CA admin). Filtered-empty → "No appointments match these filters → Clear filters".
- Row click → `CaAppointmentDetailDrawer`: client + topic + notes, join link, audit (booked/rescheduled/cancelled timeline via existing `StatusTimeline`).

### 1.4 States (loading / empty / error) — summary

| Surface | Loading | Empty | Filtered-empty | Error |
|---|---|---|---|---|
| SlotPicker (mobile) | skeleton strip+grid | "No slots this day" inline | n/a | ListStates error + retry |
| MyAppointments (mobile) | skeleton cards | per-tab EmptyState (+CTA upcoming) | n/a | ListStates error + retry + assisted-callback escape (regulated-adjacent) |
| CaAvailability (admin) | Skeleton grid | EmptyState + Add CTA | n/a | ErrorState + retry |
| CaAppointments (admin) | Skeleton table | EmptyState | "Clear filters" | ErrorState + retry |

### 1.5 Component mapping

| Need | Component | New? |
|---|---|---|
| Date strip | `DateStrip` + `DateChip` | **NEW** (mobile) |
| Time slots | `SlotGrid` + `SlotChip` | **NEW** (mobile) |
| Appointment row | `AppointmentCard` | **NEW** (mobile) |
| Star rating input | `StarRatingInput` | **NEW** (cross-platform) |
| Rating / cancel sheet | existing bottom-sheet pattern (focus-trapped) | reuse |
| Topic select / comment | `Select`, `TextInput` | reuse |
| Confirmation success | `ResultScreen` (Phase 6B) | reuse |
| Status indicator | `StatusBadge` (appointment map below) | reuse + map |
| Reminder/cutoff note | `Alert Banner`, `SummaryList` | reuse |
| Admin availability rules | `AvailabilityRuleEditor` | **NEW** (admin) |
| Admin appts table | `DataTable`, `StatusBadge`, drawer | reuse |
| Admin audit | `StatusTimeline` | reuse |

**Appointment StatusBadge map** (append to component-library):
| Status `[confirm 7A]` | Variant | Icon |
|---|---|---|
| REQUESTED / PENDING | warning | clock |
| CONFIRMED / SCHEDULED | info | calendar-check |
| IN_PROGRESS | brand | video |
| COMPLETED | success (text `success[700]`) | check-circle |
| CANCELLED | neutral | x-circle |
| NO_SHOW | error | user-x |

### 1.6 Accessibility notes

- **Date/slot chips**: `accessibilityRole="button"`; disabled chips `accessibilityState={{disabled:true}}` + label includes reason ("Tuesday 17, fully booked"). Selected = `{{selected:true}}`. Don't convey availability by color alone — disabled chips also drop opacity + lose tap.
- **Star rating**: `accessibilityRole="adjustable"`, increment/decrement via swipe; `accessibilityValue` announces "{{n}} of 5 stars".
- **Cutoff state**: the disabled Reschedule/Cancel buttons must keep an `accessibilityHint` / adjacent live text explaining *why* (≤2h), never a bare disabled control (a11y: don't strand AT users).
- **IST caption** is real meaningful text → `text.tertiary` min, not `neutral[400]`.
- All times localized but **numerals Western + Indian convention**; date `DD/MM/YYYY`.
- Join-call deep-link button labeled "Join video call with {{caName}}".

### 1.7 i18n key suggestions (en)

```
ca.book.cta = "Book a video consultation"
ca.slot.allTimesIst = "All times shown in IST"
ca.slot.empty = "No slots available on this day"
ca.slot.partOfDay.morning / .afternoon / .evening
ca.confirm.title = "Confirm your consultation"
ca.confirm.topicLabel = "What would you like to discuss?"
ca.confirm.topic.accounting / .gst / .itr / .loan / .other
ca.confirm.submit = "Confirm booking"
ca.confirmed.title = "You're booked"
ca.confirmed.reminderNote = "We'll remind you 30 minutes and 5 minutes before."
ca.appts.tab.upcoming / .past
ca.appts.empty.upcoming = "No upcoming consultations"
ca.appts.empty.past = "No past consultations yet"
ca.appt.join = "Join call"
ca.appt.cutoffOpen = "You can reschedule or cancel until {{time}} (2 hours before)."
ca.appt.cutoffClosed = "Rescheduling and cancellation are closed — it's within 2 hours of your appointment."
ca.appt.cutoffClosed.help = "Need help? Message your CA in chat."
ca.appt.reschedule / .cancel / .cancelConfirm = "Cancel this consultation?"
ca.rating.title = "How was your consultation with {{caName}}?"
ca.rating.commentLabel = "Add a comment (optional)"
ca.rating.submit / .later = "Maybe later"
ca.status.requested / .confirmed / .inProgress / .completed / .cancelled / .noShow
ca.admin.availability.title / .addRule / .block
ca.admin.appts.title / .filter.status / .filter.dateRange
```

---

## 2. Notification Template Manager (GAP-037)

Admin-only. Per-`event × channel × language` template CRUD over the **26-event catalog**, with `{{variable}}` substitution, live preview, test-send, active/inactive toggle, and a "falls back to code default" indicator + diff-vs-default view. Goal: copy changes ship with **zero code deployments**. **`[confirm 7B]`** event keys, channel enum, variable manifest per event, template entity shape, test-send endpoint.

### 2.1 Information architecture & placement

- Sidebar → **Settings → Notification Templates** (or Notifications group), route `/notifications/templates`.
- `/notifications/templates` — `TemplateListPage` (the 26-event catalog, filterable).
- `/notifications/templates/:eventKey/:channel/:lang` — `TemplateEditorPage` (split: editor left, live preview right).
- Perms **`[confirm 7B]`**: `notification.templates.read`, `notification.templates.edit`, `notification.templates.testsend`.

### 2.2 Template list

- **Grouping/filtering** — the catalog is large (26 events × N channels × 3 langs), so present as a filtered `DataTable`:
  - **Filters bar** (sticky): Event (searchable `Select` over 26 events, grouped by domain: Auth / GST / ITR / Loan / Document / Billing / System), Channel (`MultiSelect`: Push / SMS / Email / In-app `[confirm 7B]`), Language (`en`/`hi`/`bn` toggle pills).
  - **Rows** = one per resolved event×channel×language cell. Columns: Event (human name + key mono), Channel (icon+label), Language, **Source** chip (`TemplateSourceChip`: "Custom" `brand` / "Default" `neutral`), Active toggle, Updated-at + editor, Actions (Edit, Test-send).
  - **Source = "Default"** means no custom override exists → it falls back to the code default; editing one creates a Custom override.
- States: `Skeleton` table; **empty** only if filters exclude all (filtered-empty "Clear filters") — the 26-event catalog always has rows (defaults exist); `ErrorState` on load failure.
- Bulk: optional "Reset to default" on selected custom rows (confirm dialog).

### 2.3 Template editor (split pane)

`DualPaneEditor` (Phase 6D primitive) — left editor, right live preview. Mobile/responsive fallback: stacks, preview sticky-top (admin is desktop-first, but ≤1024px must stack).

**Left — editor:**
- Header strip: Event name + key, Channel, Language, `TemplateSourceChip`, and a **"Falls back to code default"** info banner when this cell has no custom override yet (editing = create override).
- **Subject** field (Email/Push title only; hidden for SMS) — `TextInput` with variable insertion.
- **Body** — multiline editor (`TemplateBodyEditor`, new) with:
  - **`{{variable}}` palette** (`VariablePalette`, new): chips of the variables valid **for this event** (e.g. `{{userName}}`, `{{gstin}}`, `{{dueDate}}`, `{{amount}}`). Click inserts at cursor. Invalid/unknown variables flagged inline (red underline + "Unknown variable" — won't substitute). `[confirm 7B]` variable manifest per event.
  - Channel-aware constraints: **SMS** shows a character/segment counter (DLT 160-char segments) + a **DLT template-ID** field (`[confirm 7B]` — TRAI DLT requires registered SMS templates; surface the registered template-id and warn if body diverges from the registered DLT text). **Push** shows title+body length caps. **Email** allows a richer body (still `{{var}}` based; note if HTML is supported `[confirm 7B]`).
- **Active / Inactive** `Toggle` (inactive custom template → system uses code default; show that consequence inline).
- Footer: **Save**, **Save & test-send**, **Reset to default** (only if custom), **Discard**. Dirty-state guard on navigate-away.

**Right — live preview:**
- `TemplatePreviewPane` (new) renders the body with **sample data** substituted (sample values per variable from a fixture `[confirm 7B]`; allow editing sample values in a collapsible "Sample data" panel to preview edge cases like long names / large amounts).
- Channel-accurate chrome: Push → notification-bubble mock; SMS → phone-message bubble (plain text, no formatting); Email → email-client frame (subject + from + body); In-app → in-app toast/inbox mock.
- Language-accurate: render in the selected lang; if `hi`/`bn` preview, apply the +2pt line-height and show wrapping (catch overflow early).
- **Diff-vs-default** toggle: `TemplateDiffView` (reuse Phase 6D `DiffViewer`) shows custom body vs code default, color + `+/-` prefixed (color-blind safe), so an editor sees exactly what they changed.

### 2.4 Test-send

- **"Test send"** button → `TestSendDialog`: choose recipient (default = current admin's own phone/email/device `[confirm 7B]`), confirm channel, send. Uses the **current unsaved draft** (so editors validate before save). Result `Toast`: success / failure with reason (e.g. "SMS not delivered — DLT template mismatch").
- Rate-limit guard: disable for a few seconds after a send to avoid spam; show countdown.

### 2.5 States

| Surface | Loading | Empty | Filtered-empty | Error |
|---|---|---|---|---|
| TemplateList | Skeleton table | n/a (defaults always present) | "Clear filters" | ErrorState + retry |
| TemplateEditor | Skeleton split | n/a | n/a | ErrorState + retry; save-conflict (409) → "This template changed since you opened it — reload" |
| Preview | inline spinner in pane | "Add body to preview" placeholder | n/a | "Preview unavailable — fix template errors above" |

### 2.6 Component mapping

| Need | Component | New? |
|---|---|---|
| Split editor/preview | `DualPaneEditor` (6D) | reuse |
| Source indicator | `TemplateSourceChip` | **NEW** |
| Body editor + var insertion | `TemplateBodyEditor` | **NEW** |
| Variable chips | `VariablePalette` | **NEW** |
| Live preview chrome | `TemplatePreviewPane` | **NEW** |
| Diff vs default | `DiffViewer` (6D) wrapped as `TemplateDiffView` | reuse |
| Test send | `TestSendDialog` (Modal + Select) | reuse Modal |
| List | `DataTable`, `Select`, `MultiSelect`, `Toggle` | reuse |
| Char/segment counter | `CharCounter` (inline) | **NEW** (small) |

### 2.7 Accessibility notes

- Variable chips: `accessibilityRole="button"`, label "Insert variable {{userName}}". Inserted tokens in the body must be announced as a unit, not character-by-character.
- Diff view: never color-only — keep `+`/`−` prefixes + text labels "Added"/"Removed".
- Preview pane: `aria-live="polite"` region announces "Preview updated" on change (debounced) so editors using AT know it re-rendered.
- Active/Inactive toggle: state + consequence in the accessible name ("Active — clients receive this custom template").
- All editor chrome via `t()`; the **template content itself** is data (the localized message text), not chrome — it is authored per language by the admin.

### 2.8 i18n key suggestions (en — chrome only)

```
ntpl.list.title = "Notification Templates"
ntpl.list.filter.event / .channel / .language
ntpl.list.col.event / .channel / .language / .source / .active / .updated
ntpl.source.custom = "Custom"
ntpl.source.default = "Default"
ntpl.editor.fallbackBanner = "No custom template yet — this event falls back to the built-in default. Editing creates a custom override."
ntpl.editor.subject / .body / .variables = "Variables"
ntpl.editor.unknownVar = "Unknown variable — won't be substituted"
ntpl.editor.sms.segments = "{{count}} segment(s) · {{chars}} chars"
ntpl.editor.sms.dltId = "DLT template ID"
ntpl.editor.active = "Active"
ntpl.editor.save / .saveTest = "Save & test send" / .reset = "Reset to default" / .discard
ntpl.preview.title = "Live preview" / .sampleData = "Sample data" / .diff = "Compare to default"
ntpl.test.title = "Send a test" / .recipient / .send / .success / .failure
ntpl.conflict = "This template changed since you opened it — reload to see the latest."
```

---

## 3. Chat Bookmarks + Thread Export (GAP-043)

Mobile only. Long-press to bookmark a message, a bookmarks list with jump-to-message, and export-thread-as-PDF via share sheet. **Admin: nothing for this gap** (note recorded — no admin UI). Bookmark flag on messages + export via ReportService. **`[confirm 7A]`** bookmark endpoint, export job/poll shape, PDF asset URL.

### 3.1 Information architecture & placement

- Lives inside the existing `ChatDetailScreen` (one of the 2 already-themed screens — respect its dark-mode token usage).
- New `ChatBookmarksScreen` — reached from a **bookmark icon in `ChatDetailScreen` header** (`rightActions`) and/or a thread overflow menu.
- Export action lives in the **thread overflow menu** (`⋯` in header).

### 3.2 Flows

**Bookmark toggle (long-press):**
- Long-press a message bubble → `selectionAsync` haptic → context action sheet (or inline popover) with **Bookmark / Remove bookmark**, plus existing actions (Copy, etc. if any). Optimistic toggle.
- Bookmarked messages show a small **bookmark glyph** in the bubble corner (`brand.500`, also `accessibilityLabel="Bookmarked"`). Toggle off removes it.
- No bulk; idempotent.

**Bookmarks list:**
- `ChatBookmarksScreen`: list of bookmarked messages (newest first), each row = sender avatar + name, message snippet (2 lines, ellipsis), timestamp `DD/MM/YYYY HH:mm`, source thread name. Tap → returns to `ChatDetailScreen` **scrolled to and briefly highlighting** that message (jump-to-message: flash the bubble `info.100` for ~800ms, respect reduce-motion → static highlight).
- Swipe-to-remove (or row trailing icon) un-bookmarks; `notificationAsync(Warning)` on destructive.
- States: `ListStates` skeleton rows; **empty** → `EmptyState` bookmark icon "No bookmarks yet", guidance "Long-press any message to save it here"; error → ListStates error + retry.

**Export thread as PDF:**
- Overflow `⋯` → "Export chat as PDF". Opens a small confirm sheet (optional date-range `[confirm 7A]`; default = whole thread). "Generate PDF".
- Export is likely async (ReportService job): show a **non-blocking progress state** — inline "Preparing your PDF…" with a spinner, or a toast; on completion → **device share sheet** with the PDF (`expo-sharing`). `notificationAsync(Success)` on ready.
- Failure → recoverable error toast + "Try again". Long jobs → keep working; notify via push when done if the user navigates away (`[confirm 7A]` whether export is sync or job-based — design supports both: if sync, skip the progress state).
- Watermark/footer on the PDF is ReportService's concern, not UI — but note: the exported doc may be kept as a tax-position record (retention), so the export confirm copy should not imply it's a legal/official document.

### 3.3 Component mapping

| Need | Component | New? |
|---|---|---|
| Message bubble bookmark glyph | extend existing chat bubble (`bookmarked` prop) | reuse + prop |
| Long-press action sheet | existing action-sheet/bottom-sheet | reuse |
| Bookmarks list row | `BookmarkRow` | **NEW** (mobile) |
| Jump-to-message highlight | bubble `highlightPulse` transient state | **NEW** (small, mobile) |
| Export confirm sheet | bottom sheet + optional DatePicker | reuse |
| Export progress | `Toast` / inline progress + `Spinner` | reuse |
| Share | `expo-sharing` (no UI component) | platform |

### 3.4 Accessibility notes

- Long-press is **not the only path**: also expose Bookmark via an accessible per-message action (the action sheet is AT-reachable; a long-press-only affordance fails operability). Message bubble exposes a custom accessibility action "Bookmark".
- Bookmark glyph has a text alternative; bookmarked state in the bubble's accessible name.
- Jump-to-message: after navigation, move AT focus to the target message and announce "Jumped to bookmarked message".
- Export progress announced via live region; share sheet is OS-native (accessible).

### 3.5 i18n key suggestions (en)

```
chat.bookmark.add = "Bookmark" / .remove = "Remove bookmark" / .added = "Bookmarked"
chat.bookmarks.title = "Bookmarks"
chat.bookmarks.empty.title = "No bookmarks yet"
chat.bookmarks.empty.guidance = "Long-press any message to save it here."
chat.bookmarks.jumped = "Jumped to bookmarked message"
chat.export.action = "Export chat as PDF"
chat.export.confirm = "Generate PDF"
chat.export.preparing = "Preparing your PDF…"
chat.export.ready = "Your PDF is ready"
chat.export.failed = "Couldn't generate the PDF"
```

> **Admin:** No admin surface for GAP-043. Recorded intentionally — do not build an admin bookmarks/export view.

---

## 4. Old-Device Approval (GAP-047)

Mobile only. New-device login triggers a push to existing (old) devices; the old device approves/denies within a **10-minute** window; the new device waits; deny → blocked + support path. Includes a **soft-launch "notify-only" mode** (banner, no gate). Max-2-devices already enforced in domain. **`[confirm 7A]`** approval-request shape, push payload, poll/realtime channel, expiry field, soft-launch flag.

### 4.1 Information architecture & placement

- **OLD device:** push notification → tap → `DeviceApprovalScreen` (modal, top of stack, interrupts current screen). Also reachable from a persistent in-app banner/notification-center entry while a request is pending.
- **NEW device:** during login, after OTP success, if approval is required → `DeviceWaitingScreen` (replaces the post-OTP transition); on approve → proceeds to home/onboarding; on deny/expiry → `DeviceDeniedScreen`.
- Both integrate with the existing auth/onboarding stack and the existing **Devices** settings screen (which lists active devices).

### 4.2 Flows

**NEW device — waiting:**
- `DeviceWaitingScreen`: illustration (phone-to-phone), headline *"Approve this device"*, body *"We sent a request to your other device. Open SnapAccount there to approve this login."*, a **live countdown** (`CountdownCard` reuse, 10:00 → 0:00), and the **new-device metadata we're showing the old device** echoed here for trust ("This device: {{model}}, {{cityApprox}}, {{time}}").
- Secondary affordances: **"Resend request"** (if backend supports re-push `[confirm 7A]`), **"Use a different way"** → the **assisted-callback / support** escape (a11y-required alternative for users who no longer have the old device).
- On approve (push/realtime or poll) → `notificationAsync(Success)` → continue auth.
- On expiry (countdown hits 0) → transition to a **timeout** variant of `DeviceDeniedScreen` ("Request expired — start again").

**OLD device — approval:**
- `DeviceApprovalScreen` (modal, focus-trapped, **cannot be casually dismissed** — explicit Approve/Deny or "Decide later"):
  - Headline *"New sign-in attempt"*, security tone (shield icon, `warning`/`info` accent — not alarmist red unless deny-recommended).
  - **New-device metadata card** (`DeviceMetaCard`, new): Model/OS (`{{model}} · {{os}}`), approximate location (`{{cityApprox}}` — "ish", derived from IP; label it "Approximate location"), time (`DD/MM/YYYY HH:mm IST`). **`[confirm 7A]`** which fields are available.
  - **Live 10-min countdown** (`CountdownCard`): "Expires in 9:42".
  - Two clear actions: **Approve** (`PrimaryButton`, success-tinted) and **Deny** (`SecondaryButton`/destructive, `error`). Deny is **emphasized as the safe choice if "this wasn't you"** — guidance line: *"Didn't try to sign in? Deny — your account stays protected."*
  - Approve → `notificationAsync(Success)` → "Device approved" confirm → new device gets in.
  - Deny → `notificationAsync(Warning)` → confirm "Sign-in blocked" + prompt to **secure account** (change password / review devices via existing Devices screen).

**NEW device — denied / blocked:**
- `DeviceDeniedScreen`: error illustration, *"Sign-in blocked"*, plain cause (*"The request was denied on your other device"* / *"The request expired"*), and a **support path**: "If this was you, you can {{re-verify / contact support}}". Provide the **assisted-callback** escape (regulated-flow rule). No dead-end.

**Soft-launch (notify-only) mode:**
- When the feature is in soft-launch (`[confirm 7A]` flag, likely remote-config/backend), **do not gate** the login. Instead:
  - NEW device proceeds straight to home (no `DeviceWaitingScreen`).
  - OLD device(s) receive a **notify-only push** + an in-app **`Alert Banner` (info)** on next open: *"A new device signed in: {{model}}, {{cityApprox}}, {{time}}. Not you? Review your devices."* → deep-links the Devices screen. No approve/deny actions, no countdown.
  - This lets the team observe + collect telemetry before enforcing (mirrors the device-attestation soft-fail strategy GAP-064).
- UI must branch on the mode flag at the auth decision point; both code paths ship together.

### 4.3 States

| Surface | Loading | Pending | Success | Error/Deny | Expiry |
|---|---|---|---|---|---|
| DeviceWaiting (new) | spinner while establishing | countdown + "waiting" | proceed to home | DeviceDenied | timeout variant |
| DeviceApproval (old) | metadata skeleton if fetched | countdown live | "Device approved" | — | "Request expired" auto-dismiss |
| DeviceDenied (new) | — | — | — | support path / re-verify | "Request expired — start again" |
| Soft-launch banner | — | — | — | — | dismissible info banner |

### 4.4 Component mapping

| Need | Component | New? |
|---|---|---|
| Countdown (10 min) | `CountdownCard` (6D) | reuse (set thresholds: warn ≤2min) |
| New-device metadata | `DeviceMetaCard` | **NEW** (mobile) |
| Waiting screen | `ResultScreen`-style waiting variant or dedicated screen | reuse pattern |
| Denied screen | `ResultScreen` error variant / `ErrorState` | reuse |
| Soft-launch notice | `Alert Banner` (info) | reuse |
| Approve/Deny | `PrimaryButton` / `SecondaryButton` | reuse |
| Support escape | assisted-callback entry (CallbackService) | reuse a11y pattern |

### 4.5 Accessibility notes

- **DeviceApprovalScreen** is security-critical: focus-trapped, AT focus lands on the headline then metadata; Approve and Deny both clearly labeled with consequence ("Approve sign-in from {{model}}", "Deny and block this sign-in"). Never rely on color alone to distinguish — text + icon.
- Countdown: live region announces at milestones (e.g. 2:00, 1:00, expiry) rather than every second (avoid AT spam). `CountdownCard` already exposes `accessibilityRole`/value.
- "Approximate location" must be **labeled as approximate** in the accessible name (don't imply precise tracking).
- The **assisted-callback escape** must be present and reachable on `DeviceWaitingScreen` and `DeviceDeniedScreen` for users who lost the old device (a11y §3 — equivalent path).
- Soft-launch banner dismissible + announced; deep-link target ("Review your devices") clearly labeled.
- All copy `t()` (en/hi/bn); security/consequence text never truncated (Indic expansion → wraps).

### 4.6 i18n key suggestions (en)

```
device.waiting.title = "Approve this device"
device.waiting.body = "We sent a request to your other device. Open SnapAccount there to approve this login."
device.waiting.thisDevice = "This device: {{model}}, {{location}}, {{time}}"
device.waiting.resend = "Resend request"
device.waiting.otherWay = "Can't access your other device?"
device.approval.title = "New sign-in attempt"
device.approval.meta.model / .location = "Approximate location" / .time
device.approval.expiresIn = "Expires in {{mm}}:{{ss}}"
device.approval.approve = "Approve" / .deny = "Deny"
device.approval.denyHint = "Didn't try to sign in? Deny — your account stays protected."
device.approval.approved = "Device approved"
device.approval.denied = "Sign-in blocked"
device.approval.secure = "Review your devices"
device.denied.title = "Sign-in blocked"
device.denied.cause.denied = "The request was denied on your other device."
device.denied.cause.expired = "The request expired."
device.denied.support = "If this was you, contact support or try again."
device.softlaunch.banner = "A new device signed in: {{model}}, {{location}}, {{time}}. Not you? Review your devices."
```

---

## 5. GST Notice Taxonomy & Deadlines (GAP-108)

Admin notice-inbox upgrades: **form-type taxonomy badges** (ASMT-10 / DRC-01 / DRC-01A / DRC-01B / DRC-01C / ADT-01), **statutory deadline chips** (reuse `DueDateChip` thresholds), a **GSTAT appeal-stage tracker** column, and a **DRC-01B/01C pre-filing simulator** entry banner on the reconciliation page. Mobile: **read-only notice-detail parity**. Extends the existing notice tracker (`docs/design/admin/gst/notice-tracker-list-page.md`, `notice-detail-page.md`) + mobile `notice-inbox-screen.md`. **`[confirm 7B]`** notice form-type enum, statutory-deadline source/field, GSTAT stage enum, simulator endpoint.

### 5.1 Information architecture & placement

- **Admin:** existing GST → Notices (`/gst/notices`, `/gst/notices/:id`). Add taxonomy + deadline + GSTAT to list + detail. Simulator entry = a **banner on the GST reconciliation page** (`/gst/reconciliation` / ITC-mismatch page) and an entry from a DRC-01B/01C notice detail.
- **Mobile:** existing GST notice inbox + detail (`GstNoticeInboxScreen`, `GstNoticeDetailScreen`) gain the same taxonomy badge + deadline chip + GSTAT stage, **read-only** (no reply/simulate on mobile in this wave).
- Module accent: `module.gst` Violet. Perms reuse existing GST notice perms (`[confirm 7B]`).

### 5.2 Form-type taxonomy badges

New `NoticeFormTypeBadge` — a `Tag`/`Badge` variant carrying the **statutory form code** + a plain-language tooltip. This is **distinct from `StatusBadge`** (which carries the RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED lifecycle, Phase 6B). Form-type is the *kind* of notice; status is *where it is in our workflow*. Both show on a row.

| Form code | Meaning (tooltip) | Variant (semantic re-use) | Icon |
|---|---|---|---|
| ASMT-10 | Scrutiny of returns — discrepancy notice | warning | file-search |
| DRC-01 | Show-cause notice (demand) | error | alert-octagon |
| DRC-01A | Pre-SCN intimation of liability | warning | alert-triangle |
| DRC-01B | Liability mismatch (GSTR-1 vs 3B) | accent (brand) | git-compare |
| DRC-01C | ITC mismatch (GSTR-2B vs 3B) | accent (brand) | git-compare |
| ADT-01 | Audit notice (departmental audit) | info | clipboard-check |

- These are **semantic re-uses of existing color scales** (like the IMS StatusBadge map) → no new token values; record as a component-level map in `component-library.md`.
- DRC-01B/01C carry the **"Simulate before filing"** affordance (see §5.5); badge for these two is `accent` to signal an available preventive action.
- The badge label is the **form code verbatim** (`ASMT-10`), never relabeled — operators and CAs recognize the statutory codes. The plain-language meaning is the tooltip / accessible description.

### 5.3 Statutory deadline chips

- Reuse **`DueDateChip`** (Phase 6B countdown composite) for the **statutory response deadline** of each notice. Source = the notice's statutory due date (`[confirm 7B]` field — likely `responseDueDate`/`statutoryDeadline`).
- Thresholds (align to the existing notice/DueDateChip convention; IMS used ≤3/4–7/>7 — for statutory notices use a slightly wider band given longer windows):
  - **≤ 3 days** → error ("Due in 2 days")
  - **4–7 days** → warning
  - **> 7 days** → neutral/info
  - **past due** → error filled ("Overdue by N days")
  - **responded/closed** → suppress countdown; show static "Responded on DD/MM/YYYY".
- `[confirm 7B]` whether statutory deadlines differ by form-type (e.g. ASMT-10 typically 30 days, DRC-01A 7 days) — the deadline value comes from the server; the chip only renders `daysLeft`. If the server doesn't yet compute it, show a neutral "Deadline: DD/MM/YYYY" without countdown (graceful degrade).

### 5.4 GSTAT appeal-stage tracker column

- New `GstatStageTracker` — a compact horizontal stage indicator (reuse the **`StatusTimeline` horizontal/Stepper** primitive, 6D) for notices that have escalated to appeal. Stages **`[confirm 7B]`** (suggested GST appeal ladder):
  - `ORIGINAL_ORDER` → `APPEAL_FILED` (First Appellate Authority) → `APPELLATE_ORDER` → `GSTAT_FILED` (Tribunal) → `GSTAT_HEARING` → `GSTAT_ORDER` → `CLOSED`.
- In the **list**, render as a compact `GstatStageChip` (current stage label + a small step indicator "Stage 3 of 6"); full ladder shows in **detail**.
- **Backlog-appeal deadline 30 Jun 2026** is a hard flag: when a notice is appeal-eligible and the backlog window applies, surface a **prominent `Alert Banner` (error/warning)** on the notice detail and a flag chip in the list: *"GSTAT backlog appeal — file by 30/06/2026."* `[confirm 7B]` how eligibility is signaled.
- Notices not in appeal → column shows "—" (no tracker).

### 5.5 DRC-01B / 01C pre-filing simulator entry

- The simulator **runs on the existing reconciliation engine** (GSTR-1 vs 3B for 01B; GSTR-2B vs 3B / ITC for 01C). UI = an **entry point only** in this wave (the simulator screen itself may be a follow-on; design the banner + entry now):
  - **Reconciliation page banner** (`SimulatorEntryBanner`, info/accent): *"Avoid a DRC-01B/01C notice — check your GSTR-1 vs 3B (and 2B vs 3B) for mismatches before you file."* CTA **"Run pre-filing check"**.
  - **From a DRC-01B/01C notice detail**: a "Simulate / reconcile this mismatch" CTA that opens the same reconciliation view scoped to the period in question.
- The simulator result (when built) reuses existing reconciliation/ITC-mismatch table UI (`ItcMismatchPage` patterns) — this spec only fixes the **entry placement + copy**; mark the result screen `[confirm 7B]` pending the simulator endpoint.
- **AI reply-draft (AiService P7c)** is out of scope for this wave's UI but leave a forward-compatible slot on notice detail: a disabled/"coming" affordance is NOT shipped (per project rule against Coming-Soon stubs in front of users) — simply omit until P7c lands.

### 5.6 Mobile read-only parity

- `GstNoticeInboxScreen` rows gain: `NoticeFormTypeBadge` + `DueDateChip` + (if appealing) `GstatStageChip`. Existing `StatusBadge` stays.
- `GstNoticeDetailScreen` (read-only): form-type badge + meaning, statutory deadline chip, full GSTAT ladder (read-only `StatusTimeline` vertical), backlog-deadline banner if applicable, and the existing PDF/attachment view. **No reply, no simulate** on mobile this wave — if the user taps an action, route to "Open in admin / contact your CA" guidance (no dead Coming-Soon).
- Apply Indic rules: form-code badges keep the Latin code (`ASMT-10`) but the meaning text wraps; deadline chip labels localized; numerals Western + Indian grouping.

### 5.7 States

| Surface | Loading | Empty | Filtered-empty | Error |
|---|---|---|---|---|
| Notice list (admin) | Skeleton table | EmptyState "No notices" | "Clear filters" | ErrorState + retry |
| Notice detail (admin) | Skeleton detail | n/a | n/a | ErrorState + retry |
| Recon banner | n/a (static) | hidden if no recon data | n/a | hide banner on recon error |
| Notice inbox/detail (mobile) | ListStates skeleton | EmptyState | n/a | ListStates error + retry |

### 5.8 Component mapping

| Need | Component | New? |
|---|---|---|
| Form-type badge | `NoticeFormTypeBadge` (Tag variant + tooltip) | **NEW** (map only) |
| Statutory deadline | `DueDateChip` (6B) | reuse + thresholds |
| Workflow status | `StatusBadge` Notice map (6B) | reuse |
| GSTAT ladder (list) | `GstatStageChip` | **NEW** (small) |
| GSTAT ladder (detail) | `StatusTimeline` / `Stepper` (6D/6E) | reuse |
| Backlog flag | `Alert Banner` (error/warning) | reuse |
| Simulator entry | `SimulatorEntryBanner` | **NEW** (small) |
| Mobile rows | extend `NoticeRowMobile` (6B) | reuse + props |
| Recon table (result) | `ItcMismatchPage` patterns | reuse `[confirm 7B]` |

### 5.9 Accessibility notes

- **Form-type badge**: the code (`DRC-01B`) is meaningful but cryptic — accessible name = code **+** plain meaning ("D R C 0 1 B, ITC mismatch notice"). Don't rely on the badge color to convey severity; severity is also in the icon + the deadline chip.
- `DueDateChip`: accessible label = the **urgency phrase** ("Response due in 2 days"), not just a number (same rule as IMS spec §4 — countdown is decision-critical).
- GSTAT tracker: `StatusTimeline` already exposes per-node `accessibilityState`; the compact chip announces "Appeal stage 3 of 6: Appellate order".
- Backlog banner: error/warning Alert Banner announced via live region; the date `30/06/2026` not truncated; copy via `t()`.
- All form codes/labels via `t()`; tooltips keyboard-accessible (focus + Esc) on admin, long-press/accessible-description on mobile.

### 5.10 i18n key suggestions (en)

```
gst.notice.formType.asmt10 = "ASMT-10" (label) / .asmt10.meaning = "Scrutiny of returns"
gst.notice.formType.drc01 / .drc01a / .drc01b / .drc01c / .adt01 (+ .meaning each)
gst.notice.deadline.dueIn = "Response due in {{days}} days"
gst.notice.deadline.overdue = "Overdue by {{days}} days"
gst.notice.deadline.respondedOn = "Responded on {{date}}"
gst.notice.gstat.stage = "Appeal stage {{current}} of {{total}}: {{label}}"
gst.notice.gstat.stage.originalOrder / .appealFiled / .appellateOrder / .gstatFiled / .gstatHearing / .gstatOrder / .closed
gst.notice.gstat.backlogFlag = "GSTAT backlog appeal — file by 30/06/2026"
gst.recon.simulator.banner = "Avoid a DRC-01B/01C notice — check GSTR-1 vs 3B and 2B vs 3B before you file."
gst.recon.simulator.cta = "Run pre-filing check"
gst.notice.simulate.cta = "Reconcile this mismatch"
gst.notice.mobile.actionInAdmin = "Reply to this notice in the web admin or message your CA."
```

---

## 6. Cross-cutting checklist (for frontend-dev + mobile-dev)

- [ ] Use **only** `tokens.json` v2.1.0 values; meaningful text ≥ `text.secondary`/`text.tertiary`; `success` text = `success[700]`; never `neutral[400]` for meaning.
- [ ] Every list/data screen: shaped **skeleton** + designed **empty** + **filtered-empty** (clear-filters) + recoverable **error** (Try again + escape). Mobile uses `ListStates`; admin uses `Skeleton`/`EmptyState`/`ErrorState`.
- [ ] Mobile touch targets ≥ 44×44pt (date/slot/star chips, bookmark glyph tap area, approve/deny buttons).
- [ ] hi/bn: containers wrap (no truncation of consequence/legal/deadline text), +2pt line-height on `sm`/`base`; amounts Western numerals + Indian grouping; dates `DD/MM/YYYY`; times IST.
- [ ] Reduce-motion respected (slot animations, jump-to-message pulse, countdown); haptics per elevation-spec §3.3 + reduce-haptics.
- [ ] All AT-visible + user-visible strings via `t()` (en/hi/bn parity). No hardcoded English (GAP-061 discipline).
- [ ] Status/severity never color-only — always icon + text (badges, deny button, diff view).
- [ ] Focus-trap: RatingSheet, cancel/confirm sheets, DeviceApprovalScreen, TestSendDialog.
- [ ] Live regions: preview-updated, export-progress, countdown milestones, error announcements.
- [ ] Regulated/security flows (CA booking errors, device approval) offer the **assisted-callback** escape (CallbackService) for users who can't complete the primary path.
- [ ] Reconcile every **`[confirm 7A]`/`[confirm 7B]`** marker against `docs/api/endpoints.md` Wave 7A/7B when contracts land.

---

## 7. New components → see `component-library.md` → "Wave 7 Additions"

Appended this wave (full specs in component-library.md):
- **Mobile:** `DateStrip`/`DateChip`, `SlotGrid`/`SlotChip`, `AppointmentCard`, `StarRatingInput` (cross-platform), `BookmarkRow`, message-bubble `bookmarked` + `highlightPulse`, `DeviceMetaCard`.
- **Admin:** `TemplateSourceChip`, `TemplateBodyEditor`, `VariablePalette`, `TemplatePreviewPane`, `CharCounter`, `AvailabilityRuleEditor`, `SimulatorEntryBanner`.
- **Cross / map-only (no new tokens):** `NoticeFormTypeBadge` (form-code map), `GstatStageChip`, Appointment `StatusBadge` map, Notification template `TemplateSourceChip` states.
- **Reused (no change):** `DueDateChip`, `StatusBadge`, `StatusTimeline`/`Stepper`, `CountdownCard`, `DualPaneEditor`, `DiffViewer`, `ResultScreen`, `EmptyState`/`ErrorState`/`Skeleton`/`ListStates`, `Alert Banner`, `Toast`, `SummaryList`, `Select`/`MultiSelect`/`TextInput`/`Toggle`, `DataTable`, bottom-sheet pattern.
