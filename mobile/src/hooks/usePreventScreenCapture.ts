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
 * Usage — call at the top of any screen component that renders sensitive data:
 *
 *   import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
 *
 *   export function ITRDashboardScreen() {
 *     useSensitiveScreen();
 *     // ... rest of the component
 *   }
 */

import { usePreventScreenCapture } from 'expo-screen-capture';

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
  usePreventScreenCapture();
}
