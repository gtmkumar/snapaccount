# RequestCallbackCTA — Mobile Reusable Component

> **Component:** `RequestCallbackCTA` (reusable)
> **Consumers:** `GstDashboardScreen`, `ItrDashboardScreen`, `LoanStatusScreen`, `ChatListScreen`.
> **Phase:** 6E
> **Design system:** tokens in `docs/design/tokens.json`; extends `component-library.md`.

---

## 1. Purpose

A single, consistent entry point for users to request a human callback from anywhere in the mobile app. The CTA auto-captures the context (which screen, linked entity) so the subsequent modal can pre-fill category and reason hints.

## 2. Variants

Two placement-appropriate variants, one component, shared props.

### 2.1 Inline card variant (`variant="card"`)

Use when there's vertical space in a screen (dashboards, status screens).

```
┌─ Need help with this? ──────────────────────────┐
│  [icon]  Talk to a SnapAccount expert            │
│          Avg response: ~12 min today             │
│                                       [ Request ]│
└──────────────────────────────────────────────────┘
```

- Full width minus 16pt horizontal margin.
- Height ~96pt. Padding `spacing.4`. Radius `radius.xl` (16px).
- Background: `color.brand.50`; border: 1px `color.brand.200`.
- Icon: 40×40 tinted circle (`color.brand.100` bg, `color.brand.600` icon) — `headphones` glyph.
- Title: `fontSize.base`, `fontWeight.semibold`, `color.neutral.900`.
- Subtext: `fontSize.sm`, `color.neutral.600` — live "avg response" pulled from KPI feed; falls back to static "We'll call you back" when unknown.
- Primary button: `PrimaryButton` size=sm, brand variant, min 44×44pt.
- Shadow: `shadow.xs`.

**Auto-category inference by host screen:**
| Host screen | Inferred category |
|---|---|
| GstDashboardScreen | GST |
| ItrDashboardScreen | ITR |
| LoanStatusScreen | LOAN |
| ChatListScreen | OTHER (user picks) |
| DocumentVault | DOC |
| Subscription | BILLING |

### 2.2 Bottom-sheet variant (`variant="bottomSheet"`)

Use when the host screen has an active "Need help?" FAB or from a Help menu. Triggers open a bottom-sheet with:

```
 ── drag handle ──
 Need to talk to someone?
 We typically respond in under 30 minutes.

 [🎯 Request a callback]   ← primary
 [💬 Ask in chat]          ← secondary
 [Cancel]                  ← tertiary
```

- Bottom-sheet height: `min(60%, 420pt)`.
- Drag handle 4×36pt, `color.neutral.300`, centered top.
- Title `fontSize.lg semibold`; body `fontSize.sm neutral-600`.
- Primary button full-width `PrimaryButton` size=lg (48pt min).
- Secondary `SecondaryButton` full-width (only if chat is enabled for user).
- Safe-area bottom padding on iPhone.

---

## 3. Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'card' \| 'bottomSheet'` | `'card'` | card for inline; bottomSheet opens via `Modal` primitive |
| `category` | `'GST'\|'ITR'\|'LOAN'\|'DOC'\|'BILLING'\|'OTHER'` | inferred | forwarded to modal |
| `linkedEntity` | `{ type, id, label }?` | none | pre-fills "about this X" link in modal |
| `prefillReason` | `string?` | — | pre-populates reason when context gives a hint (e.g., "Help with GSTR-3B filing for Mar 2026") |
| `averageResponseMinutes` | `number?` | fetched from hook | drives subtext on card variant |
| `onRequested` | `(callbackId) => void` | — | callback fires after successful submit |
| `testID` | `string` | `"request-callback-cta"` | |

---

## 4. States

| State | Card variant | Bottom-sheet variant |
|---|---|---|
| Default | As drawn above | Opens on trigger |
| Loading avg-response | Subtext skeleton | n/a |
| Existing open callback for this user | **Replaces CTA** with `CallbackStatusChip` linking to `CallbackStatusScreen` (see that spec) | Bottom sheet first item becomes "View your pending callback" |
| User is offline | Button disabled, tooltip "Connect to request" + `color.neutral.400` CTA | Sheet shows offline banner |
| Submit in progress | Button spinner, disabled | Primary button spinner |
| Error | Inline `AlertBanner` type=error above CTA with retry | Inline banner inside sheet |
| Success | Dissolves, navigates to `CallbackStatusScreen` | Sheet closes, nav to status |

