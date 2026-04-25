# Mobile — LoanApplicationScreen

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

The structured application form + document checklist. User confirms loan parameters, supplies application-only fields, and uploads required documents. When all items are green, a "Preview package" CTA unlocks.

## User Goal

"Tell me what I need to provide. Let me knock through the checklist quickly without leaving the app."

---

## Layout

```
┌─ Header  [back]  "{Bank} · {Product}"  [save draft] ─────┐
│  ApplicationSummaryStrip                                   │
│   ₹15,00,000  ·  24 months  ·  Working capital  [Edit]    │
│  ─────────────────────────────────────────────────────── │
│  Section "Application details"                             │
│   PanInput (read-only, fetched from profile)              │
│   GstinInput (read-only)                                   │
│   BusinessVintageRow ("Years in business: 5.2 (auto)")    │
│   AnnualRevenueRow ("FY24-25 turnover: ₹52.4L (auto)")    │
│   AlternateContactInput (optional)                         │
│   PurposeNoteTextarea (optional, max 280 chars)            │
│  ─────────────────────────────────────────────────────── │
│  Section "Document checklist"  ProgressRing 4/8           │
│   DocChecklistRow  PAN card           [✓ uploaded]        │
│   DocChecklistRow  Aadhaar (last 4)   [✓ uploaded]        │
│   DocChecklistRow  GSTR-3B 12 months  [auto · 12 of 12 ✓] │
│   DocChecklistRow  P&L FY 24-25       [auto · ✓]          │
│   DocChecklistRow  Balance Sheet 24-25[auto · ✓]          │
│   DocChecklistRow  Bank statement     [Upload →]          │
│   DocChecklistRow  Trade license      [Upload →]          │
│   DocChecklistRow  ITR FY 24-25       [auto · pending]    │
│  ─────────────────────────────────────────────────────── │
│  PackagePreviewTeaser (only after all rows green)         │
│   "Your loan package is ready — 47 pages ready to review" │
│   [Preview package →]                                      │
│  ─────────────────────────────────────────────────────── │
│  StickyFooter                                              │
│   [Save & exit]              [Preview package →]          │
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `ApplicationSummaryStrip` — single-row card; tap Edit reopens eligibility step.
- `PanInput`, `GstinInput` (Phase 6D primitives) in read-only variant.
- Auto-rows are `SummaryList` rows with right-aligned value.
- `DocChecklistRow` — extends Phase 6D ChecklistRow primitive; new variant `auto` (system-supplied) shows "auto" badge.
- `ProgressRing` next to section header; updates as rows turn green.
- `PackagePreviewTeaser` — `CalloutCard` brand variant with arrow CTA.

## DocChecklistRow states

- `pending` — outlined chevron, "Upload" CTA, opens `CameraScreen` (Phase 5) for capture or document picker for PDF.
- `uploading` — spinner + percentage, supports cancel.
- `processing` — virus-scan + OCR running; "Verifying…" with subtle pulse.
- `uploaded` — success check + filename + tap to replace/view.
- `auto-pending` — "auto · pending" badge while AccountingService/GstService finalizes (P&L lock/GSTR-3B retrieval).
- `auto-ready` — "auto · ✓" badge.
- `error` — red banner with retry; row stays expanded with the failure reason.

## Camera reuse

- Tap `Upload` on a non-auto row → navigates to `CameraScreen` with params `{ purpose: 'loan-doc', docType, applicationId }`. Returns asset URI; UI uploads via existing DocumentService POST.
- Multi-page docs: CameraScreen multi-shot mode → produces a single combined PDF.

## Preview unlock rule

- All checklist rows must be in `uploaded` or `auto-ready` state.
- Plus all consents already signed (else CTA copy switches to "Sign consents to continue" linking to LoanConsentScreen).
- Footer primary CTA disabled with explanatory tooltip otherwise.

## States

- **Loading** — skeleton rows for all sections.
- **Auto-doc retrieval failed** — row shows `error` variant + Retry; user may force-upload manually.
- **Save draft** — top-right save icon writes current state; toast "Draft saved".
- **Resuming** — opens with last known state; auto rows re-poll on mount.

## i18n keys

```
loan.application.title ("{bank} · {product}")
loan.application.summary.amount / .tenure / .purpose / .editCta
loan.application.section.details / .checklist
loan.application.field.pan / .gstin / .vintage / .revenue / .altContact / .purposeNote
loan.application.checklist.row.{pan|aadhaar|gstr3b|pl|bs|bankStmt|tradeLicense|itr}
loan.application.checklist.badge.{auto|autoPending|uploading|processing|uploaded|error}
loan.application.preview.teaser ("Your loan package is ready — {pages} pages ready to review")
loan.application.cta.saveExit / .preview
loan.application.gate.signConsents
loan.application.error.autoFailed / .uploadFailed
```

## Accessibility

- Each DocChecklistRow `accessibilityRole="button"` with full label "{docType}, {state}".
- ProgressRing announces progress for the section.
- Auto-rows are non-interactive when ready (`accessibilityRole="text"`).
- Touch targets ≥44×44pt; row height 64pt.
- Color cues paired with icon + text for every state.

## Indian-format

- Amounts: Indian grouping (₹15,00,000).
- Vintage: "5.2 years" (1 decimal).
- Dates DD MMM YYYY.

## Telemetry

- `loan.app.opened {productId}`, `loan.app.docUploaded {docType}`, `loan.app.autoDocReady {docType}`, `loan.app.previewUnlocked`, `loan.app.draftSaved`.
