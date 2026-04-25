# Mobile — EmployeeProfileWizard

> Phase: 6D (ITR Engine)
> Owner: ui-ux-agent
> Status: APPROVED for implementation
> Date: 2026-04-25

---

## Purpose

Capture the assessee profile required for ITR computation through a guided 5-step wizard. Each step persists to the backend (`PATCH /itr/profiles/{userId}`) on `Next` so users can resume on any device. The data fuels the Tax Computation Engine and determines which ITR form (1–4 for MVP) is auto-recommended.

## User Goal

"Give me a step-by-step path to enter my filing details. I should never feel stuck on a long form, and I should be able to leave and come back without losing progress."

---

## Step Map

| # | Step | Required Inputs | ITR form impact |
|---|------|-----------------|-----------------|
| 1 | Personal | Full name (pre-filled from auth), DOB, PAN, Aadhaar last-4, residential status, gender | Determines senior/super-senior thresholds |
| 2 | Employment | Occupation type (Salaried / Business / Professional / Other), employer name, TAN, period of employment | Determines ITR-1 vs ITR-3/4 |
| 3 | Deductions | 80C, 80D, 80CCD(1B), HRA, home-loan interest (24b), 80E, 80G, 80TTA | Used by both regimes for computation |
| 4 | Investments | Capital gains (Y/N gate), house property (Self-occupied / Let-out / 2nd home), other sources (interest income) | Pulls in additional schedules |
| 5 | Review | Read-only summary of steps 1–4 + recommended ITR form badge | "Submit" returns user to filing dashboard |

---

## Layout (per step)

```
┌─ SafeAreaView ───────────────────────────────────┐
│  HeaderBar  [back]  "Profile Setup"  [Save & Exit]│
│  Stepper (horizontal, 5 nodes, current filled)    │
│  ─────────────────────────────────────────────── │
│  ScrollView (padding-x: spacing.4)                │
│   StepHeading  "Step 2 of 5: Employment"          │
│   StepSubtitle (one-line guidance)                │
│   <Form fields>                                   │
│  ─────────────────────────────────────────────── │
│  StickyFooter                                     │
│   [Back]                              [Next →]    │
└──────────────────────────────────────────────────┘
```

### Stepper Component (new primitive — see Components section)
- 5 dots connected by 1px lines, height 32pt total.
- Current = filled `color.brand.500`, completed = filled `color.success.500` with check, future = `color.neutral.300`.
- Tappable: tapping a completed step navigates back to it (preserves entered data).

---

## Step 1 — Personal

Fields use existing `TextInput`, `DateInput`, `PanInput` (new: see Components), `Dropdown`.

- **PAN** field — formatted `AAAAA9999A`, validates against regex on blur. Show inline error in `text-error-600`.
- **DOB** field — DD/MM/YYYY using native date picker; max date = today − 18 years.
- **Residential Status** — radio group (Resident / Non-Resident / Resident-but-not-ordinarily-resident).

**Validation gate to Next:** All required fields valid; PAN must pass checksum.

---

## Step 2 — Employment

- **Occupation Type** — segmented control (4 options).
- Conditional fields:
  - Salaried → Employer name, TAN, Date joined.
  - Business → Trade name, GSTIN (auto-pulled from existing accounting workspace if available — show "Linked from Accounting" chip).
  - Professional → Profession dropdown (Doctor, Lawyer, CA, Consultant, Other).
- Show ITR-form preview chip at bottom: "Looks like ITR-1 fits you" (updates live as user edits).

---

## Step 3 — Deductions

Long form — group into collapsible `AccordionSection`s (new pattern):
1. Section 80C investments (PPF, ELSS, LIC, etc.) — single ₹ input with hint "Max limit: ₹1,50,000".
2. Section 80D health insurance — Self/Family ₹ + Parents ₹ (two inputs).
3. NPS 80CCD(1B) — single ₹ input, hint "Additional ₹50,000 over 80C".
4. HRA — Rent paid, City type (Metro/Non-metro toggle), HRA received from employer.
5. Home loan interest (24b) — single ₹ input, max ₹2L.
6. Other (80E, 80G, 80TTA) — three small inputs.

