/**
 * smsRetriever.ts — DG-AUTH-03 Android SMS Retriever OTP auto-read (B1.2).
 *
 * Implements the "Critical Indian UX feature" from auth-onboarding.md Screen 3:
 * on Android the OTP boxes auto-fill from the incoming SMS with NO user action
 * and NO SMS-read permission, surfacing the "OTP auto-detected" banner. iOS is
 * already covered by the keyboard's QuickType bar (textContentType="oneTimeCode"
 * on OTPInput), so this service is an Android-only no-op elsewhere.
 *
 * APPROACH:
 *   Wraps Google's SMS Retriever API via the maintained, zero-permission package
 *   `@pushpendersingh/react-native-otp-verify` (Expo-prebuild supported). The
 *   Retriever API delivers exactly ONE message — the one whose body ends with the
 *   app's 11-char signature hash — for ~5 minutes after the listener starts. No
 *   RECEIVE_SMS/READ_SMS permission is requested. The MSG91 OTP template MUST end
 *   with that app hash (`getAppHash()` below surfaces it for the backend/DLT team).
 *
 * SOFT-FAIL CONTRACT (mirrors deviceIntegrity.ts):
 *   startOtpListener() NEVER throws and NEVER blocks the OTP screen. On iOS/web,
 *   in Expo Go / pre-rebuild dev clients without the native module, on emulators
 *   without Google Play services, or on any runtime error it simply does nothing
 *   and returns a no-op unsubscribe — the user types the OTP manually as today.
 *
 * NATIVE MODULE / REBUILD NOTE:
 *   `@pushpendersingh/react-native-otp-verify` is a native module. It is NOT
 *   present in Expo Go or in dev clients built before this dependency + the
 *   Android config-plugin were added; the lazy require below then fails and we
 *   soft-fail to a no-op (or, in __DEV__, to the dev simulation hook).
 *
 * DEV / TEST SIMULATION:
 *   __testing.simulateMessage('<sms body>') (and the global dev hook installed
 *   below) lets the flow be exercised end-to-end without a real SMS — the same
 *   credential-gated, mock-first pattern the repo uses for device integrity.
 *
 * No OTP value is ever persisted — it is handed straight to the caller's
 * onOtp() callback and lives only in component state.
 */

import { Platform } from 'react-native';

/** Default OTP length parsed out of the SMS body. */
const OTP_LENGTH = 6;

/** Called with the parsed numeric OTP once an SMS is auto-read. */
export type OnOtpDetected = (otp: string) => void;

/** Tear-down handle returned by {@link startOtpListener}. Always safe to call. */
export type StopOtpListener = () => void;

/**
 * Minimal surface of `@pushpendersingh/react-native-otp-verify` that we consume.
 * Lazy-required so Expo Go / pre-rebuild dev clients never crash at import.
 */
interface OtpVerifyModule {
  /** Returns the app's 11-char SMS Retriever signature hash(es). */
  getHash(): Promise<string[]>;
  /** Begins the SMS Retriever broadcast listener. */
  startOtpListener(handler: (message: string | null) => void): void;
  /** Removes the broadcast listener registered by startOtpListener. */
  removeListener(): void;
}

interface RetrieverState {
  devMode: boolean;
  /**
   * Dev/test hook: when set, an active listener forwards simulated SMS bodies
   * here so the auto-read flow can be driven without real telephony.
   */
  devSink: ((message: string) => void) | null;
}

const state: RetrieverState = {
  devMode: typeof __DEV__ !== 'undefined' && __DEV__,
  devSink: null,
};

function isAndroid(): boolean {
  return Platform.OS === 'android';
}

/** Lazy require so Expo Go / pre-rebuild dev clients don't crash at import. */
function loadModule(): OtpVerifyModule | null {
  try {
    // Intentional lazy require: a static import would crash Expo Go /
    // pre-rebuild dev clients at startup (native module not present).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@pushpendersingh/react-native-otp-verify') as
      | OtpVerifyModule
      | { default?: OtpVerifyModule }
      | null;
    if (!mod) return null;
    // Some builds export under `default`.
    const resolved = (mod as { default?: OtpVerifyModule }).default ?? mod;
    return (resolved as OtpVerifyModule) ?? null;
  } catch {
    return null;
  }
}

