# Haptics & Celebrations (Mobile UX)

> Phase 6F · Track F4 · Extends CelebrationOverlay primitive shipped in Phase 6C (`kind` enum expanded).

## 1. Purpose
A coherent, restrained haptic + celebration system. Haptics reinforce affordance and consequence; celebrations mark milestone achievements (especially on plan K2 step 15 — "First GST filed").

## 2. Principles
- **Restraint over reward** — celebrations are rare; haptics are quiet.
- **Predictability** — same action always feels the same.
- **Accessibility-respectful** — `prefersReducedMotion` collapses confetti to fade; haptics can be globally disabled in Settings.
- **Battery-conscious** — no continuous haptics; max 600ms total per event.

## 3. Haptics map

Using Expo `Haptics`:

| Event | API call | When |
|---|---|---|
| Tap / select | `impactAsync(Light)` | Selecting items in lists with consequence (toggle, multi-select). NOT for plain navigation. |
| Switch toggle | `impactAsync(Light)` | Boolean switch flipped. |
| Swipe-action threshold | `impactAsync(Light)` | Swipe reaches commit point. |
| Pull-to-refresh release | `impactAsync(Light)` | At trigger threshold. |
| Form submit success | `notificationAsync(Success)` | Successful POST: file upload, message sent, plan saved. |
| Save success | `notificationAsync(Success)` | Settings change persisted. |
| Mild warning | `notificationAsync(Warning)` | Validation warning, near-deadline alerts. |
| Error / failure | `notificationAsync(Error)` | API error, biometric fail, validation block. |
| Long-press | `impactAsync(Medium)` | Reveal action sheet, drag-handle activation. |
| Scan / capture | `impactAsync(Medium)` | Camera shutter fire. |
| Celebration burst | sequence: `Success` then 2× `Light` 60ms apart | Celebration trigger only. |

Globally gated by `Settings > Accessibility > Haptics` (default on; never bypassed).

## 4. CelebrationOverlay

Existing primitive (Phase 6C) accepts a `kind` prop. Phase 6F adds variants below.

### 4.1 Variants

| Variant | Trigger | Headline | Subline | Emoji / Lottie |
|---|---|---|---|---|
| `firstGst` | First GSTR-1 / GSTR-3B filed by user | "First GST filed!" | "{{period}} return submitted to GSTN. Acknowledgment {{ack}}." | currency-rupee + confetti |
| `firstRefund` | First income-tax refund credited | "Refund credited!" | "₹{{amount}} hit your account on {{date}}." | tree-of-rupees |
| `loanApproved` | Loan APPROVED state (already 6C) | "Loan approved!" | "{{bank}} approved ₹{{amount}}." | handshake (existing) |
| `loanDisbursed` | Loan DISBURSED state (already 6C) | "Loan disbursed!" | "₹{{amount}} sent to your account." | money-rain (existing) |
| `firstItr` | First ITR filed (any AY) | "ITR filed!" | "Your income-tax return for AY {{ay}} is filed." | document-with-stamp |
| `firstNoticeResolved` | First GST/IT notice marked RESPONDED | "Notice resolved!" | "You handled it like a pro." | shield-check |
| `planK2Step15` | Plan K2 onboarding step 15 milestone | "You're set!" | "Welcome to SnapAccount Pro." | confetti-burst |
| `firstChatResolved` | First chat thread resolved by user (CA-side) | "Inbox cleared!" | "{{count}} threads handled today." | broom-sparkle |
| `custom` | Programmatic | (caller-provided) | (caller-provided) | (caller-provided) |

Each variant is fired at most ONCE per user (server-side guarded by `celebrations.fired` table).

### 4.2 Visual layout
- Full-screen overlay, blurred backdrop (`--surface-canvas` 0.92 opacity).
- Lottie animation 240×240pt centered above headline.
- Headline 28pt bold, `--text-primary`.
- Subline 16pt, `--text-secondary`, max 2 lines.
- Primary CTA below (e.g., "Continue", "View receipt", "Share").
- Secondary CTA "Dismiss" ghost.
- ESC / back / scrim tap dismisses.

### 4.3 Reduced-motion fallback
- Lottie replaced with static success icon.
- Confetti omitted.
- Fade-in 200ms vs default 600ms scale-bounce.

### 4.4 Haptic sequence on present
1. On overlay first paint: `notificationAsync(Success)`.
2. After 120ms: two `impactAsync(Light)` 60ms apart.
3. No further haptics for 3s.

If reduced-motion, only the initial Success haptic fires (no double-tap).

### 4.5 Auto-dismiss
- Optional `autoDismissMs` (default 6000). User can dismiss earlier.
- Always announce headline + subline via `accessibilityLiveRegion="polite"` on mount; focus moves to headline.

## 5. Celebration triggers — wiring guide

| Event source | Where to import / fire |
|---|---|
| GST file success → `firstGst` | `useGstFilingMutation` onSuccess; check `user.celebrations.firstGstFiredAt` flag |
| ITR refund event (push or polling) → `firstRefund` | Notification handler `tax.refund.credited` |
| Loan APPROVED webhook surfaced → `loanApproved` | `LoanStatusScreen` (already wired in 6C) |
| Loan DISBURSED → `loanDisbursed` | same |
| ITR filed → `firstItr` | `useItrFilingMutation` onSuccess |
| Notice RESPONDED → `firstNoticeResolved` | NoticeDetailScreen onSuccess |
| Onboarding K2 step 15 → `planK2Step15` | Plan engine on step transition |

Server is source of truth for "first" state — client passes the event, server returns "yes/no fire celebration" so we never replay on reinstall.

## 6. Empty / loading / error
- Lottie asset not loaded (network error): falls back to reduced-motion variant; CTA still works.
- Server says "already fired": overlay never mounts; silently routes to next screen.

## 7. i18n keys
For each variant: `celebration.{variant}.headline`, `celebration.{variant}.subline`, `celebration.{variant}.cta.primary`, `celebration.{variant}.cta.secondary`. Length headroom 40% (hi/bn longer).

Plus shared:
- `celebration.dismiss`
- `celebration.share` ("Share with my CA")

## 8. Accessibility
- Focus moves to headline on mount; `aria-live="polite"` for SR.
- Confetti animation `aria-hidden`.
- ESC dismisses; back button dismisses (Android).
- Always preserve user's safe area; never blocks navigation gestures.
- Haptics tied to global haptics-enabled setting.

## 9. Telemetry
- `celebration.shown { variant, reducedMotion }`
- `celebration.dismissed { variant, ms_visible, source: 'cta'|'esc'|'auto' }`
- `celebration.shared { variant }` (when share CTA used)

## 10. Test plan
- [ ] First GST file fires `firstGst` — once. Second filing: no overlay.
- [ ] Reduced-motion respects fallback path.
- [ ] Disabled haptics in Settings → no haptic events on celebration.
- [ ] Reinstall app → celebration does NOT replay (server-guarded).

## 11. Components used / extended
- `CelebrationOverlay` (Phase 6C) — new variants added.
- Lottie assets per variant (one each — see assets.md).
- HapticsTrigger (new abstraction wrapping `Haptics` calls with global gate).
