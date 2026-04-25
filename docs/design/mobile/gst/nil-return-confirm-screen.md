# GstNilReturnScreen — Mobile Spec

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Code target:** `mobile/src/screens/gst/GstNilReturnScreen.tsx`
> **Design system:** extends `docs/design/component-library.md`. No new tokens.
> **Tech:** React Native (Expo SDK 52+) + NativeWind. Touch targets ≥ 44 × 44 pt.

---

## 1. Purpose

For zero-transaction periods, GST law requires a **NIL return** to still be filed. This screen lets a small-business owner confirm "no transactions" and file the NIL return for a specific GSTIN + return period in a single confirmed action — no spreadsheets, no invoice review.

## 2. User goal

> "We did no business this month. I want to file the NIL return in two taps and get a confirmation I can show my CA."

## 3. Single-action pattern (anti-pattern guards)

This screen follows a deliberate **single-action confirm** pattern:

- One primary action: **Confirm & file NIL return**.
- The screen is read-mostly. There are **no editable inputs** for transactions, invoices, or amounts — because by definition there are none.
- The user must explicitly tick a single mandatory checkbox affirming "I confirm there were no taxable transactions in this period." This is the fraud guard.
- A 2-step confirm dialog gates the actual mutation to prevent accidental filing for the wrong period.

## 4. Entry points

- `GstDashboardScreen` → period card → "File NIL return" CTA appears when:
  - Return is `not_filed`,
  - Return period is `current` or `previous`,
  - Auto-computed transaction count for the period is `0`,
  - Today is on or before the due date.
- Push notification deep-link `snapaccount://gst/nil/:returnId` → opens directly here.

## 5. Layout

```
┌ Status bar ─────────────────────────────────────────┐
├ Header ─────────────────────────────────────────────┤
│ ‹  File NIL Return                                  │
├─ Hero ──────────────────────────────────────────────┤
│                                                      │
│         ⊘  (icon: zero transactions, 56pt)           │
│                                                      │
│   Nothing to report this month                       │
│   File a NIL return for                              │
│                                                      │
│   ┌──────────────────────────────────────────────┐  │
│   │ Period      March 2026 (GSTR-3B)             │  │
│   │ GSTIN       27ABCDE1234F1Z5                  │  │
│   │ Org         Acme Traders Pvt Ltd             │  │
│   │ Due date    20 Apr 2026  [DueDateChip D-2]   │  │
│   └──────────────────────────────────────────────┘  │
│                                                      │
│   Why am I seeing this?                              │
│   We didn't find any sales, purchases, or tax        │
│   activity for this period in your books.            │
│   [View 0 transactions ›]                            │
│                                                      │
│   ☐  I confirm there were no taxable transactions   │
│      for this period.                                │
│                                                      │
│   By filing, you submit GSTR-3B as NIL on the       │
│   GST portal. You'll receive an ARN once accepted.   │
│                                                      │
├ Sticky footer (safe-area aware) ────────────────────┤
│ [ Confirm & file NIL return ]   (full-width primary) │
│ [ Cancel ]                       (text button)        │
└──────────────────────────────────────────────────────┘
```

- Screen scrolls if content exceeds viewport (rare on small phones with large fonts).
- Sticky footer: 80pt total (CTA 52pt + padding); respects bottom safe area inset.

## 6. Components used

| Region | Component | Source |
|---|---|---|
| Header | `MobileHeader` | existing |
| Hero icon | `Icon` (slash-circle) | existing |
| Detail card | `Card` + `DefinitionList` | existing |
| Due chip | `DueDateChip` | from notice-tracker-list-page §6.1 |
| Confirm checkbox | `Checkbox` | existing |
| Helper link | `Link` | existing |
| Primary CTA | `Button variant=primary size=lg fullWidth` | existing |
| Cancel | `Button variant=text` | existing |
| Confirm dialog | `ConfirmDialog` (full-screen modal on mobile) | existing |
| Success screen | `ResultScreen` (NEW — see §8) | new primitive (small) |
| Loading | `Spinner` (overlay on CTA) | existing |
| Toast | `Toast` | existing |

## 7. Interaction flow

```
GstNilReturnScreen
  ├─ User ticks affirmation checkbox
  ├─ Primary CTA enabled
  ├─ Tap CTA → ConfirmDialog
  │   "File NIL return for GSTR-3B March 2026?
  │    GSTIN 27ABCDE1234F1Z5
  │    This action cannot be undone."
  │    [Cancel]   [Yes, file NIL return]
  ├─ Confirm → mutation in progress
  │   • CTA shows spinner + label "Filing…"
  │   • Cancel button hidden, hardware back ignored
  │   • Network failure → Toast error + dialog dismiss
  ├─ Success → navigate to NilReturnSuccessScreen (ResultScreen variant)
  │   • Big check, "NIL return filed"
  │   • ARN shown if returned, else "ARN will appear shortly"
  │   • [Done] returns to GstDashboardScreen
```

