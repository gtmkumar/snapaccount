/**
 * Axios API client with Firebase Auth token injection and refresh-token rotation.
 *
 * 401 handling (SEC-025):
 *   1. If the failed request is for /auth/token/refresh itself → signOut (avoid loops).
 *   2. If the request has already been retried (_retry flag) → signOut.
 *   3. If a refreshToken exists → call POST /auth/token/refresh; on success rotate
 *      tokens in the store and retry the original request ONCE with the new Bearer.
 *   4. On any refresh failure → signOut.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';
import { getIntegrityToken } from '../services/deviceIntegrity';

// Augment InternalAxiosRequestConfig to carry the retry sentinel.
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config — microservices run on separate ports in local dev (no gateway), so we
// route per path prefix. In staging/prod a single gateway host serves all paths,
// in which case documentsBaseUrl can simply equal apiBaseUrl.
// ─────────────────────────────────────────────────────────────────────────────

const extra = Constants.expoConfig?.extra ?? {};

/**
 * The Android emulator cannot reach the host machine via `localhost` (that
 * resolves to the emulator itself) — the host loopback is `10.0.2.2`. iOS
 * simulators share the host network, so `localhost` works there. Rewrite the
 * loopback host for Android so the same config works on both platforms.
 */
function resolveHost(url: string): string {
  if (Platform.OS === 'android') {
    return url.replace('://localhost', '://10.0.2.2').replace('://127.0.0.1', '://10.0.2.2');
  }
  return url;
}

// Auth + default services
const API_BASE_URL = resolveHost(
  (extra.apiBaseUrl as string | undefined) ?? 'http://localhost:5101',
);

// Host root (scheme + host, no port) derived from API_BASE_URL so the Android
// loopback rewrite and any app.json host override apply to every service.
const HOST_ROOT = API_BASE_URL.replace(/:\d+$/, '');

// Per-service ports — match the fixed, directly-bound ports pinned by the
// Aspire AppHost (backend/AppHost/AppHost.cs WithDevLoopDefaults(..., port)).
// When only Auth+Document run standalone, set extra.documentsBaseUrl in app.json
// to override the document host; everything else still points at these ports.
const SERVICE_PORTS: Record<string, number> = {
  '/auth': 5101,
  '/me': 5101,
  '/documents': 5102,
  '/accounting': 5103,
  '/gst': 5104,
  '/loans': 5105,
  '/itr': 5106,
  '/chat': 5107,
  // Wave 7A: CA appointments + message bookmarks live in ChatService under /appointments
  '/appointments': 5107,
  '/notifications': 5108,
  '/reports': 5109,
  '/subscription': 5110,
  '/ai': 5111,
  '/callbacks': 5112,
};

/** Pick the service host for a given request path. */
function baseUrlForPath(url?: string): string {
  if (!url) return API_BASE_URL;
  const prefix = Object.keys(SERVICE_PORTS).find((p) => url.startsWith(p));
  return prefix ? `${HOST_ROOT}:${SERVICE_PORTS[prefix]}` : API_BASE_URL;
}

/**
 * Base URL for the ChatService SignalR hub (`{base}/hubs/chat`).
 *
 * BUG-W7-IOS-001: the hub lives on ChatService (:5107), NOT on the auth host
 * that `extra.apiBaseUrl` points at — negotiating against apiBaseUrl 404s.
 * Resolve it like REST chat calls: optional `extra.chatBaseUrl` override in
 * app.json (same pattern as documentsBaseUrl), else HOST_ROOT + the pinned
 * chat port. Both paths get the Android `10.0.2.2` loopback rewrite.
 */
export const CHAT_HUB_BASE_URL: string = (() => {
  const override = extra.chatBaseUrl as string | undefined;
  return override ? resolveHost(override) : `${HOST_ROOT}:${SERVICE_PORTS['/chat']}`;
})();

