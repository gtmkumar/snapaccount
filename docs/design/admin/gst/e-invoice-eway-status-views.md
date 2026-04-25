# E-Invoice (IRN) & E-Way Bill (EWB) Status Views — Admin Spec

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Mounting points:**
> - Invoice Detail Tab on `GstReturnReviewPage` — appended to selected invoice's detail panel.
> - Invoice slide-over (when opened from elsewhere).
> **Design system:** extends `docs/design/component-library.md`. No new tokens.

---

## 1. Purpose

Show the user the live result of e-invoice (IRN generation via IRP) and e-way bill (EWB) for a given invoice — including the IRN, acknowledgement number / date, signed QR code, EWB number, vehicle details, and validity window. These two government workflows are independent but visually parallel, so they share a common card layout (`IrpStatusCard`, `EwbStatusCard`) for consistency.

## 2. User goals

> "I generated an e-invoice — show me the IRN, the QR code, and a copy button so I can paste it onto the printed invoice."
> "I generated an e-way bill — show me the EWB number and validity so I can confirm it's still valid before dispatch."

## 3. Where these cards render

```
GstReturnReviewPage › Invoice Detail tab › Selected invoice
└── Detail panel
    ├── Header (existing)
    ├── Line items (existing — Phase 6B)
    ├── Tax breakdown (existing)
    ├── ── E-Invoice (IRN) ──   ← NEW (this spec)
    │   └── IrpStatusCard
    └── ── E-Way Bill ──         ← NEW (this spec)
        └── EwbStatusCard
```

Both cards collapse independently. Default state:
- Eligible org (turnover > ₹5 Cr) → both expanded.
- Ineligible org → cards still rendered but show "Not applicable" empty state (see §4.5 / §5.5) so users understand why no action is offered.

## 4. IrpStatusCard (E-Invoice)

### 4.1 Anatomy (generated state)

```
┌─ E-Invoice (IRN) ─────────────────────────────────── [▾]──┐
│                                                            │
│ [StatusBadge: Generated]  Generated 17 Apr 2026 14:32 IST  │
│                                                            │
│ ┌──────────────────────┐   IRN                             │
│ │                      │   35054cf...3a1b9       [📋]      │
│ │      [QR code]       │   (mono, full hash on hover)      │
│ │      192×192 px      │                                   │
│ │                      │   Ack no.   1120240417123456 [📋] │
│ │                      │   Ack date  17/04/2026 14:32 IST  │
│ └──────────────────────┘                                   │
│                                                            │
│ [Download IRN PDF ↓]  [Download QR PNG ↓]  [Cancel IRN ⋯] │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Props (data shape)

| Field | Source | Notes |
|---|---|---|
| `status` | enum: `not_applicable \| not_generated \| generating \| generated \| failed \| cancelled` | drives state |
| `irn` | string (64-char hex) | from `gst.e_invoice_irn_log.irn` |
| `ackNumber` | string (15 digit) | from `ack_no` |
| `ackDate` | ISO date | from `ack_date` |
| `qrPayload` | string (signed JWT from IRP) | rendered to QR |
| `errors` | `{ code, message }[]` | shown only on `failed` |
| `cancellable` | boolean | true within 24 h of `ackDate` per IRP rules |

### 4.3 QR rendering

- Render QR client-side from `qrPayload` (recommend `qrcode.react`).
- Default 192 × 192 (display); generated PNG downloads at 600 × 600 with 24px white quiet zone.
- `aria-label="E-invoice QR code for IRN {{irnShort}}"`.
- Backed by `<canvas>` so download button can convert to PNG without server.
- `loading="lazy"` for cards below the fold.

### 4.4 States (full enumeration)

| Status | Header pill | Body |
|---|---|---|
| `not_applicable` | `slate` "Not applicable" | EmptyState mini: "E-invoicing is required only for orgs with annual turnover > ₹5 Cr. Update org turnover in Settings to enable." + link |
| `not_generated` | `slate` "Pending" | Body shows `[Generate IRN]` primary CTA + helper text "Generates an IRN by submitting this invoice to the IRP." |
| `generating` | `info` "Generating…" | Skeleton QR + skeleton text rows; `[Cancel]` button (best-effort abort) |
| `generated` | `success` "Generated" | Full card §4.1 |
| `failed` | `error` "Failed" | `AlertBanner type=error` listing `errors[]`; `[Retry]` primary, `[View raw response]` secondary (opens modal showing IRP error JSON for support escalation) |
| `cancelled` | `warning` "Cancelled" | Same as generated but QR + IRN crossed out (text-decoration: line-through; color shifts to `slate.500`); cancellation reason + cancelled-at shown; `[Generate new IRN]` if invoice still eligible |

### 4.5 Interactions

- `[📋]` copy buttons: copy plain text, toast "Copied IRN" (`aria-live="polite"`).
- `[Download IRN PDF ↓]`: server-side render — opens GET in new tab.
- `[Download QR PNG ↓]`: client-side toBlob from canvas.
- `[Cancel IRN ⋯]`: opens `ConfirmDialog` with reason `Select` (Duplicate, Data entry error, Order cancelled, Others) + reason note (required when "Others"); on confirm, calls cancel endpoint, optimistic state → `cancelling`, then `cancelled` or rollback on error.
- `[Generate IRN]`: triggers `POST /gst/e-invoices`. Disables when invoice is in `DRAFT` or `ERROR`.

## 5. EwbStatusCard (E-Way Bill)

### 5.1 Anatomy (generated state)

```
┌─ E-Way Bill ─────────────────────────────────────── [▾]──┐
│                                                            │
│ [StatusBadge: Active]  Valid until 19 Apr 2026 23:59 IST   │
│                                                            │
│ EWB no.       121234567890     [📋]                        │
│ Generated     17/04/2026 14:35 IST                         │
│ Valid from    17/04/2026 14:35 IST                         │
│ Valid until   19/04/2026 23:59 IST                         │
│                                                            │
│ Vehicle       MH 12 AB 1234                                │
│ Mode          Road                                         │
│ Distance      247 km                                       │
│ Transporter   ABC Logistics (TRANSID 12AAAAA1234A1Z5)      │
│                                                            │
│ [Extend validity ↻]  [Update vehicle ✎]  [Cancel EWB ⋯]    │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Validity countdown

