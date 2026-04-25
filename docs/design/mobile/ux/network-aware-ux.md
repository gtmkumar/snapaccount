# Network-Aware UX (Mobile)

> Phase 6F · Track F4 · Surfaces network state, queue size, retry affordances; biometric re-auth on sensitive flows.

## 1. Purpose
Make connection quality visible and actionable. Reassure users when offline, and protect them with re-auth on sensitive flows.

## 2. User goal
"My connection is bad — show me clearly, tell me what's queued, let me retry. And whenever I'm about to do something irreversible like submit a loan or upgrade my plan, ask me to confirm with biometrics."

## 3. NetworkQualityChip primitive

Compact pill placed adjacent to the queue chip in the screen header (right cluster). States derived from `@react-native-community/netinfo`:

| Quality | Trigger | Chip |
|---|---|---|
| Excellent | Wi-Fi or 5G/4G with ≥ 5Mbps measured | hidden (no chip) |
| Good | 4G with 1–5Mbps | hidden |
| Slow | 3G or measured < 1Mbps | "Slow connection" amber dot, `--warning` |
| Cellular (warn) | Cellular w/ user opted-out of cellular uploads + queue waiting | "Cellular · uploads paused" + "Resume" link |
| Offline | `isInternetReachable === false` | "Offline" cloud-off, neutral; queue chip overlaid count |

Tap chip → opens `NetworkSheet` showing:
- Current quality + Mbps measure.
- Queue summary.
- Toggles: "Upload over cellular", "Compress before upload".
- "Run diagnostic" button (pings health-check + reports latency).

## 4. Adaptive behaviors

### 4.1 Upload concurrency
- Excellent / Good: 3 parallel.
- Slow: 1 parallel.
- Cellular without opt-in: paused.
- Offline: paused (queue accumulates).

### 4.2 Image compression
- Slow / Cellular: aggressive compression (1024px max, 60% JPEG).
- Wi-Fi: standard (2048px max, 80%).

### 4.3 Polling
- Real-time chat falls back to long-poll at 10s interval on slow; back to WebSocket on good.
- Refund tracker / loan status polling: 30s on good, 2min on slow.

### 4.4 Skeleton vs spinners
- On Slow: skeletons stay longer (don't replace with spinners after 1s; wait 3s).
- Toast on slow first request: "This is taking longer — slow connection detected." (once per session).

## 5. Retry affordances

Anywhere a request can fail:
- Toast: "Couldn't reach SnapAccount" + "Retry" button.
- Inline error cards (e.g., on LoanStatusScreen): full message + "Try again" + "Open queue" deep-link.
- Offline-while-action: actions enqueue to local queue (where applicable: chat send, document capture, note add). Bubble shows queued state.

## 6. Biometric re-auth — sensitive flow gates

Reuse `LocalAuthentication`. Required for:

| Flow | Trigger point |
|---|---|
| LoanApplicationScreen submit | On press of "Submit application" |
| LoanPackagePreviewScreen mount + submit | (Already shipped 6C — keep) |
| LoanConsentScreen sign | (Already shipped 6C — keep) |
| ITRFilingSummaryScreen approve | On "Approve & e-verify" CTA |
| ITRFilingSummaryScreen view (if "Require biometric to view sensitive screens" setting on — default on for ITR) | On screen mount |
| SubscriptionUpgradeScreen confirm | On Confirm Upgrade |
| Settings > Change phone / change email | On submit |
| Reveal full secrets / IDs (e.g., Razorpay sub-id full) | On reveal tap |

### 6.1 UX
- Native Face/Touch ID prompt with title from i18n ("Confirm with biometrics").
- Fallback to device passcode if biometrics not enrolled.
- Refusal:
  - First refusal → toast "Confirmation needed to continue. Try again?" + "Try again" button.
  - Second refusal → cancel the action; navigate back where appropriate.
- Auto-cooldown: after success, 5-minute grace window — same flow doesn't re-prompt within window.

### 6.2 Failed device support
If `LocalAuthentication.hasHardwareAsync()` is false:
- Surface "We couldn't verify your device. Set a passcode in your phone's settings to continue." with link.
- Block the action.

## 7. Empty / loading / error
- NetworkSheet loading: shimmer rows.
- Diagnostic running: ProgressIndicator + "Pinging…".
- Diagnostic results: status icon + text + recommendation ("Try Wi-Fi for faster uploads").

## 8. Accessibility
- NetworkQualityChip is a button with `accessibilityLabel="{{quality}}, {{queueSize}} items waiting, double-tap for details"`.
- Biometric prompt fallback paths fully reachable via screen reader.
- "Cellular pause" toggle: `accessibilityRole="switch"`.

## 9. Settings entries

Settings > Network:
- Auto-upload on cellular (switch).
- Compress before upload (switch + sub-detail).
- Show network chip (switch — default on).

Settings > Security:
- Require biometric for sensitive screens (switch — default on).
- Biometric grace window: 5 min / 1 min / never reuse.

## 10. i18n keys
- `net.quality.{slow|cellular|offline}` chip labels
- `net.sheet.title`, `net.sheet.runDiagnostic`, `net.sheet.diagnostic.{running|done}`
- `net.toast.slowDetected`
- `bio.prompt.title.{loanSubmit|itrApprove|subUpgrade|reveal|generic}`
- `bio.refused.tryAgain`, `bio.refused.cancelled`
- `bio.unsupported.message`

## 11. Telemetry
- `net.quality_changed { from, to }`
- `bio.prompt_shown { flow }`, `bio.prompt_result { flow, outcome: 'success'|'cancel'|'fail' }`
- `net.diagnostic.run { latencyMs }`

## 12. Test plan
- [ ] Force slow network → chip appears, concurrency drops to 1, image compression aggressive.
- [ ] Airplane mode → chip says "Offline", queue accumulates, no spinner storms.
- [ ] Biometric grace window respected (no double-prompt within 5min on same flow).
- [ ] Device without biometric hardware → graceful blocker.

## 13. Components used / extended
NetworkQualityChip (new), NetworkSheet (new), BiometricGate (HOC), Toast, LocalAuthentication wrapper, Settings sub-screens.
