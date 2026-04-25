# Mobile — LoanHubScreen

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Catalog of partner-bank loan products. The user browses, filters, and taps a card to launch eligibility check + application. This is the entry point for the entire Loan Hub flow.

## User Goal

"Show me the loans I might qualify for. Let me compare amounts, tenure, and rates before I commit."

---

## Layout

```
┌─ Header  [back]  "Business loans"            [help icon] ─┐
│  HeaderHero                                                │
│   "Apply for a business loan in minutes"                  │
│   "We package 12 months of GSTR-3B + P&L + BS + bank     │
│    summary into one PDF for partner banks."               │
│  ─────────────────────────────────────────────────────── │
│  EligibilityTeaserCard  (only if user not yet checked)    │
│   "Check your eligibility first" [Check now →]            │
│  ─────────────────────────────────────────────────────── │
│  FilterBar (sticky)                                        │
│   [Amount range ▾] [Tenure ▾] [Purpose ▾] [Sort ▾]       │
│  ─────────────────────────────────────────────────────── │
│  LoanProductCard list (vertical)                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │ [bankLogo 40pt] Bank name           [BadgeQual] │   │
│   │ Product: "Business Boost - Working Capital"      │   │
│   │ Amount  ₹1L – ₹50L     Tenure  12-60 mo         │   │
│   │ Interest 11.5% – 16.5% p.a. (indicative)        │   │
│   │ EligibilityHintRow                               │   │
│   │  "You likely qualify"  OR  "Improve GST score"  │   │
│   │ [View details] [Apply →]                         │   │
│   └──────────────────────────────────────────────────┘   │
│   ... (repeats)                                           │
│  ─────────────────────────────────────────────────────── │
│  Footer disclaimer                                         │
│   "Interest rates are indicative. Final rate set by       │
│    the bank after their review."                          │
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `HeaderHero` (existing variant) with module color `loan` accent.
- `EligibilityTeaserCard` — uses Phase 6E `CalloutCard` with brand accent + arrow CTA.
- `FilterBar` — reuses Phase 6B sticky filter chips. Each chip opens a bottom-sheet picker.
- `LoanProductCard` — new composite primitive; see component-library addendum.
- `BadgeQual` — Badge variants: `qualified` (success), `nearMatch` (warning), `notQualified` (neutral).
- `EligibilityHintRow` — small row showing reason text + icon (success-check, warning-triangle, info-circle).

## States

- **Loading** — 4 skeleton cards (logo, 3 lines).
- **No products** — Empty state with illustration + copy "No partner banks active yet. Check back soon." (post-MVP only; MVP always shows ≥3 banks).
- **Error** — full-screen error w/ Retry.
- **Eligibility unchecked** — show EligibilityTeaserCard at top, all cards show neutral `BadgeQual` and EligibilityHintRow text "Check eligibility to see your match."
- **Eligibility checked** — Teaser card collapses; cards sorted by qualified-first; each shows individual badge + reason.

## Filter behavior

- Amount range: bottom sheet with two sliders (min, max). Default 1L–50L. Indian formatting (₹50,00,000).
- Tenure: chip group 12 / 24 / 36 / 48 / 60 months — multi-select.
- Purpose: single-select chips (Working capital / Equipment / Inventory / Expansion / Other).
- Sort: Lowest interest / Highest amount / Shortest tenure / Best match for me (only if eligibility checked).

## Indian-format details

- All amounts in Indian grouping (₹1,00,000 / ₹1L / ₹1Cr).
- Interest as `%` with one decimal, "p.a." suffix.

## i18n keys

```
loan.hub.title
loan.hub.hero.title / .body
loan.hub.eligibilityTeaser.title / .cta
loan.hub.filter.amount / .tenure / .purpose / .sort
loan.hub.card.amountRange / .tenureRange / .interestRange / .indicative
loan.hub.card.qualified / .nearMatch / .notQualified
loan.hub.card.cta.viewDetails / .apply
loan.hub.disclaimer.indicativeRates
```

Translations: en, hi, bn. Hindi/Bengali strings allow ±40% width.

## Accessibility

- All cards `accessibilityRole="button"`; full label = "Bank name. Product. Amount range. Tenure range. Interest range. Likely qualify."
- Bank logos `accessibilityLabel="{bankName} logo"`.
- Filter chips announce current value in `accessibilityValue`.
- Touch targets ≥ 44×44pt (cards 96pt+, chips 44pt height).
- Color cues paired with icon + text (no color-only).

## Responsive / orientation

- Portrait only (Phase 6C). Cards full-width minus 16pt gutter.
- Tablet/large screen: 2-column grid above 700pt width.

## Empty / error copy

- Network: "Could not load loan products. Tap to retry."
- Pull-to-refresh enabled on the list.

## Telemetry

- `loan.hub.viewed`, `loan.hub.product.tapped {productId}`, `loan.hub.filter.changed {field}`.
