# CameraScreen + DocumentListScreen — Phase 6A Design Deltas

> **Scope:** Phase 6A additions covering the photo-capture upload queue state machine and the processing/retry affordance on `DocumentListScreen`.
> **Existing spec:** `docs/design/screens/mobile/document-vault.md` (CameraScreen + DocumentListScreen sections).
> **Design system:** extends tokens (`docs/design/tokens.json`) and `StatusBadge` variants in `docs/design/component-library.md` §2.5.
> **Minimum touch targets:** 44×44pt on all interactive elements (WCAG 2.5.5 / iOS HIG).

---

## 1. Status state machine

```
          ┌──────────┐   net available   ┌────────────┐  server ack  ┌────────────┐
  capture │  QUEUED  │ ───────────────▶ │  UPLOADING │ ───────────▶ │ PROCESSING │
  ──────▶ └──────────┘                  └────────────┘              └────────────┘
              ▲                                │                           │
              │ retry                          │ transport fail            │ OCR done
              │                                ▼                           ▼
              │                         ┌────────────┐              ┌────────────┐
              └──────────────────────── │   FAILED   │              │   READY    │
                                        └────────────┘              └────────────┘
                                              │
                                              │ manual retry (user tap)
                                              └──────────────▶  QUEUED
```

- **QUEUED**: in local AsyncStorage queue, waiting for connectivity or upload slot. (Per CLAUDE.md: queue metadata — not tokens — in AsyncStorage.)
- **UPLOADING**: active multipart upload to `POST /documents/upload`; progress 0–100%.
- **PROCESSING**: upload complete, `POST /documents/{id}/ocr/request` fired; waiting on Pub/Sub → server event.
- **READY**: OCR complete, extraction ready for review.
- **FAILED**: terminal until user retries. Sub-reasons surfaced in secondary label:
  - `NETWORK` (no connectivity after timeout)
  - `UPLOAD_REJECTED` (4xx from server — file too big, unsupported format)
  - `OCR_FAILED` (5xx or Document AI error — retryable)
  - `TIMEOUT` (no server event within 60s of PROCESSING entry)

---

## 2. DocumentListScreen — card anatomy updates

Reuses existing `DocumentCard` (component-library §6.4). Add a **Processing Badge slot** in the top-right and a **Footer CTA slot** that appears only in FAILED state.

