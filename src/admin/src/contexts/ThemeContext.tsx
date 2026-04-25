/**
 * ThemeContext — Phase 6F Track F1
 * Three-state theme preference: 'system' | 'light' | 'dark'
 * Persisted in localStorage + synced to server via PATCH /me/preferences
 * Sets data-theme on <html> for CSS custom property switching
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

interface ThemeContextValue {
  preference: ThemePreference
  effectiveTheme: EffectiveTheme
  setPreference: (p: ThemePreference) => void
  cycleTheme: () => void
}

const STORAGE_KEY = 'snapaccount.theme'

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

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  effectiveTheme: 'light',
  setPreference: () => {},
  cycleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
    return stored ?? 'system'
  })

  const effectiveTheme = resolveEffective(preference)

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyTheme(resolveEffective(preference))
  }, [preference])

  // Follow system theme when preference is 'system'
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(resolveEffective('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  // BroadcastChannel sync across tabs
  useEffect(() => {
    const channel = new BroadcastChannel('snapaccount.theme')
    const handler = (e: MessageEvent<{ preference: ThemePreference }>) => {
      setPreferenceState(e.data.preference)
    }
    channel.addEventListener('message', handler)
    return () => channel.close()
  }, [])

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
    // Debounced server sync (fire-and-forget)
    // PATCH /me/preferences { theme: p } — omitted here to avoid circular dep with api
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
