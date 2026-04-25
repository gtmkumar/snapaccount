# Mobile — Form16UploadScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Capture or upload a Form 16 PDF, run Document AI OCR extraction in the backend, and let the user review/edit extracted fields before saving. This is the income-source backbone for salaried filings.

## User Goal

"Let me grab my Form 16, confirm the numbers it pulled, and move on without retyping the whole thing."

---

## Flow

1. **Pick source** sheet → Camera / Gallery / Files.
2. **Preview** the captured PDF/image.
3. **Upload** → backend runs OCR (`POST /itr/form16/extract`).
4. **Extraction Review** screen — editable fields prefilled from OCR.
5. **Confirm & Save** → returns to checklist.

---

## Screen 1 — Capture / Pick

Reuses the **camera-screen-deltas.md** UX (Phase 6A) with one specialization: top guidance card "Make sure the entire Form 16 is in frame and text is readable." Capture button labeled "Capture Form 16."

For Files: open native file picker; PDF only (max 10 MB; show error toast otherwise).

---

## Screen 2 — Preview

```
┌─ Header  [back]  "Review your Form 16" ───────────┐
│  PdfPreview (paginated, scroll horizontally)      │
│  CaptionRow  "Page 1 of 2"                        │
│  StickyFooter                                     │
│   [Retake]                            [Upload →]  │
└───────────────────────────────────────────────────┘
```

- PdfPreview uses `react-native-pdf` (mobile-dev to confirm). Pinch-zoom enabled.
- Retake returns to Screen 1.
- Upload triggers `POST /itr/form16/extract` with multipart file. Show full-screen blocking spinner with caption "Reading your Form 16…" (typical 8–15 s with Document AI).

---

## Screen 3 — Extraction Review

```
┌─ Header  [back]  "Confirm extracted details" ─────┐
│  ConfidenceBanner                                 │
│   "We pulled 18 of 19 fields with high confidence.│
│    Please verify before saving."                  │
│  ─────────────────────────────────────────────── │
│  Section "Employer"                               │
│   TextInput Employer name                         │
│   TextInput TAN  (read-only, formatted)           │
│   TextInput Address                               │
│  Section "Employee"                               │
│   TextInput PAN  (locked)                         │
│   TextInput Period of employment                  │
│  Section "Salary"                                 │
│   CurrencyInput Gross salary                      │
│   CurrencyInput Allowances exempt u/s 10          │
│   CurrencyInput Standard deduction                │
│   CurrencyInput Net taxable salary  (computed)    │
│  Section "TDS"                                    │
│   CurrencyInput TDS deducted                      │
│   CurrencyInput Quarterly breakdown (Q1..Q4)      │
│  ─────────────────────────────────────────────── │
│  StickyFooter                                     │
│   [Cancel]                            [Save & Continue]│
└───────────────────────────────────────────────────┘
```

### Confidence indicators

Each input that came from OCR shows a small icon to the right:
- Green check (confidence ≥ 0.9): subtle, one-line.
- Yellow alert (0.7–0.9): tooltip "We're not 100% sure — please double-check."
- Red alert (< 0.7): inline message "We couldn't read this clearly — please enter manually."

Computed fields (e.g., Net taxable salary) are shown read-only with a small "= calculated" badge.

---

## States

- **Loading (extraction)** — Full-screen overlay with progress text + cancel button (cancels POST and returns to preview).
- **Extraction failed** — Error screen: "We couldn't read this Form 16. Try again or enter manually."
  - Buttons: `Retry` (re-runs OCR) / `Enter manually` (shows blank Section 3 form).
- **Partial extraction** — Banner reads "We pulled X of Y fields. Please complete the rest."
- **Saving** — Footer Save button shows spinner; rest of form disabled.
- **Save error** — Toast "Could not save. Try again." Button re-enables.

---

## OCR language note (ambiguity flagged in scope)

**Assumption for MVP: Form 16 OCR supports English only.** Document AI's `FORM_PARSER_PROCESSOR` reliably handles Indian Form 16 PDFs printed in English (the standard format). If a non-English Form 16 is encountered, the extraction-failed state appears with an extra hint: "We currently support English Form 16. Please enter values manually." A future phase can add Hindi/regional parsing.

---

## i18n keys

```
itr.form16.capture.title / .guidance / .cta.capture
itr.form16.preview.title / .cta.retake / .cta.upload / .uploading
itr.form16.review.title
itr.form16.review.banner.confident / .banner.partial
itr.form16.review.section.{employer|employee|salary|tds}
itr.form16.review.field.employerName / .tan / .pan / .grossSalary / .stdDeduction / .netTaxableSalary / .tdsDeducted / ...
itr.form16.review.confidence.tooltip.{high|medium|low}
itr.form16.review.cta.save / .cta.cancel
itr.form16.error.tooLarge / .extractionFailed / .saveFailed
itr.form16.error.languageUnsupported
```

---

## Accessibility

- Confidence icons paired with text (not color-only).
- All editable fields ≥ 44pt; numeric inputs use `keyboardType="decimal-pad"`.
- PdfPreview has `accessibilityLabel="Form 16 page {n} of {total}"`.

---

## Responsive

Mobile only.
