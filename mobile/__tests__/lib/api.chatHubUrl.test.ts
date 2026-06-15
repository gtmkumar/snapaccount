/**
 * BUG-W7-IOS-001 — CHAT_HUB_BASE_URL resolution tests.
 *
 * The SignalR chat hub lives on ChatService (/hubs/chat on :5107), NOT on the
 * AuthService host that extra.apiBaseUrl points at (:5101 — negotiate 404s
 * there). These tests pin lib/api's CHAT_HUB_BASE_URL:
 *   1. default: HOST_ROOT (from apiBaseUrl) + the pinned chat port 5107 —
 *      never the apiBaseUrl port itself;
 *   2. extra.chatBaseUrl override wins (same pattern as documentsBaseUrl);
 *   3. Android: localhost is rewritten to the emulator loopback 10.0.2.2,
 *      for both the derived URL and the override.
 *
 * Each case loads src/lib/api fresh with its own expo-constants /
 * react-native mocks (module-level constant), same isolation pattern as
 * api.integrityHeader.test.ts.
 */

// Block the axios fetch-adapter crash in jest (see api.interceptor.test.ts).
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
);

interface ExtraConfig {
  apiBaseUrl?: string;
  chatBaseUrl?: string;
}

/** Load src/lib/api fresh under the given platform + app.json extra. */
function loadApiModule(platformOS: 'ios' | 'android', extra: ExtraConfig) {
  let mod: { CHAT_HUB_BASE_URL: string } | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra } },
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: platformOS },
    }));
    jest.doMock('../../src/services/deviceIntegrity', () => ({
      getIntegrityToken: jest.fn(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/lib/api');
  });
  if (!mod) throw new Error('failed to load src/lib/api');
  return mod;
}

describe('CHAT_HUB_BASE_URL (BUG-W7-IOS-001)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('targets ChatService :5107, never the apiBaseUrl (AuthService :5101) host:port', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {
      apiBaseUrl: 'http://localhost:5101',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://localhost:5107');
    expect(CHAT_HUB_BASE_URL).not.toBe('http://localhost:5101');
  });

  it('defaults to localhost:5107 when no extra config is present (iOS)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {});
    expect(CHAT_HUB_BASE_URL).toBe('http://localhost:5107');
  });

  it('derives the chat port from a custom apiBaseUrl host (gateway-style host reuse)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {
      apiBaseUrl: 'http://192.168.1.20:5101',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://192.168.1.20:5107');
  });

  it('honours the extra.chatBaseUrl override from app.json', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {
      apiBaseUrl: 'http://localhost:5101',
      chatBaseUrl: 'https://chat.staging.snapaccount.in',
    });
    expect(CHAT_HUB_BASE_URL).toBe('https://chat.staging.snapaccount.in');
  });

  it('rewrites localhost to 10.0.2.2 on Android (derived URL)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('android', {
      apiBaseUrl: 'http://localhost:5101',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://10.0.2.2:5107');
  });

  it('rewrites localhost to 10.0.2.2 on Android (chatBaseUrl override)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('android', {
      apiBaseUrl: 'http://localhost:5101',
      chatBaseUrl: 'http://localhost:5107',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://10.0.2.2:5107');
  });
});
