/**
 * deviceIntegrity service tests — GAP-064 device integrity attestation.
 *
 * Soft-fail contract under test:
 *   - getIntegrityToken() NEVER throws and resolves null on emulators /
 *     missing native module / unsupported devices / any runtime error.
 *   - __DEV__ builds return the literal 'mock-dev-token' so the backend
 *     MockVerifier path can be exercised end-to-end.
 *   - Successful tokens are cached in memory (no SecureStore/AsyncStorage).
 *
 * @expo/app-integrity is moduleNameMapped to src/__mocks__/expoAppIntegrity.ts.
 */

// react-native mocked minimally: the service only reads Platform.OS.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  getIntegrityToken,
  DEV_MOCK_TOKEN,
  __testing,
} from '../../src/services/deviceIntegrity';

/* eslint-disable @typescript-eslint/no-var-requires */
const { Platform } = require('react-native') as { Platform: { OS: string } };
const AppIntegrity = require('@expo/app-integrity');
const Constants = require('expo-constants').default as {
  expoConfig: { extra: Record<string, unknown> };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const CLOUD_PROJECT_NUMBER = '754356628614';

function setAndroid(withCloudProject = true) {
  Platform.OS = 'android';
  if (withCloudProject) {
    Constants.expoConfig.extra.integrityCloudProjectNumber = CLOUD_PROJECT_NUMBER;
  } else {
    delete Constants.expoConfig.extra.integrityCloudProjectNumber;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  __testing.reset();
  __testing.setDevMode(false);
  Platform.OS = 'ios';
  AppIntegrity.isSupported = true;
  delete Constants.expoConfig.extra.integrityCloudProjectNumber;
  // Restore default mock behaviours cleared by clearAllMocks().
  AppIntegrity.generateKeyAsync.mockResolvedValue('mock-key-id');
  AppIntegrity.attestKeyAsync.mockResolvedValue('mock-ios-attestation');
  AppIntegrity.prepareIntegrityTokenProviderAsync.mockResolvedValue(undefined);
  AppIntegrity.requestIntegrityCheckAsync.mockResolvedValue('mock-android-verdict');
});

// ── Dev mock (__DEV__) ──────────────────────────────────────────────────────

describe('dev mock mode', () => {
  it('returns mock-dev-token with IOS platform on iOS', async () => {
    __testing.setDevMode(true);
    await expect(getIntegrityToken()).resolves.toEqual({
      token: DEV_MOCK_TOKEN,
      platform: 'IOS',
    });
    // No native attestation calls in dev mode.
    expect(AppIntegrity.generateKeyAsync).not.toHaveBeenCalled();
    expect(AppIntegrity.requestIntegrityCheckAsync).not.toHaveBeenCalled();
  });

  it('returns mock-dev-token with ANDROID platform on Android', async () => {
    __testing.setDevMode(true);
    Platform.OS = 'android';
    await expect(getIntegrityToken()).resolves.toEqual({
      token: DEV_MOCK_TOKEN,
      platform: 'ANDROID',
    });
  });

  it('returns null on web even in dev mode', async () => {
    __testing.setDevMode(true);
    Platform.OS = 'web';
    await expect(getIntegrityToken()).resolves.toBeNull();
  });
});

// ── Null / soft-fail paths ──────────────────────────────────────────────────

describe('soft-fail null paths (production mode)', () => {
  it('returns null on unsupported platforms (web)', async () => {
    Platform.OS = 'web';
    await expect(getIntegrityToken()).resolves.toBeNull();
  });

  it('returns null when iOS App Attest is unsupported (simulator)', async () => {
    AppIntegrity.isSupported = false;
    await expect(getIntegrityToken()).resolves.toBeNull();
    expect(AppIntegrity.attestKeyAsync).not.toHaveBeenCalled();
    expect(__testing.isUnavailable()).toBe(true);
  });

  it('returns null (never throws) when the native call rejects', async () => {
    AppIntegrity.generateKeyAsync.mockRejectedValue(new Error('DCError 2'));
    await expect(getIntegrityToken()).resolves.toBeNull();
  });

  it('failure is sticky for the session — no repeated native attempts', async () => {
    AppIntegrity.generateKeyAsync.mockRejectedValue(new Error('DCError 2'));
    await getIntegrityToken();
    await getIntegrityToken();
    expect(AppIntegrity.generateKeyAsync).toHaveBeenCalledTimes(1);
    expect(__testing.isUnavailable()).toBe(true);
  });

  it('returns null on Android when no cloud project number is configured', async () => {
    setAndroid(false);
    await expect(getIntegrityToken()).resolves.toBeNull();
    expect(AppIntegrity.prepareIntegrityTokenProviderAsync).not.toHaveBeenCalled();
  });

  it('returns null when Play Integrity rejects (emulator / no Play services)', async () => {
    setAndroid();
    AppIntegrity.prepareIntegrityTokenProviderAsync.mockRejectedValue(
      new Error('PLAY_SERVICES_NOT_FOUND'),
    );
    await expect(getIntegrityToken()).resolves.toBeNull();
  });
});

// ── Happy paths ─────────────────────────────────────────────────────────────

describe('successful attestation', () => {
  it('iOS: returns the App Attest attestation as the token', async () => {
    await expect(getIntegrityToken()).resolves.toEqual({
      token: 'mock-ios-attestation',
      platform: 'IOS',
    });
    expect(AppIntegrity.generateKeyAsync).toHaveBeenCalledTimes(1);
    expect(AppIntegrity.attestKeyAsync).toHaveBeenCalledWith(
      'mock-key-id',
      expect.any(String),
    );
  });

  it('Android: prepares the provider with the configured project number and returns the verdict', async () => {
    setAndroid();
    await expect(getIntegrityToken()).resolves.toEqual({
      token: 'mock-android-verdict',
      platform: 'ANDROID',
    });
    expect(AppIntegrity.prepareIntegrityTokenProviderAsync).toHaveBeenCalledWith(
      CLOUD_PROJECT_NUMBER,
    );
    expect(AppIntegrity.requestIntegrityCheckAsync).toHaveBeenCalledWith(
      expect.any(String),
    );
  });
});

// ── Caching ─────────────────────────────────────────────────────────────────

describe('in-memory caching', () => {
  it('reuses a fresh token without re-hitting the native API', async () => {
    setAndroid();
    const first = await getIntegrityToken();
    const second = await getIntegrityToken();
    expect(second).toEqual(first);
    expect(AppIntegrity.requestIntegrityCheckAsync).toHaveBeenCalledTimes(1);
    expect(AppIntegrity.prepareIntegrityTokenProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the cache TTL expires', async () => {
    setAndroid();
    const realNow = Date.now;
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(1_000_000);
      await getIntegrityToken();
      // Jump past the 5-minute TTL.
      nowSpy.mockReturnValue(1_000_000 + 6 * 60_000);
      await getIntegrityToken();
      expect(AppIntegrity.requestIntegrityCheckAsync).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
      Date.now = realNow;
    }
  });

  it('dedupes concurrent calls into a single native fetch', async () => {
    setAndroid();
    let resolveVerdict: (v: string) => void = () => {};
    AppIntegrity.requestIntegrityCheckAsync.mockImplementation(
      () => new Promise<string>((resolve) => { resolveVerdict = resolve; }),
    );

    const p1 = getIntegrityToken();
    const p2 = getIntegrityToken();
    // Flush microtasks until the (single) native fetch is reached, then resolve.
    while (AppIntegrity.requestIntegrityCheckAsync.mock.calls.length === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    resolveVerdict('mock-android-verdict');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ token: 'mock-android-verdict', platform: 'ANDROID' });
    expect(r2).toEqual(r1);
    expect(AppIntegrity.requestIntegrityCheckAsync).toHaveBeenCalledTimes(1);
  });
});