- A small `DueDateChip` (reused from Notice list spec §6.1) renders inline beside the validity-until label.
- Color rules:
  - > 12 h remaining → `info`
  - 1–12 h → `warning`
  - 0–1 h → `error` + pulsing 1×/4 s.
  - Expired → `error` "Expired" pill replaces the "Active" status pill.
- Updates every minute via interval.

### 5.3 Props

| Field | Source | Notes |
|---|---|---|
| `status` | enum: `not_applicable \| not_generated \| generating \| active \| expired \| cancelled \| failed` | — |
| `ewbNumber` | string (12 digit) | — |
| `generatedAt` / `validFrom` / `validUntil` | ISO | — |
| `vehicleNumber` | string | India format `XX 99 XX 9999` |
| `transportMode` | enum: Road, Rail, Air, Ship | — |
| `distanceKm` | int | — |
| `transporter` | `{ name, transId? }` | optional |
| `errors` | `{ code, message }[]` | for failed |

### 5.4 States

| Status | Header pill | Body |
|---|---|---|
| `not_applicable` | `slate` "Not applicable" | "E-way bill is required when invoice value > ₹50,000 for inter-state movement. This invoice does not meet the threshold." (rule may vary by state — text generated from server flag) |
| `not_generated` | `slate` "Pending" | `[Generate EWB]` primary; helper text |
| `generating` | `info` "Generating…" | Skeleton |
| `active` | `success` "Active" | Full card §5.1 |
| `expired` | `error` "Expired" | Read-only summary; banner: "EWB expired on {{date}}. Generate a new EWB to continue movement." |
| `cancelled` | `warning` "Cancelled" | Read-only with cancellation reason |
| `failed` | `error` "Failed" | Errors block + `[Retry]` |

### 5.5 Interactions

- `[Generate EWB]` opens slide-over: vehicle no., transport mode, distance, transporter; submit → `POST /gst/e-way-bills`.
- `[Extend validity ↻]`: only visible when `validUntil − now < 8h` (per EWB rules); opens dialog asking remaining distance + reason; mutates server.
- `[Update vehicle ✎]`: opens dialog; allowed multiple times during validity (per EWB Part-B rules).
- `[Cancel EWB ⋯]`: same UX as IRN cancel; only allowed within 24 h.

## 6. Shared rules across both cards

