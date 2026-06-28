/**
 * useBiometricGate — reusable biometric / device-PIN step-up hook.
 *
 * M4 (GAP-063): Wraps expo-local-authentication with:
 *   1. hasHardwareAsync + isEnrolledAsync capability check.
 *   2. authenticateAsync with device-PIN fallback (disableDeviceFallback: false).
 *   3. Alert-based confirm fallback when no biometric hardware/enrollment
 *      is available (covers Expo Go simulator path).
 *
 * DG-MOBUX-07 (network-aware-ux.md §6.1): adds
 *   4. A per-flow-key GRACE WINDOW. After a successful unlock, the same flow key
 *      is not re-prompted within the configured window (Settings → Security →
 *      5min | 1min | never). Prevents re-auth thrashing across consecutive
 *      sensitive actions in one session.
 *   5. STRUCTURED REFUSAL: the first cancellation surfaces a "confirmation
 *      needed" Alert with Try-again / Cancel; only the SECOND refusal cancels
 *      the action (and the caller can navigate back). Honest about why.
 *
 * Usage:
 *   const { trigger } = useBiometricGate();
 *   const ok = await trigger({ flowKey: 'loan.submit' });
 *   // ok === true  → proceed
 *   // ok === false → user declined twice (caller may navigate back)
 *
 * NOTE: Real-device biometric verification deferred until EAS builds exist.
 * The Alert-fallback path satisfies the functional gate in the meantime.
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import {
  loadSettings,
  GRACE_WINDOW_MS,
} from '../lib/appSettings';

/**
 * Module-level grace ledger: flowKey → last successful unlock epoch-ms.
 * Module scope (not per-hook) so the grace persists across screen unmounts
 * within the same app session. Cleared on cold start (acceptable — re-auth on
 * a fresh launch is the safer default).
 */
const lastUnlock: Record<string, number> = {};

export interface UseBiometricGateOptions {
  promptMessage?: string;
  /**
   * Stable identifier for the flow being gated (e.g. 'loan.submit',
   * 'subscription.upgrade'). Drives the grace window — a recent success on the
   * SAME key skips the prompt. Omit to always prompt (no grace).
   */
  flowKey?: string;
  /**
   * When true, ignore any active grace window and force a fresh prompt
   * (e.g. revealing a secret should always re-verify).
   */
  forcePrompt?: boolean;
}

export interface UseBiometricGateReturn {
  /** Triggers the biometric gate. Resolves true if authenticated/confirmed, false if cancelled. */
  trigger: (opts?: UseBiometricGateOptions) => Promise<boolean>;
  /** Test/util: clears the in-memory grace ledger. */
  resetGrace: () => void;
}

/** Test-only: clear the module grace ledger. */
export function __resetBiometricGraceForTests(): void {
  for (const k of Object.keys(lastUnlock)) delete lastUnlock[k];
}

export function useBiometricGate(): UseBiometricGateReturn {
  const { t } = useTranslation();

  const runAuthentication = useCallback(
    async (prompt: string): Promise<boolean> => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = hasHardware
        ? await LocalAuthentication.isEnrolledAsync()
        : false;

      if (!hasHardware || !isEnrolled) {
        // No biometric hardware or no enrolled biometrics (e.g., Expo Go simulator).
        // Fall back to Alert-confirm so the flow isn't completely blocked.
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            t('mobile.biometric.fallback.title'),
            t('mobile.biometric.fallback.body'),
            [
              {
                text: t('mobile.biometric.fallback.cancel'),
                style: 'cancel',
                onPress: () => resolve(false),
              },
              {
                text: t('mobile.biometric.fallback.confirm'),
                onPress: () => resolve(true),
              },
            ],
            { cancelable: false },
          );
        });
      }

      // Real biometric (Touch ID / Face ID) with device-PIN fallback.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: prompt,
        fallbackLabel: t('common.usePin'),
        disableDeviceFallback: false,
        cancelLabel: t('mobile.biometric.fallback.cancel'),
      });

      return result.success;
    },
    [t],
  );

  /** Second-chance refusal Alert. Resolves true → retry, false → give up. */
  const askRetry = useCallback(
    (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          t('mobile.biometric.refusal.title'),
          t('mobile.biometric.refusal.body'),
          [
            {
              text: t('mobile.biometric.refusal.cancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: t('mobile.biometric.refusal.retry'),
              onPress: () => resolve(true),
            },
          ],
          { cancelable: false },
        );
      }),
    [t],
  );

  const trigger = useCallback(
    async (opts?: UseBiometricGateOptions): Promise<boolean> => {
      const prompt = opts?.promptMessage ?? t('mobile.biometric.prompt');
      const settings = await loadSettings();

      // Security setting: gate disabled entirely → pass through.
      if (!settings.requireBiometricSensitive) {
        return true;
      }

      const flowKey = opts?.flowKey;
      const graceMs = GRACE_WINDOW_MS[settings.biometricGraceWindow];

      // ── Grace window: skip prompt if this flow unlocked recently ──────────────
      if (!opts?.forcePrompt && flowKey && graceMs > 0) {
        const last = lastUnlock[flowKey];
        if (last !== undefined && Date.now() - last < graceMs) {
          return true;
        }
      }

      // ── Structured refusal: first cancel → retry Alert; second cancel → fail ──
      const ok = await runAuthentication(prompt);
      if (ok) {
        if (flowKey) lastUnlock[flowKey] = Date.now();
        return true;
      }

      // First refusal — offer a single retry.
      const wantsRetry = await askRetry();
      if (!wantsRetry) {
        return false; // second refusal = cancel
      }

      const okRetry = await runAuthentication(prompt);
      if (okRetry && flowKey) lastUnlock[flowKey] = Date.now();
      return okRetry;
    },
    [t, runAuthentication, askRetry],
  );

  const resetGrace = useCallback(() => {
    for (const k of Object.keys(lastUnlock)) delete lastUnlock[k];
  }, []);

  return { trigger, resetGrace };
}
