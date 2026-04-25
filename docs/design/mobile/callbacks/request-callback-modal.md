# RequestCallbackModalScreen — Mobile Form

> **Screen:** `RequestCallbackModalScreen`
> **Presentation:** Modal (iOS: formSheet; Android: full-screen with slide-up)
> **Nav params:** `{ category?, linkedEntity?, prefillReason? }`
> **Phase:** 6E
> **Design system:** tokens + component-library.

---

## 1. Purpose

Capture the minimum viable information to create a callback: category, preferred time window, reason. Submit → server creates the callback; on success, navigate to `CallbackStatusScreen`.

---

## 2. Layout

```
 ── drag handle ── (iOS formSheet only)
┌─ Header ─────────────────────────────────────┐
│ ✕        Request a callback              ·    │
├─ Context card (if linkedEntity) ──────────────┤
│ About: GSTR-3B · Mar 2026  [change ↗]         │
├─ Form ────────────────────────────────────────┤
│ Category                                       │
│  [ GST ] [ ITR ] [ Docs ] [ Loan ]  [More ▾]  │
│                                                │
│ Preferred time                                 │
│ ◉ As soon as possible (SLA: ~30 min)           │
│ ○ Today, choose window                         │
│ ○ Tomorrow, choose window                      │
│ ○ Another day                                  │
│    [ date picker ]                             │
│    [ 10:00 ] — [ 12:00 ]                       │
│                                                │
│ What do you need help with?                    │
│ ┌────────────────────────────────────────────┐ │
│ │ I'm not sure how to reconcile ITC for     │ │
│ │ last month.                                │ │
│ └────────────────────────────────────────────┘ │
│ 0 / 500                                         │
│                                                │
│ Priority ▾ (optional)                          │
│  LOW · NORMAL (default) · HIGH · URGENT        │
│                                                │
│ Language for the call (optional)               │
│  [ English ] [ हिन्दी ] [ বাংলা ]              │
├─ Footer (sticky) ─────────────────────────────┤
│ [ Cancel ]              [ Request callback ]   │
└────────────────────────────────────────────────┘
```

### 2.1 Header
- Close icon (`✕`) top-left, 44×44pt hit target, `accessibilityLabel="Close"`.
- Title centered, `fontSize.lg`, `fontWeight.semibold`.

### 2.2 Context card
- Shown only if `linkedEntity` param provided.
- Module icon tinted, entity label, "change" link opens an inline picker to swap/remove linkage.
- Background `color.surface.subtle`, `radius.md`, `spacing.3` padding.

### 2.3 Category selector
- Segmented pill row. Primary categories as direct chips; "More ▾" reveals BILLING / OTHER.
- Selected chip: `color.brand.500` bg, white text.
- Unselected: `color.neutral.100` bg, `color.neutral.700` text.
- Pre-selected from nav param if provided.
- Minimum chip height 44pt.

### 2.4 Preferred time
- Radio group (`Radio` component). Default selection: "As soon as possible".
- When "Another day" selected: `DatePicker` appears inline, min = today, max = today + 14 days.
- For "Today, choose window" or "Tomorrow": show time range picker with 30-min granularity, minimum window 1 hour.
- Time window picker uses two `Select` components or a dual-slider — dual-slider preferred on mobile for one-handed use.
- SLA hint text below selected option in `color.neutral.500`, `fontSize.xs`.

### 2.5 Reason textarea
- `Textarea` 4–10 rows auto-expanding, max 500 chars.
- Live char counter bottom-right.
- Placeholder localized per category (e.g., "Describe your GST question…").
- Pre-filled with `prefillReason` nav param when present.
- Not strictly required, but submit button is disabled until either reason ≥20 chars OR linkedEntity provided — so the CA has context.

### 2.6 Priority (optional)
- Collapsed accordion "Priority (optional)"; expand reveals 4-chip selector. Default NORMAL. Users may escalate to HIGH freely; URGENT requires a confirm sheet "Reserved for time-critical issues — continue?" to prevent misuse.

