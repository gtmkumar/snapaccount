/**
 * useScreenReaderEnabled — live VoiceOver / TalkBack state.
 *
 * A11Y KFS-1 / CON-1 (docs/design/accessibility-standard.md §2.1/§2.2):
 * the legally-required scroll-gates on KFS and Loan Consent can never be
 * satisfied by a screen-reader user who navigates element-by-element,
 * because focus traversal does not fire onScroll. Screens use this hook to
 * offer an explicit, focusable "I have reviewed the full document"
 * affordance that satisfies the same gate (same ack record is written).
 *
 * Subscribes to `screenReaderChanged` so mid-session toggles are honoured.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => {
        /* default: visual scroll gate only */
      });

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (value: boolean) => {
        if (mounted) setEnabled(value);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
