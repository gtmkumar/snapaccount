/**
 * CommandPaletteContext — Phase 6F Track F1
 * Provides open/close state and recent items for the command palette.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface RecentItem {
  type: string
  id: string
  label: string
  secondary: string
  url: string
  openedAt: number
}

interface CommandPaletteContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  recentItems: RecentItem[]
  addRecent: (item: Omit<RecentItem, 'openedAt'>) => void
  clearRecent: () => void
}

const STORAGE_KEY = 'snapaccount.cmdk.recent'
const MAX_RECENT = 25

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentItem[]
  } catch {
    return []
  }
}

function saveRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage full — ignore
  }
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  recentItems: [],
  addRecent: () => {},
  clearRecent: () => {},
})

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItem[]>(loadRecent)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])

  const addRecent = useCallback((item: Omit<RecentItem, 'openedAt'>) => {
    setRecentItems(prev => {
      const withoutDup = prev.filter(r => !(r.type === item.type && r.id === item.id))
      const next = [{ ...item, openedAt: Date.now() }, ...withoutDup].slice(0, MAX_RECENT)
      saveRecent(next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecentItems([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle, recentItems, addRecent, clearRecent }}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): CommandPaletteContextValue {
  return useContext(CommandPaletteContext)
}
