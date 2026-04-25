# Mobile — DocChecklistScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Show the personalized list of documents the user needs to upload to complete their ITR filing. The list is fetched from backend (`GET /itr/filings/{id}/checklist`) and varies by profile (salaried vs business vs professional). Each item links to upload UI; completion percentage drives a top progress ring.

## User Goal

"Tell me exactly what to gather. Show me what's done and what's left."

---

## Layout

```
┌─ Header  [back]  "Documents needed" ──────────────┐
│  ProgressRing (large, top center)                 │
│   "4 of 7 done"  "57%"                            │
│  Subtext: "AY 2026-27 · ITR-2"                    │
│  ────────────────────────────────────────────────│
│  ChecklistGroup "Required" (red dot if missing)   │
│   ItemRow Form 16              [Upload]   ●needed │
│   ItemRow PAN copy              ✓ done            │
│   ItemRow Bank statement (FY)   [Upload]  ●needed │
│  ChecklistGroup "Recommended"                     │
│   ItemRow 80C investment proofs ✓ done            │
│   ItemRow Rent receipts (HRA)   [Upload]          │
│  ChecklistGroup "Optional"                        │
│   ItemRow Donation receipts     [Upload]          │
│  ────────────────────────────────────────────────│
│  StickyFooter Button                              │
│   [Continue to Review]  (disabled until Required=100%)│
└───────────────────────────────────────────────────┘
```

---

## ItemRow component

- Left: 40pt icon (file type — PDF / image / generic).
- Center: Title (one line), subtitle ("Required for HRA deduction" — small).
- Right: Status chip — `Badge` variant=success "Done", or text Button "Upload" (variant=secondary, size=sm).
- Tap row → opens upload sheet (camera / gallery / files).
- Already-uploaded → tap row reveals thumbnail + "Replace / Remove" actions.

Touch target: full row 56pt min.

---

## ProgressRing

- Diameter 96pt, stroke 8pt.
- Track `color.neutral.200`, fill `color.brand.500` arc.
- Center: large "4/7" + small "57%".
- ARIA: `accessibilityValue={now: 4, max: 7}`.

---

## States

- **Loading** — Skeleton ring + 6 skeleton ItemRows.
- **Empty (no items)** — Should not occur (backend always returns at least PAN+Form 16). Fallback message with retry.
- **Error** — Inline error card with `Retry` button.
- **All Required Done** — Footer Button enabled, top banner card "You're ready to proceed" in `color.success.50`.
- **Upload in progress** — ItemRow shows linear progress bar; status chip "Uploading 64%".
- **Upload failed** — Status chip in red "Failed · Retry"; tap retries.

---

## Indian UX Notes

- Form 16 row links directly into `Form16UploadScreen` (special OCR flow).
- All other docs use generic `DocumentCaptureScreen` (existing camera-screen pattern).
- File naming auto-suffix `_AY2026-27` to keep per-year docs distinguishable.

---

## i18n keys

```
itr.checklist.title
itr.checklist.progress.label  ("{done} of {total} done")
itr.checklist.group.{required|recommended|optional}
itr.checklist.item.form16.title / .subtitle
itr.checklist.item.pan.title
itr.checklist.item.bankStatement.title / .subtitle
itr.checklist.item.deduction80cProofs.title
itr.checklist.item.rentReceipts.title
itr.checklist.cta.upload / .replace / .remove
itr.checklist.cta.continueToReview
itr.checklist.banner.allRequiredDone
```

en/hi/bn supported. Strings expand: ensure card padding tolerates +40%.

---

## Accessibility

- ProgressRing has `accessibilityLabel="4 of 7 documents uploaded, 57 percent"`.
- ItemRow `accessibilityRole="button"` with state ("done" / "needs upload").
- Color cues backed by icons (red dot AND "needed" text) for color-blind users.
- Status chip contrast ≥ 4.5:1.

---

## Responsive

Mobile only. Tablet: list max width 600pt.
