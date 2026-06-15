/**
 * deviceIntegrity.ts — GAP-064 device integrity attestation (mobile half).
 *
 * Produces the value for the `X-Device-Integrity` / `X-Device-Integrity-Platform`
 * request headers (orchestrator-pinned Wave 8 contract):
 *   - Android: Google Play Integrity verdict token (via @expo/app-integrity).
 *   - iOS:     Apple App Attest attestation object (via @expo/app-integrity).
 *
 * SOFT-FAIL CONTRACT (critical):
 *   getIntegrityToken() NEVER throws and NEVER blocks UX on attestation
 *   problems. On emulators, dev builds without the native module, unsupported
 *   devices, or any runtime error it resolves to `null` — callers then simply
 *   send NO integrity headers and backend telemetry records the absence.
 *
 * NATIVE MODULE / REBUILD NOTE:
 *   @expo/app-integrity is a native Expo module. It is NOT present in Expo Go
 *   or in dev clients built before this dependency was added — a new
 *   `expo run:android` / `expo run:ios` (or EAS) build is required before real
 *   attestation activates. Until then the lazy require below fails and we
 *   soft-fail to null (or the __DEV__ mock), which is exactly the intended
 *   behaviour.
 *
 * DEV MOCK:
 *   In __DEV__ builds we return the literal token 'mock-dev-token' so the
 *   backend MockVerifier path can be exercised end-to-end without Play/Apple
 *   infrastructure.
 *
 * Tokens are transient and held in memory only (short TTL cache) — never
 * persisted to SecureStore/AsyncStorage.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';

export type IntegrityPlatform = 'ANDROID' | 'IOS';

export interface DeviceIntegrityResult {
  /** Attestation token to send as `X-Device-Integrity`. */
  token: string;
  /** Value for `X-Device-Integrity-Platform`. */
  platform: IntegrityPlatform;
}

/** Literal token understood by the backend MockVerifier in dev/test. */
export const DEV_MOCK_TOKEN = 'mock-dev-token';

/**
 * How long a fetched attestation token is reused before a fresh one is
 * requested. Both Play Integrity and App Attest calls are expensive
 * (network + native crypto), and our 4 protected call sites can fire in
 * quick succession (OTP send → verify).
 * Decision (W8): 5-min TTL ACCEPTED — backend MockVerifier imposes no
 * freshness window (real verifiers are NotConfigured stubs); revisit only if
 * a real verifier enforces a stricter max token age.
 */
const CACHE_TTL_MS = 5 * 60_000;

// Minimal surface of @expo/app-integrity that we consume (lazy-required).
interface AppIntegrityModule {
  isSupported: boolean;
  generateKeyAsync(): Promise<string>;
  attestKeyAsync(keyId: string, challenge: string): Promise<string>;
  prepareIntegrityTokenProviderAsync(cloudProjectNumber: string): Promise<void>;
  requestIntegrityCheckAsync(requestHash: string): Promise<string>;
}

interface IntegrityState {
  devMode: boolean;
  cached: { result: DeviceIntegrityResult; expiresAt: number } | null;
  inFlight: Promise<DeviceIntegrityResult | null> | null;
  /**
   * Sticky per-session "give up" flag. Once attestation is known to be
   * unavailable (module missing, unsupported device, provider error) we stop
   * retrying so the protected auth/loan calls never pay attestation latency
   * again this session. Soft-fail world: absence is handled by backend
   * telemetry, so giving up is the UX-safe choice.
   */
  unavailable: boolean;
  /** Android: Play Integrity token provider prepared once per session. */
  androidProviderReady: boolean;
}

const state: IntegrityState = {
  devMode: typeof __DEV__ !== 'undefined' && __DEV__,
  cached: null,
  inFlight: null,
  unavailable: false,
  androidProviderReady: false,
};

function currentPlatform(): IntegrityPlatform | null {
  if (Platform.OS === 'android') return 'ANDROID';
  if (Platform.OS === 'ios') return 'IOS';
  return null; // web / out-of-scope platforms never attest
}

/** Lazy require so Expo Go / pre-rebuild dev clients don't crash at import. */
function loadModule(): AppIntegrityModule | null {
  try {
    // Intentional lazy require: a static import would crash Expo Go /
    // pre-rebuild dev clients at startup (native module not present).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@expo/app-integrity') as AppIntegrityModule;
    return mod ?? null;
  } catch {
    return null;
  }
}

