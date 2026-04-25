/**
 * Tabs — Phase 6F Track F1
 * Variants: underline (default), pills, vertical, scrollable, with badgeSlot.
 */
import { type ReactNode, createContext, useContext, useState } from 'react'
import { cn } from '@/lib/utils'

type TabsVariant = 'underline' | 'pills' | 'vertical'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
  variant: TabsVariant
}

const TabsContext = createContext<TabsContextValue>({
  activeTab: '',
  setActiveTab: () => {},
  variant: 'underline',
})

// ── Root ────────────────────────────────────────────────────────────────────
interface TabsProps {
  defaultTab: string
  variant?: TabsVariant
  children: ReactNode
  className?: string
  onChange?: (id: string) => void
}

export function Tabs({ defaultTab, variant = 'underline', children, className, onChange }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  const handleChange = (id: string) => {
    setActiveTab(id)
    onChange?.(id)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleChange, variant }}>
      <div className={cn(variant === 'vertical' ? 'flex gap-6' : 'flex flex-col', className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

// ── Tab list ────────────────────────────────────────────────────────────────
interface TabListProps {
  children: ReactNode
  className?: string
  scrollable?: boolean
}

export function TabList({ children, className, scrollable = false }: TabListProps) {
  const { variant } = useContext(TabsContext)

  if (variant === 'vertical') {
    return (
      <div
        role="tablist"
        aria-orientation="vertical"
        className={cn('flex flex-col gap-0.5 shrink-0 w-44', className)}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center',
        variant === 'underline' && 'border-b border-[var(--border-subtle)]',
        variant === 'pills' && 'gap-1.5 p-1 rounded-xl bg-[var(--surface-sunken)] w-fit',
        scrollable && 'overflow-x-auto',
        className
      )}
    >
      {children}
    </div>
  )
}

// ── Tab trigger ─────────────────────────────────────────────────────────────
interface TabTriggerProps {
  id: string
  children: ReactNode
  badge?: number
  disabled?: boolean
  className?: string
}

export function TabTrigger({ id, children, badge, disabled, className }: TabTriggerProps) {
  const { activeTab, setActiveTab, variant } = useContext(TabsContext)
  const isActive = activeTab === id

  if (variant === 'underline') {
    return (
      <button
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabpanel-${id}`}
        id={`tab-${id}`}
        disabled={disabled}
        onClick={() => setActiveTab(id)}
        className={cn(
          'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]',
          isActive
            ? 'text-[var(--brand-primary)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--brand-primary)] after:rounded-t'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--brand-primary)] text-white"
            aria-live="polite"
            aria-label={`${badge} items`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  if (variant === 'pills') {
    return (
      <button
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabpanel-${id}`}
        id={`tab-${id}`}
        disabled={disabled}
        onClick={() => setActiveTab(id)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0',
          isActive
            ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--brand-primary)] text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  // Vertical
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${id}`}
      id={`tab-${id}`}
      disabled={disabled}
      onClick={() => setActiveTab(id)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left w-full',
        isActive
          ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  )
}

// ── Tab panels container ─────────────────────────────────────────────────────
interface TabPanelsProps {
  children: ReactNode
  className?: string
}

export function TabPanels({ children, className }: TabPanelsProps) {
  const { variant } = useContext(TabsContext)
  return (
    <div className={cn(variant === 'vertical' && 'flex-1', className)}>
      {children}
    </div>
  )
}

// ── Tab panel ────────────────────────────────────────────────────────────────
interface TabPanelProps {
  id: string
  children: ReactNode
  className?: string
}

export function TabPanel({ id, children, className }: TabPanelProps) {
  const { activeTab } = useContext(TabsContext)
  if (activeTab !== id) return null

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={cn('focus:outline-none', className)}
    >
      {children}
    </div>
  )
}