### 2.7 Call language (optional)
- 3 chips for en/hi/bn; user can deselect all (default to user's profile language).

### 2.8 Footer
- Sticky bottom with `safe-area-inset-bottom`.
- Cancel: `SecondaryButton`, minimum 48pt height.
- Request callback: `PrimaryButton`, brand variant, full-width priority — 60% of row. Disabled until validation passes.

---

## 3. Validation rules

| Field | Rule | Error message (en) |
|---|---|---|
| Category | required | "Please pick a category." |
| Preferred time | required (default valid) | — |
| Custom window | end ≥ start + 60 min; both within business hours 09:00–20:00 IST | "Window must be at least 1 hour, between 9am and 8pm." |
| Custom date | not in past; not > 14 days out | "Pick a date within the next 2 weeks." |
| Reason | ≥20 chars OR linkedEntity present | "Add a quick note so we know how to help." |
| Reason | ≤500 chars | "Keep it under 500 characters." |
| URGENT priority | requires confirm sheet | (confirm sheet message) |

Inline errors use `color.error.600` text below the offending field, `fontSize.xs`.

---

## 4. States

### 4.1 Idle
- As drawn; submit disabled until validation passes.

### 4.2 Submitting
- Primary button shows spinner, label "Requesting…", button and form disabled.
- Optimistic navigate after 600ms if response pending (shows `CallbackStatusScreen` with skeleton).

### 4.3 Success
- Navigate to `CallbackStatusScreen`. Modal dismissed.
- Toast on host screen: "Request sent — we'll call you back".

### 4.4 Error
- Keep modal open. `AlertBanner` type=error pinned below header: "Couldn't send your request. [Retry]". Form values preserved.
- Specific errors:
  - Conflict (already have open callback in this category): banner with CTA "View existing callback" → `CallbackStatusScreen` for that callback id.
  - Rate limit: banner "You can request at most 3 callbacks per hour. Try again in {time}."

### 4.5 Offline
- Submit button disabled; inline banner "You're offline. Connect to send this request."
- Queue-offline **NOT** supported in 6E (per gap analysis — offline queue is a later phase). Document as "Needs design review" in §10 below.

---

## 5. Accessibility

- Modal: `accessibilityViewIsModal=true`; focus on title on mount; Esc / back gesture dismisses.
- Every field has explicit `<label>` and `accessibilityLabel`.
- Segmented pill row: `accessibilityRole="radiogroup"`, each chip `role="radio"` with `accessibilityState={ selected }`.
- Character counter announces at 90% and 100% of max via `AccessibilityInfo.announceForAccessibility`.
- Dynamic type supported up to XXL; chips wrap to 2 rows when font scale > 120%.
- Minimum 44×44pt on every chip, radio, button, picker control.
- Focus order: close → context card → category → time radios → (window picker if visible) → reason → priority → language → cancel → submit.

---

## 6. Motion
- Modal enter: slide up 250ms, ease-out.
- Field reveal (date picker on "Another day"): 160ms height transition, respects reduced motion.
- Button press: 95% scale on tap, 100ms.

---

## 7. i18n — key list + sample strings in en / hi / bn

### 7.1 Keys
```
mobile.callback.modal.title
mobile.callback.modal.close
mobile.callback.modal.context.about           # "About: {label}"
mobile.callback.modal.context.change
mobile.callback.modal.category.label
mobile.callback.modal.category.more
mobile.callback.modal.category.gst
mobile.callback.modal.category.itr
mobile.callback.modal.category.doc
mobile.callback.modal.category.loan
mobile.callback.modal.category.billing
mobile.callback.modal.category.other
mobile.callback.modal.time.label
mobile.callback.modal.time.asap
mobile.callback.modal.time.asapHint           # "SLA: ~{minutes} min"
mobile.callback.modal.time.today
mobile.callback.modal.time.tomorrow
mobile.callback.modal.time.otherDay
mobile.callback.modal.time.windowLabel        # "Preferred window"
mobile.callback.modal.reason.label
mobile.callback.modal.reason.placeholder.gst
mobile.callback.modal.reason.placeholder.itr
mobile.callback.modal.reason.placeholder.doc
mobile.callback.modal.reason.placeholder.loan
mobile.callback.modal.reason.placeholder.billing
mobile.callback.modal.reason.placeholder.other
mobile.callback.modal.reason.counter          # "{current} / {max}"
mobile.callback.modal.priority.label
mobile.callback.modal.priority.low
mobile.callback.modal.priority.normal
mobile.callback.modal.priority.high
mobile.callback.modal.priority.urgent
mobile.callback.modal.priority.urgentConfirmTitle
mobile.callback.modal.priority.urgentConfirmBody
mobile.callback.modal.language.label
mobile.callback.modal.language.en
mobile.callback.modal.language.hi
mobile.callback.modal.language.bn
mobile.callback.modal.cta.cancel
mobile.callback.modal.cta.submit
mobile.callback.modal.error.category
mobile.callback.modal.error.reason
mobile.callback.modal.error.window
mobile.callback.modal.error.date
mobile.callback.modal.error.submitGeneric
mobile.callback.modal.error.conflict          # "You already have an open callback in this category."
mobile.callback.modal.error.conflict.viewExisting
mobile.callback.modal.error.rateLimit         # "Try again in {time}."
mobile.callback.modal.error.offline
mobile.callback.modal.toast.success
```

### 7.2 Sample strings (en / hi / bn)

| Key | en | hi | bn |
|---|---|---|---|
| modal.title | "Request a callback" | "कॉलबैक का अनुरोध करें" | "কলব্যাক অনুরোধ করুন" |
| modal.time.asap | "As soon as possible" | "जितनी जल्दी हो सके" | "যত তাড়াতাড়ি সম্ভব" |
| modal.time.today | "Today, choose window" | "आज, समय चुनें" | "আজ, সময় বেছে নিন" |
| modal.reason.label | "What do you need help with?" | "किस बारे में मदद चाहिए?" | "আপনার কী সাহায্য দরকার?" |
| modal.reason.placeholder.gst | "Describe your GST question…" | "अपना GST सवाल बताएं…" | "আপনার GST প্রশ্ন লিখুন…" |
| modal.cta.submit | "Request callback" | "कॉलबैक भेजें" | "কলব্যাক পাঠান" |
| modal.cta.cancel | "Cancel" | "रद्द करें" | "বাতিল" |
| modal.priority.urgent | "Urgent" | "तुरंत" | "জরুরি" |
| modal.error.reason | "Add a quick note so we know how to help." | "थोड़ा बताएं ताकि हम मदद कर सकें।" | "একটু লিখুন যাতে আমরা সাহায্য করতে পারি।" |
| modal.toast.success | "Request sent — we'll call you back" | "अनुरोध भेज दिया — हम कॉल करेंगे" | "অনুরোধ পাঠানো হয়েছে — আমরা কল করব" |

Containers built to accommodate ±40% width variance. Bengali strings occasionally run longer than Hindi; test in a 360px viewport.

---

## 8. API contract

- `POST /callbacks` body:
  ```
  {
    category: "GST"|"ITR"|"DOC"|"LOAN"|"BILLING"|"OTHER",
    priority: "LOW"|"NORMAL"|"HIGH"|"URGENT",
    preferredWindow: { start: ISO8601, end: ISO8601 } | null,  // null means ASAP
    reasonText: string,
    linkedEntity: { type, id } | null,
    language: "en"|"hi"|"bn" | null
  }
  ```
- Response 201: `{ id, status: "PENDING", slaDeadline, ... }`.
- Error 409 (conflict): `{ existingCallbackId }`.
- Error 429 (rate limit): `{ retryAfterSeconds }`.

---

## 9. Tokens / components summary

- No new tokens.
- Reuses: `Modal`, `TextInput`, `Textarea`, `Radio`, `Select`, `DatePicker`, `PrimaryButton`, `SecondaryButton`, `AlertBanner`, `Toast`, `Badge`, `Card`.
- No new components required.

---

## 10. Status

| Item | Status |
|---|---|
| Core form with validation | **Good to implement** |
| Single-active-callback conflict handling | **Good to implement** |
| Priority = URGENT confirm sheet | **Good to implement** |
| Offline queuing of submissions | **Needs design review** — scope says online-only for 6E; flag for later phase. |
| Business-hours window constraint 09:00–20:00 IST | **Needs design review** — confirm business hours with team lead; may vary by CA availability. |

*End of RequestCallbackModalScreen spec.*