/**
 * Extracts the first run of {@link OTP_LENGTH} consecutive digits from an SMS
 * body. MSG91 OTP messages look like:
 *   "123456 is your SnapAccount OTP. Valid for 5 min. <#> aB1cD2eF3g"
 * Returns null when no full-length numeric code is present.
 */
export function parseOtp(message: string | null | undefined, length = OTP_LENGTH): string | null {
  if (!message) return null;
  const match = message.match(new RegExp(`\\b(\\d{${length}})\\b`));
  if (match) return match[1];
  // Fallback: first standalone run of exactly `length` digits even without
  // word boundaries (some carriers strip surrounding whitespace).
  const loose = message.match(new RegExp(`(?<!\\d)(\\d{${length}})(?!\\d)`));
  return loose ? loose[1] : null;
}

/**
 * Begin listening for the OTP SMS on Android and invoke {@link onOtp} with the
 * parsed code. No-op (returns a no-op unsubscribe) on iOS/web, in clients
 * without the native module, or on any failure — NEVER throws.
 *
 * In __DEV__ a global hook (`globalThis.__SNAP_SIMULATE_OTP_SMS__`) and the
 * {@link __testing} sink let the flow be simulated without a real SMS.
 */
export function startOtpListener(onOtp: OnOtpDetected, length = OTP_LENGTH): StopOtpListener {
  try {
    let stopped = false;

    const deliver = (message: string | null) => {
      if (stopped) return;
      const otp = parseOtp(message, length);
      if (otp) onOtp(otp);
    };

    // ── Dev / test simulation path ──────────────────────────────────────────
    // Active in __DEV__ regardless of platform so the banner + auto-verify can
    // be exercised on a simulator. Real native delivery (below) still attaches
    // on Android when the module is present.
    if (state.devMode) {
      state.devSink = (message: string) => deliver(message);
      const g = globalThis as { __SNAP_SIMULATE_OTP_SMS__?: (message: string) => void };
      g.__SNAP_SIMULATE_OTP_SMS__ = (message: string) => deliver(message);
    }

    if (!isAndroid()) {
      // iOS QuickType / web — nothing to do beyond the dev hook above.
      return () => {
        stopped = true;
        if (state.devSink) state.devSink = null;
      };
    }

    const mod = loadModule();
    if (!mod) {
      // Expo Go / pre-rebuild client — no native Retriever. Keep the dev hook.
      return () => {
        stopped = true;
        if (state.devSink) state.devSink = null;
      };
    }

    try {
      mod.startOtpListener((message) => deliver(message));
    } catch {
      // Native start failed (no Play services, throttled, etc.) — soft-fail.
      return () => {
        stopped = true;
        if (state.devSink) state.devSink = null;
      };
    }

    return () => {
      stopped = true;
      state.devSink = null;
      try {
        mod.removeListener();
      } catch {
        // Listener already gone / module reloaded — nothing to clean up.
      }
    };
  } catch {
    // Absolute backstop — the OTP screen must mount even if anything above
    // throws unexpectedly.
    return () => {};
  }
}

/**
 * The app's 11-char SMS Retriever signature hash, needed by the MSG91/DLT
 * template (the OTP message body must end with `<#> <hash>`). Returns null on
 * iOS/web, without the native module, or on error — NEVER throws.
 *
 * [credential-gated] The production hash is build-specific (signing key
 * dependent). This is surfaced for the backend/DLT team; the mobile auto-read
 * itself does not require the hash at runtime (the OS matches it).
 */
export async function getAppHash(): Promise<string | null> {
  try {
    if (!isAndroid()) return null;
    const mod = loadModule();
    if (!mod) return null;
    const hashes = await mod.getHash();
    return Array.isArray(hashes) && hashes.length > 0 ? hashes[0] : null;
  } catch {
    return null;
  }
}

/**
 * Test-only hooks. Not for production use.
 * @internal
 */
export const __testing = {
  reset(): void {
    state.devMode = typeof __DEV__ !== 'undefined' && __DEV__;
    state.devSink = null;
    const g = globalThis as { __SNAP_SIMULATE_OTP_SMS__?: unknown };
    delete g.__SNAP_SIMULATE_OTP_SMS__;
  },
  setDevMode(devMode: boolean): void {
    state.devMode = devMode;
  },
  /** Drive the active listener with a simulated SMS body (dev/test only). */
  simulateMessage(message: string): void {
    if (state.devSink) state.devSink(message);
  },
};