Each input uses `CurrencyInput` (existing) with INR ₹ prefix and lakh/crore comma formatting.

**Inline tip card** at top: "These deductions only apply under the OLD regime. We'll show you a regime comparison before filing."

---

## Step 4 — Investments

- **Capital Gains?** Yes/No toggle. If Yes → "We'll ask the CA to help with this in a follow-up. Tap if you want to proceed without."
- **House Property** — repeat card pattern. Each card: Address, Type (Self-occupied / Let-out / Deemed let-out), Annual rent (if let-out).
- **Other Sources** — Interest from savings, Interest from FD/RD, Dividend.

---

## Step 5 — Review

Read-only `SummaryList` for each prior step grouped by section header. Each section row has a `Edit` text-link aligned right that jumps back to that step (preserves entered data).

At the bottom:
- **Recommended ITR form** badge (`Badge` variant=info): "Recommended: ITR-2"
- Disclaimer microcopy (per scope risk #4): "SnapAccount and our CAs assist you, but final accuracy is your responsibility."
- Primary CTA: `Submit Profile` (full-width Button variant=primary, height 52pt).

---

## States

- **Loading** — `SkeletonForm` for each input row while `GET /itr/profiles/me` resolves.
- **Saving (after Next tap)** — Footer Button enters `loading` state with spinner; disables back button. If POST fails → toast in `color.error.600` and Button returns to enabled.
- **Empty (first time user)** — Same as default Step 1.
- **Resume** — On mount, if backend returns last saved `step` field, jump to that step + 1 (or to Review if all 5 saved). Show one-time toast: "Welcome back — resuming from Step 3."
- **Validation Error** — Per-field inline error; on Next tap, scroll to first invalid field.

---

## Persistence Rules

- On `Next` tap, PATCH the step's payload + `lastCompletedStep` field.
- On `Save & Exit` tap, save current values (even if invalid) as draft; flag `isDraft: true`. Reload screen returns to that step.
- On `Back`, no save (uses local state).

---

## Accessibility

- Each step has a unique `accessibilityLabel="Step N of 5"`.
- Stepper dots have `accessibilityRole="button"` with state ("completed", "current", "upcoming").
- All inputs ≥ 44×44pt.
- Sticky footer Buttons reachable via swipe-up keyboard avoidance (`KeyboardAvoidingView`).
- Color contrast: filled stepper `color.brand.500` on `color.neutral.50` background → 4.6:1 ✓.

---

## i18n keys

```
itr.wizard.title
itr.wizard.step.{1..5}.heading
itr.wizard.step.{1..5}.subtitle
itr.wizard.fields.pan.label / .placeholder / .errorInvalid
itr.wizard.fields.dob.label
itr.wizard.fields.residentialStatus.{resident|nri|rnor}
itr.wizard.fields.occupation.{salaried|business|professional|other}
itr.wizard.deductions.section80c.label / .hint
... (one key per field)
itr.wizard.review.recommendedForm
itr.wizard.review.disclaimer
itr.wizard.cta.next / .back / .saveExit / .submit
itr.wizard.toast.savedDraft / .resumed
```

Languages: en, hi, bn (Sarvam AI). Containers must accommodate ±40% string length. Section headings allow 2-line wrap.

---

## Responsive

Mobile-only screen. On tablets, max content width 600pt centered; stepper expands.

---

## New Component Primitives Required

1. **Stepper** — horizontal indicator (mobile + admin both reuse).
2. **PanInput** — masked PAN input with checksum validation (extend TextInput).
3. **AccordionSection** — collapsible section header + body for grouping.
4. **SummaryList** — read-only "label: value [Edit]" list pattern.

(All four added to `component-library.md` Phase 6D additions.)