### 4.1 Single-active-callback rule
Per category, a user can have at most one open callback (status ∈ PENDING/SCHEDULED/IN_PROGRESS/FOLLOW_UP_NEEDED/ESCALATED_TO_CA). If one exists for the inferred category, the CTA transforms into a `CallbackStatusChip`:

```
┌──────────────────────────────────────────────────┐
│ 🟡 Scheduled · 3:30pm today            [ View ]  │
└──────────────────────────────────────────────────┘
```
- Height ~56pt, `color.warning.50` background, `color.warning.300` border.
- Status dot colored per status (reuses list-page badge map).
- Tap anywhere navigates to `CallbackStatusScreen`.

---

## 5. Interactions

1. User taps "Request" on card variant → navigates to `RequestCallbackModalScreen` (modal presentation) carrying `{ category, linkedEntity, prefillReason }` as nav params.
2. Bottom-sheet variant: trigger opens sheet; primary button same nav as above.
3. On successful submission (modal closes with `{ callbackId }`): CTA transforms to `CallbackStatusChip`, `onRequested` invoked, optional `Toast` success at top "Request sent — we'll call you back".
4. Pull-to-refresh on host screen invalidates the user's open-callback query so chip state refreshes.

---

## 6. Accessibility

- Card: entire card is `accessibilityRole="button"` (the whole surface is tappable, not just the Request button) with label "Request a callback from SnapAccount expert, average response <n> minutes".
- Bottom sheet: `accessibilityViewIsModal=true`; focus moves to title on open; dismiss by swiping down OR tapping backdrop.
- Minimum touch target 44×44pt — verified on button, status chip, and backdrop dismiss.
- Status chip's dot has `accessibilityLabel="Status: Scheduled, 3:30 PM today"`.
- Color is never the only indicator — every state pairs color with icon/text.

---

## 7. Motion

- Bottom sheet: spring-in from bottom, 250ms, standard ease-out.
- Card → chip transition: 200ms cross-fade; content shift respects reduced-motion.
- Subtext (avg response) polls every 5 min silently; no visible flicker (TanStack Query stale-time 5min).

---

## 8. i18n keys (en, hi, bn)

```
mobile.callback.cta.card.title                # "Talk to a SnapAccount expert"
mobile.callback.cta.card.avgResponse          # "Avg response: {minutes} min today"
mobile.callback.cta.card.avgResponseUnknown   # "We'll call you back"
mobile.callback.cta.card.requestButton        # "Request"
mobile.callback.cta.sheet.title               # "Need to talk to someone?"
mobile.callback.cta.sheet.body                # "We typically respond in under 30 minutes."
mobile.callback.cta.sheet.requestPrimary      # "Request a callback"
mobile.callback.cta.sheet.chatSecondary       # "Ask in chat"
mobile.callback.cta.sheet.cancel              # "Cancel"
mobile.callback.cta.offlineTooltip            # "Connect to request a callback"
mobile.callback.cta.pending.title             # "Scheduled · {time}"
mobile.callback.cta.pending.viewButton        # "View"
mobile.callback.toast.submitted               # "Request sent — we'll call you back"
```

Required locales: en, hi, bn. Test strings must fit within the 16px-padded card at +40% length (memory rule).

---

## 9. Tokens / components summary

- **No new tokens.** All colors, radii, shadows from existing system.
- **Reuses:** `PrimaryButton`, `SecondaryButton`, `Card`, `Modal` (bottom-sheet variant), `AlertBanner`, `Toast`, `StatusBadge` dot.
- **New composite component:** `RequestCallbackCTA` documented here; append summary row to `component-library.md` under "Phase 6E" with pointer to this file.
- **New composite component:** `CallbackStatusChip` — small variant used in pending state; append under "Phase 6E" in component library.

*End of RequestCallbackCTA spec.*
