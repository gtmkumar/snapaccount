/**
 * FCM / APNs Push Token Manager
 * Phase 6E — P6E-RISK-01: handles token rotation via addPushTokenListener
 *
 * Responsibilities:
 * - Request permission on app start
 * - Register Expo device token with backend POST /notifications/push-tokens
 * - Re-register on token refresh (addPushTokenListener)
 * - Prevent duplicate POSTs (stores registered token in SecureStore)
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { registerPushToken } from '../api/notifications';
import { addDevice } from '../api/auth';
import { logger } from '../lib/logger';

const REGISTERED_TOKEN_KEY = 'push_token_registered';
const DEVICE_ID_KEY = 'push_device_id';

function getDeviceId(): string {
  // Use Device.modelId or a stable UUID stored in SecureStore
  return `${Platform.OS}-${Device.modelId ?? 'unknown'}-${Device.osBuildId ?? ''}`;
}

/**
 * Stable per-device identifier used for auth device binding (POST /auth/devices,
 * DG-AUTH-01) and for "this device" matching across DevicesScreen /
 * DeviceApprovalScreen — those screens key off the raw `Device.modelId`, so the
 * id registered with auth.user_device MUST equal it for binding to resolve
 * end-to-end. Falls back to the persisted composite push-device id (then a
 * generated one) only when `modelId` is unavailable, so the value is never empty.
 */
export async function getStableDeviceId(): Promise<string> {
  if (Device.modelId) return Device.modelId;
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = getDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/** Backend platform enum expected by AddDeviceCommand (ANDROID | IOS | WEB). */
function authPlatform(): 'ANDROID' | 'IOS' | 'WEB' {
  return Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
}

/** Human-readable device name for the Devices screen (best-effort). */
function deviceDisplayName(): string {
  return (
    Device.deviceName ??
    Device.modelName ??
    Constants.deviceName ??
    `${authPlatform()} device`
  );
}

/** App build version surfaced on the Devices screen (best-effort). */
function appVersion(): string | undefined {
  return (
    Constants.expoConfig?.version ??
    (Constants as { nativeAppVersion?: string }).nativeAppVersion ??
    undefined
  );
}

/**
 * Best-effort read of the FCM/APNs push token already registered with the
 * notifications service, so auth device binding can carry it without forcing a
 * second permission prompt. Returns null on simulators / when permission is not
 * granted — device registration proceeds without it.
 */
async function getFcmTokenIfAvailable(): Promise<string | undefined> {
  try {
    const stored = await SecureStore.getItemAsync(REGISTERED_TOKEN_KEY);
    if (stored) return stored;
    if (!Device.isDevice) return undefined;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return undefined;
    const tokenData = await Notifications.getDevicePushTokenAsync();
    return tokenData.data ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * DG-AUTH-01 (B1.3 Device Binding): register THIS device against the
 * authenticated account via POST /auth/devices, immediately after a session
 * token is set (OTP / password / 2FA login).
 *
 * - Populates auth.user_device (DevicesScreen becomes non-empty).
 * - For a 2nd+ device the backend creates a DeviceApprovalRequest + push
 *   (GAP-047), enabling the approve/deny flow end-to-end.
 *
 * Best-effort: any failure is logged and swallowed — device binding must NEVER
 * block an otherwise-successful login. Returns the created device entity id on
 * success, or null when registration could not be completed.
 */
export async function registerCurrentDevice(): Promise<string | null> {
  try {
    const deviceId = await getStableDeviceId();
    const fcmToken = await getFcmTokenIfAvailable();
    const res = await addDevice({
      deviceId,
      deviceName: deviceDisplayName(),
      platform: authPlatform(),
      osVersion: Device.osVersion ?? undefined,
      appVersion: appVersion(),
      fcmToken,
    });
    return res.deviceEntityId;
  } catch (err) {
    // Non-fatal: the user is already authenticated. Binding can be retried on
    // next launch / from the Devices screen. Never surface to the user.
    logger.warn('device-binding', 'registerCurrentDevice failed', { err });
    return null;
  }
}

/**
 * Request push permission and register token with backend.
 * Safe to call on every app start — deduplicates via SecureStore.
 */
export async function initPushNotifications(): Promise<void> {
  if (!Device.isDevice) {
    // Simulators cannot receive push — skip registration
    console.log('[Push] Running on simulator — skipping push token registration');
    return;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied — skipping token registration');
      return;
    }

    const tokenData = await Notifications.getDevicePushTokenAsync();
    await registerTokenIfNew(tokenData.data);

    // Listen for token rotation (P6E-RISK-01)
    Notifications.addPushTokenListener(async (newToken) => {
      await registerTokenIfNew(newToken.data);
    });

    // Note: subscription is module-level; caller should retain ref if HMR-safe teardown needed
    // For production this is fine — token rotations are rare
    return;
  } catch (err) {
    console.warn('[Push] Failed to initialise push notifications:', err);
  }
}

async function registerTokenIfNew(token: string): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(REGISTERED_TOKEN_KEY);
    if (stored === token) {
      // Token unchanged — no duplicate POST
      return;
    }

    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = getDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }

    await registerPushToken({
      deviceId,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });

    // Store the newly registered token to prevent future duplicates
    await SecureStore.setItemAsync(REGISTERED_TOKEN_KEY, token);
    console.log('[Push] Token registered with backend');
  } catch (err) {
    console.warn('[Push] Token registration failed:', err);
  }
}

/**
 * Configure notification handler for foreground display behaviour.
 * Call once at app root before NavigationContainer renders.
 */
export function configureForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}
