// Local-auth token storage (LOCAL_AUTH dev mode). The JWT issued by
// POST /auth/local/login is stored here and attached as a Bearer token by api.ts.
const TOKEN_KEY = 'sa_admin_token'
// Persisted user identity (LOCAL_AUTH). Kept in sync with the token — see clearSession().
const USER_KEY = 'sa_admin_user'

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)

/**
 * Clears the entire local-auth session — both the JWT and the persisted user.
 *
 * The two MUST be cleared together. useAuth seeds its `user` from sa_admin_user,
 * so clearing the token alone leaves a "zombie" session: the app still believes
 * it is authenticated (user present) but has no token to send, producing an
 * endless 401 → /login → /dashboard redirect loop where nothing loads.
 */
export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
