# Admin — CA Tax Computation Panel

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> The single most-important admin surface for ITR. Uses a new dual-pane editor primitive.

---

## Purpose

CA's interactive tool to review, edit, and finalize a user's ITR computation. The screen has two synchronized panels:
- **Left:** editable income heads, deductions, regime-specific inputs.
- **Right:** live tax computation output (slab-wise table + final tax/refund).

When the CA edits any value on the left, the right panel debounces 300ms then re-runs the tax engine and re-renders. Before/after deltas are surfaced for transparency.

## CA Goal

"Let me tweak deductions and immediately see how the tax changes — without losing my place."

---

## Layout

```
┌─ AdminLayout ─────────────────────────────────────────────────────────┐
│  Sub-header (above the panel — sticky)                                 │
│   Breadcrumb  Verification queue / Pradeep K. (PAN ABCDE…)             │
│   Right side: [Save draft] [Reject & message user] [Approve & forward] │
│  ─────────────────────────────────────────────────────────────────── │
│  DualPane (resizable splitter, default 55/45)                          │
│  ┌─ Left: Editable inputs ──────┐  ┌─ Right: Live computation ──────┐ │
│  │ TabsetSecondary              │  │ HeaderRow                      │ │
│  │ [Income] [Deductions] [Tax]  │  │  Regime: [OLD ↔ NEW] toggle    │ │
│  │ [Schedules] [Notes]          │  │  AY: 2026-27                    │ │
│  │ ─────────────                │  │ ─────────────────────────────  │ │
│  │ ScrollArea (form content)    │  │ ComputationCard                 │ │
│  │   form sections w/ edits     │  │  Gross income      ₹X (Δ +Y)   │ │
│  │   each input has small       │  │  Deductions         ₹X (Δ -Y)   │ │
│  │    "before → after" delta    │  │  Taxable income     ₹X         │ │
│  │    pill when changed         │  │  Tax (slab-wise)    ₹X         │ │
│  │                              │  │   slab table breakdown          │ │
│  │                              │  │  Cess 4%            ₹X          │ │
│  │                              │  │  Surcharge          ₹X          │ │
│  │                              │  │  Rebate u/s 87A     ₹X          │ │
│  │                              │  │  Net tax            ₹X         │ │
│  │                              │  │  Credits (TDS+Adv)  ₹X         │ │
│  │                              │  │  Refund/Payable    ₹X (color)  │ │
│  │                              │  │ ─────────────────────────────  │ │
│  │                              │  │ RegimeMiniBar                   │ │
│  │                              │  │  small bar chart Old vs New     │ │
│  └──────────────────────────────┘  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Left panel — tabsets

### Income tab
- Salary card (auto-populated from Form 16 extraction; editable).
- House property cards (multiple).
- Capital gains card.
- Business / professional income card.
- Other sources card.
- Each card uses inline-edit fields; pencil icon reveals edit mode.

### Deductions tab
- All deduction sections grouped by chapter VI-A.
- Each row: Section label · max-limit hint · current claim · CA-edit field.
- Hint chip: "User claimed ₹X · Max ₹Y under {section}".
- If CA changes value, "before → after" pill appears next to input (dismiss with ✕ or auto-clears on Save).

### Tax tab (read-only with one editable field)
- Mostly reflects right panel; offers single override: "Manual tax adjustment ₹___" with rationale text input. Used rarely (e.g., interest u/s 234A).

### Schedules tab
- Forms used by the engine: Schedule HP, CG, OS, etc. Used for ITR-2/3.
- Each schedule a collapsible card.

### Notes tab
- CA's free-text notes (markdown). Saved to `itr.filings.ca_notes`.
- Visible to admin role only.

---

## Right panel — live computation

### Regime toggle
- Toggle switch at top: OLD / NEW. Switching re-runs the engine with the alternate regime.
- Shows tag "Recommended: NEW (saves ₹X)" once both regimes computed.

### ComputationCard
- Each row is a label + value + optional delta.
- **Delta surface rule:** when CA edits a left-pane field, the right panel computes the resulting delta vs. the value at the moment the screen loaded. Delta shown as `(Δ +₹Y)` in `color.success.700` for reductions in tax / increases in refund, `(Δ -₹Y)` in `color.error.700` for opposite.
- Delta resets to zero on Save.

### Slab table
- Visible only under OLD regime detail expansion.
- Columns: From | To | Rate | Tax on this slab.
- Sourced from `itr.tax_slab_versions` for the AY.

### RegimeMiniBar
- 200×120pt bar chart. Same visual language as mobile RegimeComparisonScreen.
- Labels above each bar (Indian-format ₹).

---

## Live recompute mechanics

- **Trigger:** any change to an editable input on the left.
- **Debounce:** 300ms after last keystroke.
- **Endpoint:** `POST /itr/filings/{id}/recompute` (idempotent; engine doesn't persist).
- **Skeleton on chart while recomputing:** RegimeMiniBar bars fade to 40% opacity + a thin progress bar overlay; ComputationCard rows show shimmer for ~120–400ms typically.
- **Failure:** if the recompute API fails, show a non-blocking toast "Couldn't recompute. Showing previous numbers." Right panel keeps prior values; no half-state.
- **Race-protection:** each recompute carries a sequence number; only the latest reply renders.

---

## Header actions

| Action | Behavior |
|--------|----------|
| **Save draft** | `PATCH /itr/filings/{id}` — persists left-pane edits without changing status. |
| **Reject & message user** | Opens modal: free-text reason → posts message into user's chat thread + filing returns to user with `status=DRAFT`. |
| **Approve & forward** | Confirmation modal. On confirm: status → `USER_APPROVAL_PENDING`, push notification to mobile. |

Save draft is auto-triggered every 30 s if unsaved edits exist (autosave). Indicator pill: "Saved 2s ago" / "Saving…" / "Unsaved changes".

---

## Empty / Loading / Error

- **Loading initial** — Skeleton tabs + skeleton ComputationCard.
- **Recomputing** — As above (overlay).
- **Save error** — Banner top of left panel "Couldn't save. Retry." with Retry button.
- **No filing selected** (when reached from Tab 2 standalone) — Empty state "Pick a filing from the verification queue."

---

## i18n keys

```
itr.computationPanel.subheader.breadcrumb
itr.computationPanel.action.saveDraft / .reject / .approve
itr.computationPanel.autosave.saved / .saving / .unsaved
itr.computationPanel.left.tab.{income|deductions|tax|schedules|notes}
itr.computationPanel.left.section.{salary|houseProperty|capitalGains|business|otherSources}
itr.computationPanel.left.delta.beforeAfter
itr.computationPanel.right.regimeToggle / .recommendation
itr.computationPanel.right.row.{grossIncome|deductions|taxable|tax|cess|surcharge|rebate|netTax|credits|outcomeRefund|outcomePayable}
itr.computationPanel.right.slabTable.{from|to|rate|tax}
itr.computationPanel.recompute.toastFailed
itr.computationPanel.rejectModal.heading / .reasonPlaceholder / .submit
itr.computationPanel.approveModal.heading / .body / .confirm
```

---

## Accessibility

- DualPane splitter resizable via mouse drag AND keyboard arrow-keys when focused.
- Live recompute updates announced via `aria-live="polite"` region attached to ComputationCard.
- Delta values include text indicator ("increased", "decreased") in screen-reader-only span.
- All form fields keyboard-traversable; Tab order: left panel top→bottom, then right panel.
- Color cues for delta paired with arrow icon.

---

## New Component Primitive Required

**DualPaneEditor** — resizable left/right split with a draggable vertical splitter, persistable column ratio per user. Listed in `component-library.md` Phase 6D additions.

---

## Responsive

- Desktop ≥ 1280px: full dual-pane.
- 1024–1280px: panes stack vertically; left first, right sticky at top.
- < 1024px: redirect to a "Open on desktop for best experience" message; CA flows are desktop-only.
