/**
 * useHaptics — centralised haptic feedback hook with global enable/disable gate.
 * Phase 6F · Track F4 · docs/design/mobile/ux/haptics-and-celebrations.md §3
 *
 * All haptic calls are gated by AsyncStorage preference (default: enabled).
 * Reduced-motion: haptics still fire (motion-reduction doesn't affect haptics
 * per spec), but celebration burst sequence is shortened when reduceMotion=true.
 *
 * Wire into key flows:
 *   - GST submit success / error
 *   - ITR approve success / warning / error
 *   - Loan submit success / error
 *   - Callback request submit
 *   - Document capture shutter
 *   - ChatList swipe threshold + action success
 *   - ChatDetail message send success / error
 *   - Pull-to-refresh release
 *   - Chip / tab selection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAPTICS_PREF_KEY = '@snapaccount/haptics_enabled';

let _cachedEnabled: boolean | null = null;

async function loadHapticsEnabled(): Promise<boolean> {
  if (_cachedEnabled !== null) return _cachedEnabled;
  try {
    const raw = await AsyncStorage.getItem(HAPTICS_PREF_KEY);
    _cachedEnabled = raw !== 'false'; // default enabled
    return _cachedEnabled;
  } catch {
    return true;
  }
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  _cachedEnabled = enabled;
  try {
    await AsyncStorage.setItem(HAPTICS_PREF_KEY, String(enabled));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseHapticsResult {
  /** Form submit success, save, message sent, GST filed, ITR approved, loan approved */
  success: () => void;
  /** Validation warning, near-deadline alert */
  warning: () => void;
  /** API error, biometric fail, submit failure */
  error: () => void;
  /** Chip selection, tab switch, list toggle, swipe threshold */
  lightTap: () => void;
  /** Long-press action sheet reveal, drag handle, camera shutter */
  mediumTap: () => void;
  /** Celebration burst: Success + 2x Light 60ms apart */
  celebrationBurst: (skipSequence?: boolean) => void;
  /** Whether haptics are currently enabled */
  enabled: boolean;
}

export function useHaptics(): UseHapticsResult {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);

  useEffect(() => {
    loadHapticsEnabled().then((val) => {
      setEnabled(val);
      enabledRef.current = val;
    });
  }, []);

  const guard = useCallback(
    (fn: () => void) => {
      if (enabledRef.current) {
        try {
          fn();
        } catch {
          // Haptics not supported on device/simulator — degrade silently
        }
      }
    },
    [],
  );

  const success = useCallback(() => {
    guard(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    });
  }, [guard]);

  const warning = useCallback(() => {
    guard(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    });
  }, [guard]);

  const error = useCallback(() => {
    guard(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    });
  }, [guard]);

  const lightTap = useCallback(() => {
    guard(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    });
  }, [guard]);

  const mediumTap = useCallback(() => {
    guard(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    });
  }, [guard]);

  /**
   * Celebration burst per spec §3:
   * 1. notificationAsync(Success)
   * 2. After 120ms: two impactAsync(Light) 60ms apart
   *
   * skipSequence=true: only fire initial Success (reduced-motion path).
   */
  const celebrationBurst = useCallback(
    (skipSequence = false) => {
      guard(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (!skipSequence) {
          setTimeout(() => {
            guard(() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTimeout(() => {
                guard(() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                });
              }, 60);
            });
          }, 120);
        }
      });
    },
    [guard],
  );

  return { success, warning, error, lightTap, mediumTap, celebrationBurst, enabled };
}
