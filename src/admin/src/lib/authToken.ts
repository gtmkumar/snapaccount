// Local-auth token storage (LOCAL_AUTH dev mode). The JWT issued by
// POST /auth/local/login is stored here and attached as a Bearer token by api.ts.
const TOKEN_KEY = 'sa_admin_token'

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)