```
┌──────────────────────────────────────────────────────────┐
│  [thumbnail]  Invoice — Acme Traders         [• QUEUED]  │
│               ₹ 24,500 · 18 Apr 2026                     │
│                                                          │
│               [progress bar — only in UPLOADING]         │
│                                                          │
│               [Retry]   [Remove]     ← FAILED only       │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Processing badge — variant map

All use existing `StatusBadge` component with a new **document processing** status group. These extend, do not replace, the existing document statuses table in component-library §2.5.

| Status | Variant token | Icon | Label (en) | Motion |
|---|---|---|---|---|
| QUEUED | `neutral` (bg `color.neutral.100`, text `color.neutral.700`) | `clock` | "Queued" | static |
| UPLOADING | `info` (bg `color.info.100`, text `color.info.700`) | `arrow-up-circle` | "Uploading · 42%" | icon rotates slowly |
| PROCESSING | `brand` (bg `color.brand.100`, text `color.brand.700`) | `sparkles` | "Processing…" | pulsing dot (2s loop) |
| READY | `success` (bg `color.success.100`, text `color.success.700`) | `check-circle` | "Ready" | static |
| FAILED | `error` (bg `color.error.100`, text `color.error.700`) | `alert-triangle` | "Failed" | static |

**New variant to add to Badge component docs (append under "Phase 6A"):** `processing` alias that maps to `brand` visuals with a pulsing 6×6 dot prefixing the label. No new color tokens required.

### 2.2 Progress bar (UPLOADING only)
- Uses existing `ProgressBar` component (component-library §4.3).
- Height 3px, `color.brand.500` fill, `color.brand.100` track.
- Determinate when server reports bytes, indeterminate shimmer if not.
- Hidden in all other states.

### 2.3 Footer CTA row (FAILED only)
- Two buttons side-by-side, separated by 12px.
- **Retry**: `PrimaryButton` size=sm, variant=brand, `refresh-cw` leading icon. Full width ÷ 2 minus 6. Minimum height **44pt**.
- **Remove**: `SecondaryButton` size=sm, destructive tone (`color.error.600` text on transparent), `trash-2` leading icon. Confirms via system sheet before deleting queue entry.
- Touch targets extend beyond visual bounds via `hitSlop={8}` to reach 44×44.

### 2.4 Error sub-reason surfacing
- Render a `fontSize.xs` `color.neutral.500` line below the card title: `"Upload failed — tap Retry"` or specific text per sub-reason:
  - NETWORK: "Waiting for internet. Will retry when online." + auto-retry on reconnect (no user tap).
  - UPLOAD_REJECTED: "File too large (limit 10 MB)." — Retry disabled; only Remove available.
  - OCR_FAILED: "Scan failed. Tap Retry."
  - TIMEOUT: "Taking longer than expected. Tap Retry."

---

## 3. CameraScreen — capture flow updates

Existing CameraScreen spec already covers the capture UI. Additions:

### 3.1 Capture confirmation
- On shutter, show a **1.5s toast** at the top: "Saved to queue — uploading in background." Uses existing `Toast` component, variant `info`, with `action={ label: 'View', onPress: () => navigate('DocumentList') }`.
- No blocking screen; user can continue capturing.

### 3.2 Offline capture
- Banner at top: `AlertBanner` type=warning, title "Offline — saved locally", description "Will upload when connected." Dismissible; reappears on each capture while offline.
- Queue count indicator in bottom-left above the shutter: small chip `"3 pending upload"` using `Tag` component, `color.brand.50` bg, tapping navigates to DocumentListScreen.

### 3.3 Permission & error states (unchanged from prior spec; confirmed sufficient)
- Camera denied → `EmptyState` with "Open Settings" CTA.
- Storage full → blocking `Alert` sheet with explanation.

---

## 4. Retry & optimistic state rules

- **Optimistic card**: inserted at top of DocumentListScreen immediately on capture with a temp UUID, thumbnail from local file URI. Replaced by server-id card on UPLOADING ack.
- **Automatic retries**: exponential backoff for NETWORK/OCR_FAILED/TIMEOUT — 5s, 15s, 60s, then FAILED requiring manual retry.
- **Manual retry** (user taps Retry): resets to QUEUED, clears backoff counter, re-enqueues.
- **Server events**: subscribe via existing notification channel; server push `document.status.changed` updates local queue item.

---

## 5. Accessibility

- Every processing badge includes `accessibilityLabel` with full text: `"Document status: Processing, please wait"` — not just the short label.
- Retry/Remove buttons have `accessibilityRole="button"` and minimum 44×44pt hit area verified via `hitSlop`.
- Progress bar announces via `AccessibilityInfo.announceForAccessibility` at 25/50/75/100% so VoiceOver/TalkBack users get progress updates without re-announcing every byte.
- FAILED state announces once via `aria-live` equivalent: "Upload failed. Double-tap Retry to try again."
- Color is never the only indicator — every badge pairs color with an icon.

---

## 6. i18n keys

```
mobile.docs.status.queued
mobile.docs.status.uploading         # supports {percent} interpolation
mobile.docs.status.processing
mobile.docs.status.ready
mobile.docs.status.failed
mobile.docs.status.failedReason.network
mobile.docs.status.failedReason.uploadRejected
mobile.docs.status.failedReason.ocrFailed
mobile.docs.status.failedReason.timeout
mobile.docs.action.retry
mobile.docs.action.remove
mobile.docs.action.removeConfirmTitle
mobile.docs.action.removeConfirmBody
mobile.camera.toast.savedToQueue
mobile.camera.toast.savedViewCta
mobile.camera.offlineBannerTitle
mobile.camera.offlineBannerBody
mobile.camera.pendingChip         # e.g. "{count} pending upload"
```

Locales required on launch: en, hi, bn. Text container must accommodate ±40% length variation (memory rule); note Bengali "আপলোড হচ্ছে" is longer than English "Uploading" — badge width must not be fixed.

---

## 7. Tokens / components summary

- **No new colors.** All variants map to existing `color.*` tokens.
- **No new spacing or radius tokens.**
- **New badge alias** `processing` appended to `StatusBadge` (non-breaking).
- **New `DocumentCard` footer slot** (prop `footerSlot?: ReactNode`) — append to `DocumentCard` spec in component-library under "Phase 6A".

---

## 8. Status

| Item | Status |
|---|---|
| State machine QUEUED→UPLOADING→PROCESSING→READY/FAILED | **Good to implement** |
| Processing badge variants + pulsing dot | **Good to implement** |
| Retry / Remove footer CTA (44pt minimum) | **Good to implement** |
| `DocumentCard.footerSlot` prop extension | **Good to implement** — non-breaking |
| Offline capture banner + pending chip | **Good to implement** |
| Automatic retry backoff policy | **Needs design review** — coordinate with mobile-dev on battery impact of 60s timer in background; may need to defer last step to push-triggered wake-up |

*End of Phase 6A deltas for CameraScreen / DocumentListScreen.*