| Concern | Rule |
|---|---|
| Card chrome | `Card padding=md radius=lg shadow=sm border=true` |
| Heading | `<h3>` with section icon (file-check for IRN, truck for EWB) |
| Collapse state | Persisted per `(orgId, cardKey)` in localStorage |
| Mono fields | IRN, EWB no., Ack no., GSTIN — `font-family: var(--font-mono)`, `letter-spacing: 0.02em`; long values wrap with soft hyphen |
| Copy button | 44×44 hit target, `aria-label="Copy {{label}}"`, success toast |
| Status pills | Use `StatusBadge` variants from existing palette — no new tokens |
| Errors | `AlertBanner type=error` shows error code in mono + human message; expandable "Show raw response" for support |
| Print styles | When print stylesheet active, both cards expand fully and the QR keeps to 25 mm × 25 mm to satisfy CBIC print requirements |

## 7. Accessibility

- Each card is a `<section aria-labelledby>`.
- Collapse toggle is a real `<button aria-expanded>` with `aria-controls` pointing to body.
- QR `<canvas>` has visible-but-hidden text alternative summarizing IRN + ack details for screen readers.
- Copy buttons announce success via `aria-live="polite"`.
- Validity countdown updates announced only at thresholds (12h, 1h, expired) to avoid noise.
- Color is never the only signal: status uses badge text, validity uses chip text, errors include icon + message + structured list.
- Touch targets ≥ 44 × 44 pt.

## 8. Responsive

| Breakpoint | Behavior |
|---|---|
| ≥1024px | QR sits left of details (as in §4.1) |
| 768–1023 | QR stacks above details, both centered |
| <768 | QR scales to 160×160; copy buttons span full width; action buttons stack vertically (44px height each) |

## 9. i18n keys

```
admin.gst.eInvoice.heading
admin.gst.eInvoice.status.notApplicable
admin.gst.eInvoice.status.notApplicable.body
admin.gst.eInvoice.status.notGenerated
admin.gst.eInvoice.status.generating
admin.gst.eInvoice.status.generated
admin.gst.eInvoice.status.failed
admin.gst.eInvoice.status.cancelled
admin.gst.eInvoice.label.irn
admin.gst.eInvoice.label.ackNo
admin.gst.eInvoice.label.ackDate
admin.gst.eInvoice.label.qrAlt
admin.gst.eInvoice.action.generate
admin.gst.eInvoice.action.downloadPdf
admin.gst.eInvoice.action.downloadQr
admin.gst.eInvoice.action.cancel
admin.gst.eInvoice.action.cancel.reason
admin.gst.eInvoice.action.viewRaw
admin.gst.eInvoice.toast.copied
admin.gst.eInvoice.toast.generated
admin.gst.eInvoice.toast.cancelled

admin.gst.ewb.heading
admin.gst.ewb.status.notApplicable
admin.gst.ewb.status.notApplicable.body
admin.gst.ewb.status.notGenerated
admin.gst.ewb.status.generating
admin.gst.ewb.status.active
admin.gst.ewb.status.expired
admin.gst.ewb.status.cancelled
admin.gst.ewb.status.failed
admin.gst.ewb.label.ewbNo
admin.gst.ewb.label.generatedAt
admin.gst.ewb.label.validFrom
admin.gst.ewb.label.validUntil
admin.gst.ewb.label.vehicle
admin.gst.ewb.label.mode
admin.gst.ewb.label.distance
admin.gst.ewb.label.transporter
admin.gst.ewb.action.generate
admin.gst.ewb.action.extend
admin.gst.ewb.action.updateVehicle
admin.gst.ewb.action.cancel
admin.gst.ewb.toast.copied
admin.gst.ewb.toast.generated
admin.gst.ewb.toast.extended
admin.gst.ewb.toast.cancelled
```

`en`, `hi`, `bn` shipped together. Hindi/Bengali field labels run wider — labels use 2-line wrap up to 1.4× line height.

## 10. Telemetry

- `gst.eInvoice.viewed` { invoiceId, status }
- `gst.eInvoice.generated` { invoiceId, ms, mock }
- `gst.eInvoice.failed` { invoiceId, code }
- `gst.eInvoice.cancelled` { invoiceId, reason }
- `gst.ewb.generated` { invoiceId, ms }
- `gst.ewb.extended` { invoiceId }
- `gst.ewb.cancelled` { invoiceId }

## 11. Handoff notes

- Both cards consume mock adapter responses identically to production — no UI change between mock and live (per backend `IIrpClient` / `IEwbClient` pattern in scope §3–4).
- Reused primitives: `Card`, `StatusBadge`, `AlertBanner`, `ConfirmDialog`, `DueDateChip` (from notice spec §6.1), `Toast`.
- No new design tokens. QR rendering library to be chosen by frontend-dev (`qrcode.react` recommended).
