/**
 * ThemeContext — DG-ADMIN-01 fix (2026-06-28)
 * Three-state theme preference: 'system' | 'light' | 'dark'
 * Persisted in localStorage + synced to server via PATCH /auth/me/preferences (debounced 800ms)
 * Hydrated from GET /auth/me/preferences on first render when a session token is available.
 * Sets data-theme on <html> for CSS custom property switching.
 *
 * Server enum casing: LIGHT | DARK | SYSTEM (uppercase)
 * Context casing:     light | dark | system (lowercase)
 * toServer() / fromServer() convert between the two.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { getToken } from '@/lib/authToken'

export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

interface ThemeContextValue {
  preference: ThemePreference
  effectiveTheme: EffectiveTheme
  setPreference: (p: ThemePreference) => void
  cycleTheme: () => void
}

const STORAGE_KEY = 'snapaccount.theme'

// ---------------------------------------------------------------------------
// Casing helpers
// ---------------------------------------------------------------------------
function toServer(p: ThemePreference): string {
  return p.toUpperCase()
}

function fromServer(s: string): ThemePreference {
  const lower = s.toLowerCase()
  if (lower === 'light' || lower === 'dark' || lower === 'system') return lower
  return 'system'
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
function getSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveEffective(preference: ThemePreference): EffectiveTheme {
  if (preference === 'system') return getSystemTheme()
  return preference
}

function applyTheme(theme: EffectiveTheme) {
  const html = document.documentElement
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark')
    html.classList.add('dark')
  } else {
    html.removeAttribute('data-theme')
    html.classList.remove('dark')
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  effectiveTheme: 'light',
  setPreference: () => {},
  cycleTheme: () => {},
})

const DEBOUNCE_MS = 800

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
    return stored ?? 'system'
  })

  const effectiveTheme = resolveEffective(preference)

  // Debounce timer ref for server sync
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Apply theme on mount and whenever preference changes ─────────────────
  useEffect(() => {
    applyTheme(resolveEffective(preference))
  }, [preference])

  // ── Follow system theme when preference is 'system' ───────────────────────
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(resolveEffective('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  // ── BroadcastChannel sync across tabs ──────────────────────────────────────
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('snapaccount.theme')
      const handler = (e: MessageEvent<{ preference: ThemePreference }>) => {
        setPreferenceState(e.data.preference)
      }
      channel.addEventListener('message', handler)
    } catch {
      // BroadcastChannel not available
    }
    return () => { try { channel?.close() } catch { /* noop */ } }
  }, [])

  // ── Server hydration on mount ─────────────────────────────────────────────
  // Lazy-import settingsApi to avoid circular dependency with api.ts at module
  // evaluation time. Only fires when a session token is present so unauthenticated
  // renders (e.g. /login) never make an API call.
  useEffect(() => {
    const token = getToken()
    if (!token) return // not authenticated yet — skip hydration

    let cancelled = false
    void (async () => {
      try {
        // Lazy import avoids circular dep: ThemeContext → api → ... (evaluated early)
        const { getUserPreferences } = await import('@/lib/settingsApi')
        const prefs = await getUserPreferences()
        if (cancelled) return
        if (prefs.theme) {
          const serverPref = fromServer(prefs.theme)
          // Server is authoritative: override localStorage if server has a stored value
          setPreferenceState(serverPref)
          localStorage.setItem(STORAGE_KEY, serverPref)
        }
      } catch {
        // Network error or 401 — fall back silently to localStorage value already in state
      }
    })()

    return () => { cancelled = true }
  }, []) // intentional: run once on mount to hydrate from server

  // ── setPreference: updates state + localStorage + debounced server PATCH ──
  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
    localStorage.setItem(STORAGE_KEY, p)

    // Broadcast to other tabs
    try {
      const channel = new BroadcastChannel('snapaccount.theme')
      channel.postMessage({ preference: p })
      channel.close()
    } catch {
      // BroadcastChannel not available
    }

    // Debounced server sync — fire-and-forget, 800ms
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      const token = getToken()
      if (!token) return // not authenticated — skip
      void (async () => {
        try {
          const { updateUserPreferences } = await import('@/lib/settingsApi')
          await updateUserPreferences({ theme: toServer(p) as 'LIGHT' | 'DARK' | 'SYSTEM' })
        } catch {
          // Fail silently — theme is already applied locally
        }
      })()
    }, DEBOUNCE_MS)
  }, [])

  const cycleTheme = useCallback(() => {
    const cycle: ThemePreference[] = ['light', 'dark', 'system']
    const next = cycle[(cycle.indexOf(preference) + 1) % cycle.length]
    setPreference(next)
  }, [preference, setPreference])

  return (
    <ThemeContext.Provider value={{ preference, effectiveTheme, setPreference, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
