# Mobile — RegimeComparisonScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Side-by-side visual comparison of OLD vs NEW tax regime for the user's current AY filing. Highlights the recommended option, shows savings amount, and captures the user's regime choice (which is then locked to the filing).

## User Goal

"Show me the cheaper option clearly. I don't want to do math."

---

## Layout

```
┌─ Header  [back]  "Choose your tax regime" ────────┐
│  Eyebrow  "AY 2026-27 · Final review"             │
│  HeroSavings card                                  │
│   "You save ₹42,300 with the New regime"           │
│   small badge: "Recommended"                       │
│  ─────────────────────────────────────────────── │
│  ChartArea  (~280pt height)                        │
│   Bar chart, 2 grouped bars: OLD / NEW             │
│   y-axis: tax payable (₹)                          │
│   Recommended bar: filled brand.500 + crown icon   │
│   Other bar: filled neutral.400                    │
│   Value labels above each bar (Indian fmt: ₹ L/Cr)│
│  ─────────────────────────────────────────────── │
│  Comparison Table                                  │
│   Row: Gross income           ₹ X         ₹ X     │
│   Row: Total deductions       ₹ Y         ₹ 0*    │
│   Row: Taxable income         ₹           ₹       │
│   Row: Tax before cess        ₹           ₹       │
│   Row: Cess (4%)              ₹           ₹       │
│   Row: Net tax payable        ₹           ₹       │
│   *New regime allows std deduction only (₹75,000) │
│  ─────────────────────────────────────────────── │
│  RegimeChoice — radio cards, 2 options             │
│   ○ OLD regime  — best if you have many deductions │
│   ● NEW regime  — recommended for you (saves ₹42,300)│
│  ─────────────────────────────────────────────── │
│  StickyFooter                                     │
│   [Back]                          [Choose Regime] │
└───────────────────────────────────────────────────┘
```

---

## Bar Chart Spec

Consistent with admin DashboardPage chart conventions (recharts on web; `react-native-svg` based custom on mobile).

- Container width = screen width − 32pt padding. Height = 280pt.
- 2 vertical bars, width 80pt each, gap 48pt center-aligned.
- Recommended bar:
  - Fill: `color.brand.500` (Indigo).
  - Top decoration: small crown icon 20pt above bar in `color.brand.700`.
- Other bar:
  - Fill: `color.neutral.400`.
- Y-axis ticks at 0, 25%, 50%, 75%, 100% of max value, labels in `color.neutral.600`, `text.sm`.
- Bar labels (above): "₹ X" rendered in Indian format ("₹1.2 L", "₹2.4 Cr") with 13pt font weight 600.
- Bar bottom labels: "OLD" / "NEW" in `color.neutral.700`.
- Animate-in: bars rise from baseline over 600ms, ease-out.

Accessibility: chart wrapped with `accessibilityLabel="Bar chart. Old regime tax payable {x}. New regime tax payable {y}. New is recommended."`.

---

## HeroSavings Card

- Variant: gradient card, `bg-gradient-to-br from-success-50 to-success-100`.
- Icon top-right: trending-down 24pt success.700.
- Headline: `text-2xl font-bold` "You save ₹42,300 with the New regime."
- Sub: `text-sm` "Switching is simple — you can update later before filing."
- If both regimes equal → variant info, copy "Both regimes give the same outcome — pick whichever you prefer."

---

## RegimeChoice Cards

- Two stacked `RadioCard`s (existing pattern).
- Each card:
  - Title row (label + small "Recommended" pill if applicable, color.brand.500 background).
  - Body: 1-line tax payable summary.
  - Selected state: 2pt brand.500 ring + check icon.
- Default-selected = recommended option.

---

## CTA Logic

- "Choose Regime" → `POST /itr/filings/{id}/regime { chosen: 'OLD'|'NEW' }`.
- On success → navigate to `FilingSummaryScreen`.
- Cannot go forward without explicit selection (defaults present, but tap required to confirm).

---

## States

- **Loading** — Skeleton chart bars + skeleton table rows (5 rows).
- **Compute Error** — Inline error card "We couldn't compute your comparison. Try again." with `Retry` button.
- **Stale data warning** — If profile changed since last computation, show banner "Your profile was updated. Refresh comparison?" with Refresh button.
- **Edge: New regime mathematically can't apply** (e.g., loss carry-forward in business) — Show banner "Only OLD regime applies in your case." Hide chart, show single-column table + auto-select OLD.

---

## Edge cases (per QA scope)

- **Very low income** (< ₹3L taxable): Both regimes = ₹0 tax. HeroSavings switches to info variant: "No tax payable in either regime."
- **Very high income** (> ₹50L): Surcharge tier displayed below cess row. Footnote "Includes surcharge of X%."

---

## i18n keys

```
itr.regime.title / .eyebrow
itr.regime.hero.savings ("You save {amount} with the {regime} regime")
itr.regime.hero.equal
itr.regime.chart.aria
itr.regime.table.row.{grossIncome|deductions|taxableIncome|taxBeforeCess|cess|netTax}
itr.regime.table.footnote.newStdDeduction
itr.regime.choice.old.label / .old.subtitle
itr.regime.choice.new.label / .new.subtitle
itr.regime.choice.recommendedPill
itr.regime.cta.choose / .back
itr.regime.error.compute / .stale
itr.regime.banner.onlyOldApplies / .noTax
```

---

## Accessibility

- `Recommended` is communicated by both crown icon AND "Recommended" pill text (not color-only).
- Touch targets: RadioCard ≥ 64pt height.
- Chart values announced via screen reader.
- Currency uses INR with Indian digit grouping (12,34,567).
