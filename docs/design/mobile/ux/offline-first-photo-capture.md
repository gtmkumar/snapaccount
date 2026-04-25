# Offline-First Photo Capture (Mobile UX)

> Phase 6F · Track F4 · Extends `useDocumentQueue` shipped partial in Phase 6A.

## 1. Purpose
Make document capture and submission resilient to flaky / no networks: instant local persistence, transparent queue UX, automatic background sync, per-item retry with exponential backoff.

## 2. User goal
"In a basement office with no signal, I scan 10 receipts. They show up immediately in my list. When I step outside and signal returns, they upload silently and I see them turn green."

## 3. Lifecycle states

| State | Icon | Color | Description |
|---|---|---|---|
| QUEUED | clock | neutral | Captured offline, awaiting upload |
| UPLOADING | up-arrow with progress ring | info | Currently transferring (with %) |
| PROCESSING | sparkles | info | Server-side OCR / classification |
| READY | check-circle | success | Available across devices |
| FAILED | alert-triangle | error | Permanent fail after retries — user action required |

Each state surfaces an `accessibilityLabel` like "Receipt 12 Apr, queued, awaiting connection".

## 4. Local persistence model

- Capture writes EXIF-stripped JPEG to `FileSystem.documentDirectory + 'queue/{uuid}.jpg'`.
- Queue manifest at `FileSystem.documentDirectory + 'queue/manifest.json'`: array of `{ id, capturedAt, sizeBytes, status, attempts, lastError, lastAttemptAt, idempotencyKey }`.
- Manifest persists across app restarts. Hydrated on app boot before list renders.
- Idempotency key generated client-side (UUID v4) and sent on every upload attempt; backend dedupes.

## 5. Background sync

- Expo `BackgroundFetch` task registered to fire every 15 min when app backgrounded.
- Foreground: NetInfo state change → if online + queue non-empty, fire sync.
- Sync algorithm:
  1. Pick oldest QUEUED or FAILED-ready-for-retry item.
  2. Move to UPLOADING; mark attempt timestamp.
  3. POST multipart (idempotency key in headers).
  4. On 200: move to PROCESSING; subscribe to processing event for READY.
  5. On 4xx (terminal): FAILED with descriptive reason.
  6. On 5xx / network: increment attempts; backoff `min(60s * 2^attempts, 30min)`.

Concurrency: max 2 parallel uploads (configurable; 1 on slow network — see network-aware-ux.md).

## 6. UI surfaces

### 6.1 DocumentList row
Each row shows:
- Local thumbnail (optimistic; even before upload).
- Title (auto from OCR after PROCESSING; "Photo {{date}}" placeholder before).
- Right rail: status icon + chip + small progress ring (if UPLOADING).
- Long-press: action sheet — Retry now (FAILED only), Delete from queue, View captured photo, Open detail (READY).

### 6.2 Header chip
A compact pill in the top-bar shows live queue summary:
- "All synced" (queue empty) — green check.
- "Syncing 3" (active uploads) — animated arrow.
- "3 waiting · offline" (offline) — neutral cloud-off.
- "2 failed" (any failures) — error triangle, tap opens failure list.

Tap opens a `Sheet` showing the queue with bulk actions (Retry all, Delete all failed).

### 6.3 First-time hint
Toast on first capture-while-offline: "No connection — saved locally. We'll upload it when you're back online." Once-per-user.

### 6.4 Failure detail
Tap a FAILED item to open detail sheet:
- Reason (human-translated server error).
- Last attempt time.
- "Retry now" primary.
- "Delete from queue" destructive (confirm).
- Audit trail of attempts.

## 7. Per-item retry

Manual: tap retry → resets backoff, fires immediate sync.
Automatic: backoff schedule above. After 6 attempts, item is "FAILED – manual" and won't auto-retry until user taps.

## 8. Network-aware behavior

- On slow/expensive connection (NetInfo + cellular type 2g/3g, or `effectiveType`), pause uploads >2MB unless user explicitly opts in via "Upload over cellular" toggle (Settings).
- Wi-Fi: full-throttle.
- Surfaces NetworkQualityChip from network-aware-ux.md.

## 9. Sync conflict / idempotency
- Server returns 200 with existing doc id when same idempotency key seen.
- Client maps to existing READY state; no duplicate row.

## 10. Empty / loading / error
- Empty queue + nothing READY locally: existing DocumentList empty state (unchanged from Phase 6A).
- Hydration loading: skeleton rows.
- BackgroundFetch unavailable on platform: silent fallback to foreground-only; "Some uploads need the app open" hint shown once.

## 11. Accessibility
- Status icons paired with text label always.
- Progress ring includes `accessibilityValue={now,max}` and `accessibilityRole="progressbar"`.
- Header chip is a button with descriptive `accessibilityLabel` ("3 documents waiting to upload, you're offline").
- Failure messages user-readable (no error codes).

## 12. Haptics
- Capture success: `Haptics.impactAsync(Light)`.
- Item moves to READY: `Haptics.notificationAsync(Success)` (only if app foregrounded).
- All-synced (queue went from non-empty to empty): single soft success haptic, never spammed.

## 13. i18n keys
- `queue.status.{queued|uploading|processing|ready|failed}`
- `queue.header.{allSynced|syncing|offlineWaiting|failed}` (with `{{count}}`)
- `queue.firstTimeHint`
- `queue.failure.reason.{networkLost|tooLarge|server|invalidFile}` etc.
- `queue.action.{retryNow|deleteFromQueue|viewPhoto|openDetail}`
- `queue.cellular.uploadOverCellular`
- `queue.toastAllSynced`

en/hi/bn provided.

## 14. Settings entry
`Settings > Captures` adds toggles:
- Auto-upload on cellular (default off).
- Show queue chip in header (default on).
- Compress before upload (default on; Wi-Fi-only override).

## 15. Test plan
- [ ] Airplane mode 10 captures → connect → all reach READY within 30s.
- [ ] Force-quit app mid-upload → relaunch → resume from manifest.
- [ ] Server returns 503 → exponential retry visible; eventually FAILED at attempt 6.
- [ ] Idempotency: kill mid-success-ack → relaunch → no duplicate document.

## 16. Components used
QueueChip (header), QueueStatusBadge (extends StatusBadge with queue-specific variants), QueueDetailSheet, RetryButton, DocumentRow (extended), Sheet, Toast.
