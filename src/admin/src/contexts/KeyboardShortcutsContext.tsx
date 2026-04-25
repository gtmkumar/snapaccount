/**
 * KeyboardShortcutsContext — Phase 6F Track F1
 * Global keyboard shortcut handler: g-prefix navigation chords, cmd+k, ?, etc.
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

interface KeyboardShortcutsContextValue {
  isCheatSheetOpen: boolean
  openCheatSheet: () => void
  closeCheatSheet: () => void
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
  isCheatSheetOpen: false,
  openCheatSheet: () => {},
  closeCheatSheet: () => {},
})

// g-prefix chord map: g + key → route
const G_CHORD_MAP: Record<string, string> = {
  h: '/dashboard',
  u: '/users',
  d: '/documents',
  a: '/accounting',
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

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false)
  const gPending = useRef(false)
  const gTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openCheatSheet = useCallback(() => setIsCheatSheetOpen(true), [])
  const closeCheatSheet = useCallback(() => setIsCheatSheetOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const isInput = isInputFocused()

      // cmd/ctrl + k — command palette (handled by CommandPalette component directly)
      // This context just manages g-chords and ? overlay

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
          toast.info(`Unknown shortcut: g ${key} — press ? for help`, { duration: 2000 })
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
    <KeyboardShortcutsContext.Provider value={{ isCheatSheetOpen, openCheatSheet, closeCheatSheet }}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  return useContext(KeyboardShortcutsContext)
}