async function fetchAndroidToken(mod: AppIntegrityModule): Promise<DeviceIntegrityResult | null> {
  // Google Cloud project NUMBER for Play Integrity, surfaced via app config.
  // Empty/missing → attestation not configured for this build → soft-fail.
  // [deferred: real-provider wiring] value stays "" until TL provides the
  // production GCP project number (Play Integrity credential-gated).
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const cloudProjectNumber = extra.integrityCloudProjectNumber;
  if (typeof cloudProjectNumber !== 'string' || cloudProjectNumber.length === 0) {
    return null;
  }

  if (!state.androidProviderReady) {
    await mod.prepareIntegrityTokenProviderAsync(cloudProjectNumber);
    state.androidProviderReady = true;
  }

  // [deferred: real-provider wiring] server challenge endpoint for replay
  // binding is deferred until real Play Integrity is wired (TL
  // credential-gated); until then bind the verdict to a client-side nonce.
  const requestHash = Crypto.randomUUID().replace(/-/g, '');
  const token = await mod.requestIntegrityCheckAsync(requestHash);
  return token ? { token, platform: 'ANDROID' } : null;
}

async function fetchIosToken(mod: AppIntegrityModule): Promise<DeviceIntegrityResult | null> {
  if (!mod.isSupported) return null; // e.g. simulators don't provide App Attest

  // [deferred: real-provider wiring] assert-per-request flow (attest once,
  // then generateAssertionAsync with server challenges) needs a server
  // challenge endpoint — deferred until real App Attest verification is wired
  // (TL credential-gated); until then send the one-shot key attestation
  // (fresh key + local random challenge) as the token.
  const challenge = Crypto.randomUUID();
  const keyId = await mod.generateKeyAsync();
  const token = await mod.attestKeyAsync(keyId, challenge);
  return token ? { token, platform: 'IOS' } : null;
}

async function fetchToken(): Promise<DeviceIntegrityResult | null> {
  const platform = currentPlatform();
  if (!platform) {
    state.unavailable = true;
    return null;
  }

  const mod = loadModule();
  if (!mod) {
    state.unavailable = true; // native module absent (Expo Go / pre-rebuild client)
    return null;
  }

  try {
    const result =
      platform === 'ANDROID' ? await fetchAndroidToken(mod) : await fetchIosToken(mod);
    if (!result) {
      state.unavailable = true;
      return null;
    }
    state.cached = { result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch {
    // Emulator, missing Play services, throttling, native error — give up for
    // this session. NEVER propagate: protected calls must proceed headerless.
    state.unavailable = true;
    return null;
  }
}

/**
 * Get a device integrity attestation token for the current platform.
 *
 * Resolution order:
 *   1. __DEV__ builds → `{ token: 'mock-dev-token', platform }` (backend
 *      MockVerifier path), no native call.
 *   2. Known-unavailable session → null immediately.
 *   3. Valid in-memory cached token → cached value.
 *   4. Otherwise fetch from Play Integrity / App Attest (deduped if a fetch
 *      is already in flight).
 *
 * NEVER throws; resolves to null on any failure.
 */
export async function getIntegrityToken(): Promise<DeviceIntegrityResult | null> {
  try {
    const platform = currentPlatform();

    if (state.devMode) {
      return platform ? { token: DEV_MOCK_TOKEN, platform } : null;
    }

    if (state.unavailable) return null;

    if (state.cached && state.cached.expiresAt > Date.now()) {
      return state.cached.result;
    }

    if (state.inFlight) return state.inFlight;

    state.inFlight = fetchToken().finally(() => {
      state.inFlight = null;
    });
    return await state.inFlight;
  } catch {
    return null; // absolute backstop — soft-fail contract
  }
}

/**
 * Test-only hooks. Not for production use.
 * @internal
 */
export const __testing = {
  reset(): void {
    state.devMode = typeof __DEV__ !== 'undefined' && __DEV__;
    state.cached = null;
    state.inFlight = null;
    state.unavailable = false;
    state.androidProviderReady = false;
  },
  setDevMode(devMode: boolean): void {
    state.devMode = devMode;
  },
  isUnavailable(): boolean {
    return state.unavailable;
  },
};
