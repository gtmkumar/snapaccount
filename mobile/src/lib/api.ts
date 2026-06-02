/**
 * Axios API client with Firebase Auth token injection
 * All requests automatically include Bearer token from Firebase
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

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
  (config: InternalAxiosRequestConfig) => {
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
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─────────────────────────────────────────────────────────────────────────────
// Response interceptor — on 401 the session token is invalid/expired: sign out.
// ─────────────────────────────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().signOut();
    }
    return Promise.reject(error);
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
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    // Backend error envelope is { error, code }; some endpoints use { message }.
    const data = error.response?.data as
      | (Partial<ApiError> & { error?: string })
      | undefined;
    return {
      message: data?.message ?? data?.error ?? error.message ?? 'An error occurred',
      errors: data?.errors,
      statusCode: error.response?.status ?? 0,
    };
  }
  return {
    message: 'An unexpected error occurred',
    statusCode: 0,
  };
}

export default apiClient;