// ─────────────────────────────────────────────────────────────────────────────
// GAP-064 — device integrity attestation headers (Wave 8 pinned contract).
//
// EXACTLY these four POST call sites carry `X-Device-Integrity` +
// `X-Device-Integrity-Platform`; do NOT blanket-add to other requests:
//   1. POST /auth/otp/send                                (OTP send / resend)
//   2. POST /auth/otp/verify                              (OTP verify / login)
//   3. POST /loans/applications/{id}/submit               (loan application submit)
//   4. POST /loans/applications/{id}/consents             (loan consent record)
//
// Soft-fail: when getIntegrityToken() resolves null (emulator, dev client
// without the native module, unsupported device) we send NO header — backend
// telemetry handles absence. The request itself is never blocked or delayed
// beyond the (cached / sticky-unavailable) token lookup.
// ─────────────────────────────────────────────────────────────────────────────

const INTEGRITY_HEADER = 'X-Device-Integrity';
const INTEGRITY_PLATFORM_HEADER = 'X-Device-Integrity-Platform';

const INTEGRITY_ROUTES: RegExp[] = [
  /^\/auth\/otp\/send$/,
  /^\/auth\/otp\/verify$/,
  /^\/loans\/applications\/[^/]+\/submit$/,
  /^\/loans\/applications\/[^/]+\/consents$/,
];

/** True when a request matches one of the 4 attestation-bearing call sites. */
export function requiresDeviceIntegrity(method?: string, url?: string): boolean {
  if ((method ?? '').toLowerCase() !== 'post' || !url) return false;
  const path = url.split('?')[0];
  return INTEGRITY_ROUTES.some((route) => route.test(path));
}

