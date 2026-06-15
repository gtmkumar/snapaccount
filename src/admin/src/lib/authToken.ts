/**
 * authToken.ts — Admin session token management (GAP-051, Wave 7)
 *
 * SECURITY MIGRATION:
 * - Production/Firebase path: access token stored IN MEMORY only (no localStorage).
 *   The server issues a httpOnly cookie on login; this module never reads it directly.
 *   Silent refresh via POST /auth/admin/refresh (Wave 7B) rotates the access token
 *   using the httpOnly cookie credential — the new token is returned in the response
 *   body and stored here in memory.
 * - DEV_AUTH_BYPASS / LOCAL_AUTH paths: token still stored in localStorage (no change
 *   to local dev workflow) so the dev experience is unaffected.
 *
 * IMPORTANT: api.ts reads from this module via getToken(). It is the ONLY caller.
 * Do not call localStorage directly for auth tokens anywhere else.
 */

const TOKEN_KEY = 'sa_admin_token'
const USER_KEY  = 'sa_admin_user'

// ---------------------------------------------------------------------------
// Environment flags
// ---------------------------------------------------------------------------
const IS_DEV_BYPASS  = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'
const IS_LOCAL_AUTH  = import.meta.env.VITE_LOCAL_AUTH === 'true'

// Use persistent storage only in dev modes; production uses in-memory.
const USE_LOCALSTORAGE = IS_DEV_BYPASS || IS_LOCAL_AUTH

// ---------------------------------------------------------------------------
// In-memory access token (production path)
// Lives in module scope — survives re-renders, lost on page refresh (by design).
// Page refresh triggers silent refresh via httpOnly cookie.
// ---------------------------------------------------------------------------
let _inMemoryToken: string | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current access token (in-memory or localStorage, depending on mode). */
export const getToken = (): string | null => {
  if (USE_LOCALSTORAGE) return localStorage.getItem(TOKEN_KEY)
  return _inMemoryToken
}

/** Store a new access token after login or silent refresh. */
export const setToken = (token: string): void => {
  if (USE_LOCALSTORAGE) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    _inMemoryToken = token
  }
}

/** Clear the access token. */
export const clearToken = (): void => {
  _inMemoryToken = null
  if (USE_LOCALSTORAGE) localStorage.removeItem(TOKEN_KEY)
}

/**
 * Clears the entire local session — token + persisted user.
 * In production mode clears the in-memory token; the httpOnly cookie
 * must be expired by calling POST /auth/admin/logout on the server.
 *
 * The two MUST be cleared together. useAuth seeds its `user` from sa_admin_user,
 * so clearing the token alone leaves a zombie session.
 */
export const clearSession = (): void => {
  _inMemoryToken = null
  // Always clear localStorage for both modes (belt-and-suspenders)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// ---------------------------------------------------------------------------
// Helpers for local-auth user persistence (dev only)
// ---------------------------------------------------------------------------

export const getStoredUser = (): unknown | null => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) as unknown : null
  } catch {
    return null
  }
}

export const setStoredUser = (user: unknown): void => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch { /* noop */ }
}
