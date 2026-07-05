/**
 * usePreventScreenCapture.ts
 * SEC-015 — Screenshot Prevention on Sensitive Screens
 *
 * Prevents OS-level screenshots and screen recordings on screens that display
 * sensitive financial data (ITR, GST filings, loan applications, bank details).
 *
 * On Android this sets FLAG_SECURE on the Activity window, which:
 *   - Blocks screenshots via the system screenshot gesture / button combo
 *   - Prevents the screen from appearing in the Recents (app switcher) thumbnail
 *   - Blocks screen recording tools
 *
 * On iOS this uses the native secure text field overlay mechanism to prevent
 * screenshots appearing in the Camera Roll and screen recordings via ReplayKit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND-LIVE-01 — why this is gated to production builds
 * ─────────────────────────────────────────────────────────────────────────────
 * FLAG_SECURE is not honoured by the Android emulator's software/host GPU
 * compositor: a secure window composites to the framebuffer as a fully BLACK
 * surface even though the view hierarchy stays laid out and interactive. Because
 * FLAG_SECURE is a *window* flag (not per-view), the first sensitive screen that
 * mounts blacks out the entire app window for the rest of the process — it does
 * not recover on navigation/BACK, only on an app restart. On a real device the
 * flag behaves correctly (the live screen renders; only screenshots/recordings
 * are captured as black), so this is an emulator/QA artifact, not a release bug.
 *
 * We therefore only activate capture prevention in production builds. Dev/QA
 * builds (`__DEV__`) render normally so the emulator and automated Appium sweeps
 * can see these screens; the shipped app still protects real user data.
 *
 * Usage — call at the top of any screen component that renders sensitive data:
 *
 *   import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
 *
 *   export function ITRDashboardScreen() {
 *     useSensitiveScreen();
 *     // ... rest of the component
 *   }
 */

import { useEffect, useRef } from 'react';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';

/**
 * Whether OS-level screenshot prevention should be active. Disabled in dev/QA
 * builds so the Android emulator does not black out (see AND-LIVE-01 note above);
 * enabled in production release builds where FLAG_SECURE behaves correctly
 * on-device. Evaluated at effect time (not module load) so it always reflects the
 * current build flag.
 */
function screenCaptureProtectionEnabled(): boolean {
  return !(typeof __DEV__ !== 'undefined' && __DEV__);
}

// Monotonic counter so each mounted sensitive screen gets a unique key. This
// preserves expo-screen-capture's internal ref-counting: protection is only
// lifted once the *last* sensitive screen unmounts, never when one of several
// stacked sensitive screens goes away.
let sensitiveScreenSeq = 0;

/**
 * Hook that activates OS-level screenshot prevention for the lifetime of the
 * component that calls it.  Protection is automatically removed when the
 * component unmounts (e.g. when the user navigates away from the screen).
 *
 * Call this hook unconditionally at the top level of every screen that shows:
 *   - ITR tax computation details, refund amounts, or regime comparison
 *   - GST return data (GSTIN, ITC, output tax, net payable)
 *   - Loan application details, offer amounts, or bank account numbers
 *   - Financial summary / balance sheet data
 */
export function useSensitiveScreen(): void {
  const keyRef = useRef<string | null>(null);
  if (keyRef.current === null) {
    keyRef.current = `sensitive-screen-${sensitiveScreenSeq++}`;
  }

  useEffect(() => {
    if (!screenCaptureProtectionEnabled()) return undefined;
    const key = keyRef.current!;
    // Best-effort — a failure to enable protection must never crash the screen.
    void preventScreenCaptureAsync(key).catch(() => undefined);
    return () => {
      void allowScreenCaptureAsync(key).catch(() => undefined);
    };
  }, []);
}
