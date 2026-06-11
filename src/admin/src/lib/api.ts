/**
 * api.ts — Shared Axios instance for all admin API calls (GAP-051 Wave 7)
 *
 * Auth flow (production):
 *  1. Request interceptor attaches the in-memory access token as Bearer header.
 *     Firebase users: token comes from Firebase SDK (unchanged).
 *     LOCAL_AUTH / DEV_AUTH_BYPASS: token from authToken.getToken() (unchanged).
 *  2. Response interceptor handles 401:
 *     - Attempt ONCE to silently refresh via POST /auth/admin/refresh (httpOnly cookie
 *       on the request, new access token in the response body) [confirm 7B endpoint shape].
 *     - If refresh succeeds: store the new token, retry the original request.
 *     - If refresh fails (401 again, or cookie gone): clear session → redirect to /login.
 *  3. DEV_AUTH_BYPASS / LOCAL_AUTH paths: on 401, clear session + redirect (no
 *     silent refresh attempt, keeping dev flow simple and predictable).
 */
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from 'axios'
import { auth } from './firebase'
import { getToken, setToken, clearSession } from './authToken'

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

// ---------------------------------------------------------------------------
// Environment flags
// ---------------------------------------------------------------------------
const IS_DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'
const IS_LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true'

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  withCredentials: true, // needed for httpOnly cookie to be sent on /auth/admin/refresh
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // CSRF defence-in-depth required by AdminAuth.cs (SameSite=Strict is primary; header is secondary)
    'X-Requested-With': 'XMLHttpRequest',
  },
})

// ---------------------------------------------------------------------------
// Silent refresh state (prevent concurrent refresh storms)
// ---------------------------------------------------------------------------
let _isRefreshing = false
let _refreshPromise: Promise<string> | null = null

async function doSilentRefresh(): Promise<string> {
  // POST /auth/admin/refresh — httpOnly cookie endpoint (GAP-051, AdminAuth.cs)
  // Backend requires X-Requested-With: XMLHttpRequest CSRF header (SameSite=Strict defence-in-depth).
  // Response shape: { accessToken: string, expiresAt: string }
  const res = await axios.post<{ accessToken: string }>(
    `${baseURL}/auth/admin/refresh`,
    {},
    {
      withCredentials: true,
      timeout: 10_000,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }
  )
  const newToken = res.data.accessToken
  setToken(newToken)
  return newToken
}

// ---------------------------------------------------------------------------
// Request interceptor — attach auth token
// ---------------------------------------------------------------------------
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const user = auth.currentUser
    if (user) {
      // Firebase production path: always get fresh Firebase token
      const token = await user.getIdToken()
      config.headers.Authorization = `Bearer ${token}`
    } else {
      // LOCAL_AUTH or DEV_AUTH_BYPASS: in-memory (or localStorage in dev) token
      const localToken = getToken()
      if (localToken) config.headers.Authorization = `Bearer ${localToken}`
    }
    return config
  },
  (error: unknown) => Promise.reject(error)
)

// ---------------------------------------------------------------------------
// Response interceptor — 401 handling with silent refresh (once)
// ---------------------------------------------------------------------------

// Extend config type to carry our retry flag
interface ConfigWithRetry extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as ConfigWithRetry | undefined

    // Only attempt silent refresh for 401s that haven't already been retried
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !IS_DEV_BYPASS &&
      !IS_LOCAL_AUTH
    ) {
      config._retried = true

      // Skip refresh for the refresh endpoint itself (avoids infinite loop)
      const isRefreshEndpoint = config.url?.includes('/auth/admin/refresh')
      if (isRefreshEndpoint) {
        clearSession()
        await auth.signOut().catch(() => undefined)
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(error)
      }

      // Coalesce concurrent 401s into one refresh call
      if (_isRefreshing && _refreshPromise) {
        try {
          const newToken = await _refreshPromise
          config.headers.Authorization = `Bearer ${newToken}`
          return api.request(config)
        } catch {
          // Refresh already in flight and failed
          return Promise.reject(error)
        }
      }

      _isRefreshing = true
      _refreshPromise = doSilentRefresh()
        .finally(() => {
          _isRefreshing = false
          _refreshPromise = null
        })

      try {
        const newToken = await _refreshPromise
        config.headers.Authorization = `Bearer ${newToken}`
        return api.request(config)
      } catch {
        // Refresh failed — kill session and redirect to login
        clearSession()
        await auth.signOut().catch(() => undefined)
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    // DEV modes or already-retried: clear session and redirect
    if (error.response?.status === 401 && (IS_DEV_BYPASS || IS_LOCAL_AUTH)) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

/**
 * Call this on explicit logout to expire the httpOnly cookie server-side.
 * [confirm 7B] endpoint: POST /auth/admin/logout
 */
export async function revokeAdminSession(): Promise<void> {
  try {
    await api.post('/auth/admin/logout')
  } catch {
    // Best-effort; session is cleared client-side regardless
  } finally {
    clearSession()
  }
}

export default api
