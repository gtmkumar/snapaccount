/**
 * Gateway API base URL + CHAT_HUB_BASE_URL resolution tests.
 *
 * After the 3-composite refactor, all REST + SignalR traffic goes through the
 * YARP gateway (:5000). Routes are /auth/…, /hubs/chat — NOT /api/auth/…
 * (the admin Vite dev server adds/strips /api; mobile hits the gateway directly).
 */

global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
);

interface ExtraConfig {
  apiBaseUrl?: string;
  chatBaseUrl?: string;
}

/** Load src/lib/api fresh under the given platform + app.json extra. */
function loadApiModule(platformOS: 'ios' | 'android', extra: ExtraConfig, env?: Record<string, string>) {
  let mod: { CHAT_HUB_BASE_URL: string; normalizeGatewayBaseUrl: (u: string) => string } | undefined;
  jest.isolateModules(() => {
    const prevEnv = { ...process.env };
    if (env) Object.assign(process.env, env);
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
    process.env = prevEnv;
  });
  if (!mod) throw new Error('failed to load src/lib/api');
  return mod;
}

describe('normalizeGatewayBaseUrl', () => {
  it('strips a trailing /api segment (admin-style URL)', () => {
    const { normalizeGatewayBaseUrl } = loadApiModule('ios', {});
    expect(normalizeGatewayBaseUrl('http://localhost:5000/api')).toBe('http://localhost:5000');
    expect(normalizeGatewayBaseUrl('http://localhost:5000/api/')).toBe('http://localhost:5000');
  });

  it('leaves a bare gateway URL unchanged', () => {
    const { normalizeGatewayBaseUrl } = loadApiModule('ios', {});
    expect(normalizeGatewayBaseUrl('http://localhost:5000')).toBe('http://localhost:5000');
  });
});

describe('CHAT_HUB_BASE_URL (gateway composite)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('uses the same gateway host as apiBaseUrl (hub routed via /hubs/chat)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {
      apiBaseUrl: 'http://localhost:5000',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://localhost:5000');
  });

  it('defaults to localhost:5000 when no extra config is present (iOS)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {});
    expect(CHAT_HUB_BASE_URL).toBe('http://localhost:5000');
  });

  it('prefers EXPO_PUBLIC_API_BASE_URL over app.json extra', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule(
      'ios',
      { apiBaseUrl: 'http://localhost:5000' },
      { EXPO_PUBLIC_API_BASE_URL: 'http://192.168.1.20:5000' },
    );
    expect(CHAT_HUB_BASE_URL).toBe('http://192.168.1.20:5000');
  });

  it('honours the extra.chatBaseUrl override from app.json', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('ios', {
      apiBaseUrl: 'http://localhost:5000',
      chatBaseUrl: 'https://chat.staging.snapaccount.in',
    });
    expect(CHAT_HUB_BASE_URL).toBe('https://chat.staging.snapaccount.in');
  });

  it('rewrites localhost to 10.0.2.2 on Android', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('android', {
      apiBaseUrl: 'http://localhost:5000',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://10.0.2.2:5000');
  });

  it('rewrites localhost to 10.0.2.2 on Android (chatBaseUrl override)', () => {
    const { CHAT_HUB_BASE_URL } = loadApiModule('android', {
      apiBaseUrl: 'http://localhost:5000',
      chatBaseUrl: 'http://localhost:5000',
    });
    expect(CHAT_HUB_BASE_URL).toBe('http://10.0.2.2:5000');
  });
});
