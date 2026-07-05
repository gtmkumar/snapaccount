/**
 * App version policy client — GAP-116 mobile force-update / minimum-supported-version gate.
 * Base path: /app (anonymous; routed through the gateway — see src/lib/api.ts).
 *
 * Called once at launch (before auth) so the app can hard-block builds below the supported
 * floor (e.g. after a TLS-pin rotation) or soft-nudge when a newer build exists.
 *
 * Fail-open contract: any network/parse error MUST be treated by callers as "no policy"
 * (render the app normally). A version check can never be allowed to brick the app.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiClient } from '../lib/api';

export interface AppVersionPolicy {
  platform: string;
  minimumSupportedVersion: string;
  latestVersion: string;
  storeUrl: string;
  updateRequired: boolean;
  updateAvailable: boolean;
}

/** The current app version as declared in app.json (`expo.version`). */
export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/** The platform key the backend expects ("ios" | "android"; web → "ios" defaults, never blocks). */
export function getPlatformKey(): 'ios' | 'android' {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

/**
 * GET /app/min-version?platform={ios|android}&version={x.y.z}
 *
 * Resolves to the server-computed policy, or `null` on any failure (fail-open).
 */
export async function getAppVersionPolicy(): Promise<AppVersionPolicy | null> {
  try {
    const res = await apiClient.get<AppVersionPolicy>('/app/min-version', {
      params: {
        platform: getPlatformKey(),
        version: getCurrentAppVersion(),
      },
      // Don't let a slow gateway stall the launch screen; fail-open on timeout.
      timeout: 6000,
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}
