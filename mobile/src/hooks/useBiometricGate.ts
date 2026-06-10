/**
 * useBiometricGate — reusable biometric / device-PIN step-up hook.
 *
 * M4 (GAP-063): Wraps expo-local-authentication with:
 *   1. hasHardwareAsync + isEnrolledAsync capability check.
 *   2. authenticateAsync with device-PIN fallback (disableDeviceFallback: false).
 *   3. Alert-based confirm fallback when no biometric hardware/enrollment
 *      is available (covers Expo Go simulator path).
 *
 * Usage:
 *   const { trigger } = useBiometricGate();
 *   const ok = await trigger();   // resolves true = proceed, false = cancel
 *
 * NOTE: Real-device biometric verification deferred until M1 EAS builds exist.
 * The Alert-fallback path satisfies the functional gate in the meantime.
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';

export interface UseBiometricGateOptions {
  promptMessage?: string;
}

export interface UseBiometricGateReturn {
  /** Triggers the biometric gate. Resolves true if authenticated/confirmed, false if cancelled. */
  trigger: (opts?: UseBiometricGateOptions) => Promise<boolean>;
}

export function useBiometricGate(): UseBiometricGateReturn {
  const { t } = useTranslation();

  const trigger = useCallback(
    async (opts?: UseBiometricGateOptions): Promise<boolean> => {
      const prompt = opts?.promptMessage ?? t('mobile.biometric.prompt');

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

  return { trigger };
}
