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
import { registerPushToken } from '../api/notifications';

const REGISTERED_TOKEN_KEY = 'push_token_registered';
const DEVICE_ID_KEY = 'push_device_id';

function getDeviceId(): string {
  // Use Device.modelId or a stable UUID stored in SecureStore
  return `${Platform.OS}-${Device.modelId ?? 'unknown'}-${Device.osBuildId ?? ''}`;
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
    const sub = Notifications.addPushTokenListener(async (newToken) => {
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
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}