// ─────────────────────────────────────────────────────────────────────────────
// Create axios instance
// ─────────────────────────────────────────────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Request interceptor — route to the right service + attach the backend token
// (issued by /auth/otp/verify and stored in the auth store).
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.baseURL = baseUrlForPath(config.url);

    // For multipart uploads, let React Native set Content-Type itself so it
    // includes the required boundary. Forcing 'multipart/form-data' (no boundary)
    // — or leaving the default 'application/json' — makes the upload body fail to
    // encode and the request stalls at 0%.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const token = useAuthStore.getState().firebaseToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // GAP-064: attach attestation headers on the 4 pinned call sites only.
    // getIntegrityToken() never throws and resolves null when attestation is
    // unavailable — the try/catch is a pure backstop so an interceptor bug can
    // never block auth/loan requests.
    if (requiresDeviceIntegrity(config.method, config.url)) {
      try {
        const integrity = await getIntegrityToken();
        if (integrity) {
          config.headers[INTEGRITY_HEADER] = integrity.token;
          config.headers[INTEGRITY_PLATFORM_HEADER] = integrity.platform;
        }
      } catch {
        // Soft-fail: proceed without integrity headers.
      }
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response interceptor — 401 handling with refresh-token rotation (SEC-025).
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_URL = '/auth/token/refresh';

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Guard 1: never attempt refresh for the refresh endpoint itself.
    // Guard 2: never retry more than once per request.
    const isRefreshCall = originalConfig?.url?.includes(REFRESH_URL);
    if (isRefreshCall || originalConfig?._retry) {
      useAuthStore.getState().signOut();
      return Promise.reject(error);
    }

    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {
      useAuthStore.getState().signOut();
      return Promise.reject(error);
    }

    // Mark this request so a second 401 on the retry falls through to signOut.
    originalConfig._retry = true;

    try {
      const refreshRes = await apiClient.post<{
        accessToken: string;
        newRefreshToken: string;
        expiresAt: string;
      }>(REFRESH_URL, { token: refreshToken });

      const { accessToken, newRefreshToken } = refreshRes.data;
      useAuthStore.getState().rotateTokens(accessToken, newRefreshToken);

      // Retry the original request with the new access token.
      originalConfig.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalConfig);
    } catch {
      useAuthStore.getState().signOut();
      return Promise.reject(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Typed API helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
  /** Stable backend error code (e.g. "Otp.Invalid") from the { error, code } envelope. */
  code?: string;
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    // Backend error envelope is { error, code }; some endpoints use { message }.
    const data = error.response?.data as
      | (Partial<ApiError> & { error?: string; code?: string })
      | undefined;
    return {
      message: data?.message ?? data?.error ?? error.message ?? 'An error occurred',
      errors: data?.errors,
      statusCode: error.response?.status ?? 0,
      code: typeof data?.code === 'string' ? data.code : undefined,
    };
  }
  return {
    message: 'An unexpected error occurred',
    statusCode: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth-specific API helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /auth/account — DPDP Act 2023 Right to Erasure.
 * Returns 204 on success. Caller must invoke authStore.signOut() afterwards.
 */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/auth/account');
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual access-token refresh (Phase 2 org-invite)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Force-refresh the backend session access token using the stored refreshToken.
 *
 * The 401 interceptor above refreshes lazily on demand, but some flows must
 * proactively re-mint the access token even when the current one is still valid —
 * e.g. right after accepting an org invite, when the OLD access token does not yet
 * carry the new organizationId / RBAC permission claims. This mirrors the
 * interceptor's refresh logic and rotates the store tokens on success.
 *
 * Returns true if the token was refreshed; false if there was no refreshToken or
 * the refresh failed (caller can decide whether to continue with stale claims).
 */
export async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return false;
  try {
    const res = await apiClient.post<{
      accessToken: string;
      newRefreshToken: string;
      expiresAt: string;
    }>(REFRESH_URL, { token: refreshToken });
    useAuthStore.getState().rotateTokens(res.data.accessToken, res.data.newRefreshToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * GAP-007 / BUG-5: Re-issue the session JWT with current org/RBAC claims by
 * calling POST /auth/token/refresh-context, then atomically swap the access
 * token in the auth store.
 *
 * Unlike refreshAccessToken() this does NOT rotate the opaque refresh token —
 * it only re-mints the access-token claims (picks up the new OrganizationId
 * written by CreateOrganizationCommandHandler or the invite-accept membership row).
 *
 * Call this immediately after:
 *   - the business-onboarding wizard creates the org (POST /auth/organizations)
 *   - a team invite is accepted (POST /auth/invite/{token}/accept)
 *
 * Failure is non-fatal: returns false and logs. The current access token
 * remains valid for non-org-scoped endpoints; callers MUST continue their flow
 * (org creation / invite accept already succeeded). Do NOT block completion on
 * a context-refresh failure.
 *
 * GAP-045 (org switcher): `organizationId` is sent as a forward-compatible
 * body hint for multi-org users. The current backend handler resolves the
 * active org as the user's most-recently-created membership and IGNORES the
 * body — an org-select parameter on RefreshContextCommand is a pending
 * backend-agent handoff. Mobile keeps its own currentOrganization in the auth
 * store, so client-side org scoping is correct either way.
 */
export async function refreshContextAndSwap(organizationId?: string): Promise<boolean> {
  try {
    const url = '/auth/token/refresh-context';
    const res = organizationId
      ? await apiClient.post<{ accessToken: string; expiresAt: string }>(url, { organizationId })
      : await apiClient.post<{ accessToken: string; expiresAt: string }>(url);
    useAuthStore.getState().swapAccessToken(res.data.accessToken);
    return true;
  } catch (err) {
    console.warn('[refreshContextAndSwap] Failed to refresh org context:', err);
    return false;
  }
}

/** Organization shape as returned by GET /auth/organizations. */
export interface ServerOrganization {
  id: string;
  name: string;
  gstin?: string | null;
  panNumber?: string | null;
  businessType?: string | null;
  address?: string | null;
  state?: string | null;
  pinCode?: string | null;
  industry?: string | null;
  annualTurnover?: number | null;
}

/**
 * GET /auth/organizations — the organizations the authenticated user belongs to.
 * Returns [] on any failure so callers can fall back to existing store state.
 */
export async function fetchOrganizations(): Promise<ServerOrganization[]> {
  try {
    const res = await apiClient.get<ServerOrganization[]>('/auth/organizations');
    return res.data ?? [];
  } catch {
    return [];
  }
}

export default apiClient;
