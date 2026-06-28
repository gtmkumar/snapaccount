/**
 * KeyboardShortcutsContext — Phase 6F Track F1 + DG-ADMIN-03
 * Global keyboard shortcut handler: g-prefix navigation chords, cmd+k, ?, etc.
 * DG-ADMIN-03 additions: cmd+/ (focus registered search), cmd+s (call registered save handler)
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
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { t } from '@/i18n'

/** Pages opt-in their save / search targets via these registry callbacks. */
interface ShortcutRegistry {
  /** Called when cmd+s is pressed. Return true to indicate the event was handled. */
  onSave?: () => boolean | void
  /** A ref to the search input, or a selector/attribute to query. */
  searchInputRef?: HTMLElement | null
}

interface KeyboardShortcutsContextValue {
  isCheatSheetOpen: boolean
  openCheatSheet: () => void
  closeCheatSheet: () => void
  /**
   * DG-ADMIN-03: Register page-level save / search handlers.
   * Returns an unregister function — call it in useEffect cleanup.
   */
  registerShortcutHandlers: (handlers: ShortcutRegistry) => () => void
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
  isCheatSheetOpen: false,
  openCheatSheet: () => {},
  closeCheatSheet: () => {},
  registerShortcutHandlers: () => () => {},
})

// g-prefix chord map: g + key → route
// DG-ADMIN-06: 'g a' was pointing to /accounting (no such route) — remapped to /compliance/edit-log
const G_CHORD_MAP: Record<string, string> = {
  h: '/dashboard',
  u: '/users',
  d: '/documents',
  a: '/compliance/edit-log',
  g: '/gst',
  i: '/itr',
  l: '/loans',
  b: '/loans/bank-communications',
  c: '/callbacks',
  k: '/chat',
  r: '/reports',
  n: '/notifications',
  s: '/subscriptions',
  t: '/team',
  ',': '/settings',
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase() ?? ''
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (document.activeElement as HTMLElement)?.isContentEditable === true
}

const FIRST_USE_KEY = 'snap_shortcuts_first_use_shown'

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false)
  const gPending = useRef(false)
  const gTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // DG-ADMIN-09: show one-time discovery toast on first mount
  useEffect(() => {
    try {
      if (!localStorage.getItem(FIRST_USE_KEY)) {
        setTimeout(() => {
          toast.info(t('shortcuts.tip.firstUse'), { duration: 5000 })
          localStorage.setItem(FIRST_USE_KEY, '1')
        }, 2500)
      }
    } catch { /* localStorage unavailable (SSR / private mode) */ }
  }, [])

  // DG-ADMIN-03: per-page handler registry (last registered wins — stack-like for nested pages)
  const registryRef = useRef<ShortcutRegistry>({})

  const registerShortcutHandlers = useCallback((handlers: ShortcutRegistry) => {
    registryRef.current = handlers
    return () => {
      // Only clear if this registration is still the active one
      if (registryRef.current === handlers) {
        registryRef.current = {}
      }
    }
  }, [])

  const openCheatSheet = useCallback(() => setIsCheatSheetOpen(true), [])
  const closeCheatSheet = useCallback(() => setIsCheatSheetOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const isInput = isInputFocused()

      // cmd/ctrl + k — command palette (handled by CommandPalette component directly)
      // This context just manages g-chords and ? overlay

      // ── DG-ADMIN-03: Universal meta-key shortcuts ─────────────────────────

      // cmd+/ (or ctrl+/) — focus the registered search input
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        const el = registryRef.current.searchInputRef
        if (el) {
          el.focus()
        } else {
          // Fallback: find the first visible [data-search-input] on the page
          const fallback = document.querySelector<HTMLElement>('[data-search-input]')
          fallback?.focus()
        }
        return
      }

      // cmd+s (or ctrl+s) — call registered save handler; always prevent browser Save dialog
      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault()
        registryRef.current.onSave?.()
        return
      }

      // ── End DG-ADMIN-03 ───────────────────────────────────────────────────

      // Esc — close cheat sheet
      if (key === 'escape' && isCheatSheetOpen) {
        setIsCheatSheetOpen(false)
        return
      }

      // ? — open cheat sheet (only outside inputs)
      if (key === '?' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setIsCheatSheetOpen(true)
        return
      }

      // Skip all g-chord logic inside inputs
      if (isInput) {
        gPending.current = false
        return
      }

      // g-chord: first press
      if (key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (gPending.current) {
          // gg — go home
          gPending.current = false
          if (gTimeout.current) clearTimeout(gTimeout.current)
          void navigate('/dashboard')
          return
        }
        gPending.current = true
        // Visual hint could be shown here
        gTimeout.current = setTimeout(() => {
          gPending.current = false
        }, 1500)
        return
      }

      // g-chord: second key
      if (gPending.current && !e.metaKey && !e.ctrlKey) {
        gPending.current = false
        if (gTimeout.current) clearTimeout(gTimeout.current)
        const route = G_CHORD_MAP[key]
        if (route) {
          e.preventDefault()
          void navigate(route)
        } else {
          // DG-ADMIN-09: use i18n instead of hardcoded English string
          toast.info(t('shortcuts.unknown.toast', { key }), { duration: 2000 })
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (gTimeout.current) clearTimeout(gTimeout.current)
    }
  }, [navigate, isCheatSheetOpen])

  return (
    <KeyboardShortcutsContext.Provider value={{ isCheatSheetOpen, openCheatSheet, closeCheatSheet, registerShortcutHandlers }}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  return useContext(KeyboardShortcutsContext)
}
