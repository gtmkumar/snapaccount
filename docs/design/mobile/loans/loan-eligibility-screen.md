# Mobile — LoanEligibilityScreen

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Quick, low-commitment eligibility pre-check. The user inputs basic loan parameters; backend computes an eligibility score from AccountingService (P&L, turnover, BS) + GstService (last 12 GSTR-3B, filing regularity). Result lists qualifying products with reasons, plus reasons for non-qualification.

## User Goal

"Before I waste time on docs, tell me which banks I'm likely to qualify with — and what to fix if I don't."

---

## Layout — input step

```
┌─ Header  [back]  "Eligibility check" ────────────────────┐
│  StepHeader  "Step 1 of 2 · Tell us what you need"       │
│  ─────────────────────────────────────────────────────── │
│  Amount slider                                             │
│   "How much do you need?"                                 │
│   [─────────────●──] ₹15,00,000                          │
│   ₹1L                                ₹50L                 │
│  Tenure stepper                                            │
│   "Repay over"  [- 24 months +]                           │
│  Purpose select                                            │
│   [Working capital ▾]                                     │
│  ConsentCheckbox                                           │
│   ☐  I consent to a soft eligibility check (no credit     │
│      bureau pull). [What this means →]                    │
│  StickyFooter                                              │
│   [Check eligibility →]   (disabled until consent)        │
└────────────────────────────────────────────────────────── ┘
```

## Layout — result step

```
┌─ Header  [back]  "Your eligibility" ──────────────────────┐
│  ScoreCard                                                 │
│   ProgressRing 86 / 100                                   │
│   Headline "You're a strong match"                        │
│   Subline "8 of 10 partner banks may approve you"        │
│  ─────────────────────────────────────────────────────── │
│  Section "Why you qualify"                                 │
│   ReasonRow [check]  "12 months of GSTR-3B filed on time" │
│   ReasonRow [check]  "Avg monthly turnover ₹4.2L"         │
│   ReasonRow [check]  "Positive net profit FY 2024-25"     │
│  Section "What could improve"  (only if any)              │
│   ReasonRow [warn]   "Bank statement not yet uploaded"    │
│   ReasonRow [warn]   "PAN-Aadhaar link pending"           │
│  ─────────────────────────────────────────────────────── │
│  ProductMatchList                                          │
│   "Banks that may approve" (vertical list, sorted)        │
│   - LoanProductCard (qualified)   x N                     │
│   "Banks where you nearly qualify"                        │
│   - LoanProductCard (nearMatch)   x M                     │
│  ─────────────────────────────────────────────────────── │
│  StickyFooter                                              │
│   [Choose a bank →]                                        │
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `Slider` (existing).
- `Stepper-numeric` — minus/plus rectangle (44×44pt each).
- `ConsentCheckbox` with inline link → opens info bottom-sheet explaining "soft check".
- `ProgressRing` (Phase 6D) — colored band: ≥80 success, 60–79 brand, 40–59 warning, <40 error.
- `ReasonRow` — icon + single-line text; reuse the row primitive from FilingSummary.
- `LoanProductCard` (Phase 6C addition).

## States

- **Idle** — Inputs editable, CTA disabled until consent ticked.
- **Computing** — CTA shows spinner; backend may take up to 6s.
- **Result loaded** — Smooth transition; ProgressRing animates from 0 to N over 800ms.
- **No products qualify** — Empty list with copy "No banks match today. Improve the items above and re-check in 30 days."
- **Error** — Bottom-sheet error w/ Retry; retain inputs.

## Indian-format details

- Amounts in lakh (₹X L) on slider end labels; absolute (₹15,00,000) on selected value.
- Score is dimensionless 0–100.

## i18n keys

```
loan.eligibility.title
loan.eligibility.step1 / .step2
loan.eligibility.amount.label / .min / .max
loan.eligibility.tenure.label / .unit
loan.eligibility.purpose.label
loan.eligibility.consent.softCheck / .consent.linkWhat
loan.eligibility.cta.check / .chooseBank
loan.eligibility.result.headline.{strong|moderate|weak}
loan.eligibility.result.subline ("{N} of {M} partner banks may approve you")
loan.eligibility.reasons.qualify.title / .improve.title
loan.eligibility.products.qualified.title / .nearMatch.title
loan.eligibility.empty.headline / .body
```

## Accessibility

- ProgressRing `accessibilityValue={ now: score, max: 100 }` + `accessibilityLabel`.
- Result reasons announced sequentially with role="list".
- Reduced-motion: ProgressRing fills instantly.
- Touch targets 44×44pt (slider thumb 28pt visual but 44pt hit area).

## Privacy notice

- "Soft check" copy in info sheet: "We do not pull your CIBIL/credit-bureau report at this stage. Only your SnapAccount data (GST returns, P&L, bank summary) is analyzed. A bureau pull happens only when you submit a final application and consent on the next screen."

## Telemetry

- `loan.eligibility.started`, `loan.eligibility.computed {score, qualifiedCount}`, `loan.eligibility.bankSelected {productId}`.
