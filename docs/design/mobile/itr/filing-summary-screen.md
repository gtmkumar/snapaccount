# Mobile — FilingSummaryScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

A complete, scrollable, pre-approval summary of the user's ITR filing. Users review every income head, deduction, and tax line before granting approval. Print/share affordance lets them save a PDF for their records.

## User Goal

"Let me see everything that will be filed in my name. I want to scrutinize before I approve."

---

## Layout

```
┌─ Header  [back]  "Filing summary"  [share icon] ──┐
│  HeaderCard                                        │
│   "ITR-2 · AY 2026-27 · NEW regime"                │
│   StatusPill  "Ready for your approval"           │
│  ─────────────────────────────────────────────── │
│  KeyMetrics row (3 cards horizontally scroll)     │
│   [Total income ₹12.4L] [Tax payable ₹84,500]     │
│   [Refund due ₹6,200]                             │
│  ─────────────────────────────────────────────── │
│  AccordionSection "Personal details"          [v] │
│   PAN, DOB, Address, Bank account for refund      │
│  AccordionSection "Income heads"              [v] │
│   Salary  ₹X         (linked from Form 16)        │
│   House property  ₹Y                              │
│   Other sources  ₹Z                               │
│   Subtotal  ₹...                                  │
│  AccordionSection "Deductions"                [v] │
│   80C, 80D, 80CCD(1B), HRA, 24b, ...              │
│   Subtotal  ₹...                                  │
│  AccordionSection "Tax computation"           [v] │
│   Slab-wise breakdown (if OLD) or flat (if NEW)   │
│   Cess, Surcharge, Rebate u/s 87A                 │
│   Net tax payable                                  │
│  AccordionSection "TDS / Advance tax credit"  [v] │
│   Form 16 TDS  ₹X                                  │
│   Advance tax  ₹Y                                  │
│   Self-assessment tax  ₹Z                          │
│   Total credit  ₹...                               │
│  AccordionSection "Final outcome"             [v] │
│   Net tax payable  ₹X                              │
│   Total credits   ₹Y                              │
│   ──────                                           │
│   Refund due / Tax payable  ₹...  (color cue)      │
│  ─────────────────────────────────────────────── │
│  CADisclaimer card (info variant)                  │
│   "This computation was reviewed by your CA on     │
│    25 Apr 2026. SnapAccount and your CA assist;    │
│    final responsibility rests with you."           │
│  ─────────────────────────────────────────────── │
│  StickyFooter                                     │
│   [Need changes?]                  [Approve & file →]│
└───────────────────────────────────────────────────┘
```

---

## AccordionSection behavior

- Default: all sections collapsed (per Apple HIG long-form pattern — reduces cognitive load).
- One-tap expand reveals labeled rows.
- Each row: left label `text-sm` + right value `text-base font-medium tabular-nums`.
- Subtotal rows: top border + bold value.
- Long subsection (e.g., 80C details) supports nested rows with secondary indentation.

---

## KeyMetrics horizontal scroll

- 3 cards, width 200pt each, gap 12pt.
- Each card: small icon top-left, label, value `text-2xl font-bold tabular-nums`.
- Refund due card uses `color.success.500` value; Tax payable uses `color.warning.700`.

---

## Print / Share

Top-right share icon → opens native share sheet:
- "Save as PDF" — calls `GET /itr/filings/{id}/summary.pdf` and routes through `expo-sharing`.
- "Send to email" — pre-fills email composer with PDF attached.
- "Print" — iOS uses AirPrint; Android uses default print service.

PDF format mirrors the on-screen summary with SnapAccount letterhead and "Draft — pending user approval" watermark.

---

## States

- **Loading** — All sections show skeleton rows (3 each).
- **Computing** — Banner "Recomputing… your CA just edited a deduction." Auto-refresh on backend push.
- **Stale (CA edited but not yet refreshed)** — Banner with `Refresh` button.
- **Error** — Replace whole screen body with error state + Retry.
- **No CA review yet** — Disable Approve button; show banner "Waiting for your CA to complete review." Replace footer with text "Your CA will notify you when ready."

---

## Indian-format details

- Currency rendering: `₹` + Indian digit grouping (e.g., `12,34,567`); show in lakhs/crores in the KeyMetrics cards (`₹12.34 L`).
- Dates: DD MMM YYYY (e.g., `25 Apr 2026`).

---

## i18n keys

```
itr.summary.title
itr.summary.header.formInfo  ("{form} · AY {ay} · {regime} regime")
itr.summary.header.statusPill.{readyForApproval|awaitingCa|filed}
itr.summary.metrics.totalIncome / .taxPayable / .refundDue
itr.summary.section.{personal|income|deductions|taxComputation|credits|outcome}
itr.summary.outcome.refund ("Refund due {amount}")
itr.summary.outcome.payable ("Tax payable {amount}")
itr.summary.disclaimer.caReviewed
itr.summary.cta.needChanges / .approveAndFile
itr.summary.share.pdf / .email / .print
```

---

## Accessibility

- AccordionSection headers `accessibilityRole="button"` with state expanded/collapsed.
- All numeric values announced with currency unit.
- Refund/payable color cue paired with explicit text label.