### 7.1 Hardware back handling
- During mutation: `useFocusEffect` blocks Android back button; iOS swipe-back disabled.
- On success screen: hardware back goes to `GstDashboardScreen` (replaces stack).

## 8. ResultScreen (NEW small primitive)

**Purpose:** generic post-action confirmation screen used by NIL return success and reusable elsewhere (callback request success, etc.).

**Props:**
| Prop | Type | Description |
|---|---|---|
| `variant` | `success \| info` | drives icon + accent |
| `title` | string | hero text |
| `body` | ReactNode | supporting copy / details |
| `primaryAction` | `{ label, onPress }` | full-width button |
| `secondaryAction` | `{ label, onPress }` | text button |

Layout: hero icon (72pt), title (24pt bold), body (16pt slate.700), spacer, sticky footer with primary + secondary actions.

## 9. States

- **Loading the period detail:** skeleton hero + skeleton card + disabled CTA.
- **Period invalid (already filed / has transactions):** redirect away with toast "This period has activity — review and file from the dashboard." Do not render the screen.
- **Confirm checkbox unticked:** primary CTA disabled with opacity 50 % and `accessibilityState={{ disabled: true }}`. No tooltip on mobile — instead, helper text below CTA: "Tick the confirmation above to enable filing."
- **Mutation in progress:** see §7.
- **Mutation failed:** stay on screen; surface `AlertBanner type=error` above CTA: "Couldn't file NIL return — {{reason}} [Retry]". Keep checkbox state intact.
- **Offline:** banner top of screen: "You're offline — connect to file." CTA disabled.

## 10. Accessibility

- `accessibilityRole="header"` on screen title.
- Detail card uses `<DefinitionList>` with `accessibilityRole="list"` and each row labelled.
- Affirmation checkbox: `accessibilityLabel` includes the full statement; `accessibilityHint`: "Required to enable filing".
- CTA enabled state announced when checkbox toggled.
- During mutation, screen reader announces "Filing NIL return, please wait" via `AccessibilityInfo.announceForAccessibility`.
- All hit targets ≥ 44 × 44 pt.
- Color contrast verified: `slate.700 on white = 9.59 :1`; affirmation checkbox state distinguishable by both color and check icon.

## 11. Indian-market specifics

- Dates render `DD MMM YYYY` and `DD/MM/YYYY` consistently.
- GSTIN displayed unmasked (this is the user's own GSTIN).
- Period label localized: "March 2026" → Hindi "मार्च 2026" → Bengali "মার্চ ২০২৬".
- ARN, when returned, shown in mono font; copy button on success screen.
- Helpful link text matches CBIC vocabulary: "GSTR-3B NIL".

## 12. i18n keys

```
mobile.gst.nil.title
mobile.gst.nil.hero.title
mobile.gst.nil.hero.subtitle
mobile.gst.nil.detail.period
mobile.gst.nil.detail.gstin
mobile.gst.nil.detail.org
mobile.gst.nil.detail.dueDate
mobile.gst.nil.helper.heading
mobile.gst.nil.helper.body
mobile.gst.nil.helper.viewTransactions
mobile.gst.nil.affirm.label
mobile.gst.nil.disclaimer.body
mobile.gst.nil.cta.primary
mobile.gst.nil.cta.cancel
mobile.gst.nil.cta.disabled.helper
mobile.gst.nil.confirm.title
mobile.gst.nil.confirm.body
mobile.gst.nil.confirm.confirm
mobile.gst.nil.confirm.cancel
mobile.gst.nil.success.title
mobile.gst.nil.success.body.withArn       // "Filed. ARN: {{arn}}"
mobile.gst.nil.success.body.pendingArn    // "Filed. ARN will appear shortly."
mobile.gst.nil.success.cta
mobile.gst.nil.error.fail
mobile.gst.nil.error.offline
mobile.gst.nil.error.invalidPeriod
```

`en`, `hi`, `bn` shipped together. Hindi/Bengali button labels typically run 30 % longer; primary CTA uses `numberOfLines={1}` with auto font scaling capped at 0.85 to avoid wrap on small phones; if still overflowing, designer-approved alternative key `cta.primaryShort` is used.

## 13. Telemetry

- `gst.nil.viewed` { returnId, period, daysUntilDue }
- `gst.nil.affirmed` { returnId }
- `gst.nil.unaffirmed` { returnId }
- `gst.nil.confirmDialog.opened` { returnId }
- `gst.nil.confirmDialog.cancelled` { returnId }
- `gst.nil.filed` { returnId, ms }
- `gst.nil.failed` { returnId, reason }

## 14. Handoff notes

- Backend endpoint: `POST /gst/returns/nil` per phase scope §backend-agent. Expected response: `{ returnId, arn?, filedAt }`. If ARN async, poll once on success screen mount, then stop.
- ResultScreen is small enough to inline initially; if reused for ≥ 3 surfaces, promote to shared `mobile/src/components/`.
- Block re-entry to this screen for the same return after success — `GstDashboardScreen` should re-render the period card as `Filed`.
