/**
 * KeyboardShortcutsOverlay — Phase 6F Track F1
 * ? opens cheat-sheet; role-aware, filterable.
 */
import { useState, useEffect, useRef } from 'react'
import { useKeyboardShortcuts } from '@/contexts/KeyboardShortcutsContext'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShortcutRow {
  keys: string[]
  label: string
  roles?: string[]
}

interface ShortcutSection {
  title: string
  i18nKey: string
  rows: ShortcutRow[]
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    i18nKey: 'shortcuts.section.nav',
    rows: [
      { keys: ['g', 'h'], label: 'Go to Dashboard' },
      { keys: ['g', 'u'], label: 'Go to Users', roles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'] },
      { keys: ['g', 'd'], label: 'Go to Documents' },
      { keys: ['g', 'a'], label: 'Go to Accounting' },
      { keys: ['g', 'g'], label: 'Go to GST' },
      { keys: ['g', 'i'], label: 'Go to ITR' },
      { keys: ['g', 'l'], label: 'Go to Loans' },
      { keys: ['g', 'b'], label: 'Go to Bank Comms' },
      { keys: ['g', 'c'], label: 'Go to Callbacks' },
      { keys: ['g', 'k'], label: 'Go to Chat' },
      { keys: ['g', 'r'], label: 'Go to Reports' },
      { keys: ['g', 'n'], label: 'Go to Notifications' },
      { keys: ['g', 's'], label: 'Go to Subscriptions', roles: ['SYSTEM_ADMIN'] },
      { keys: ['g', 't'], label: 'Go to Team', roles: ['SYSTEM_ADMIN', 'OPERATIONS_MANAGER'] },
      { keys: ['g', ','], label: 'Go to Settings' },
    ],
  },
  {
    title: 'Universal',
    i18nKey: 'shortcuts.section.universal',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['⌘', '/'], label: 'Focus search' },
      { keys: ['⌘', 'S'], label: 'Save current form' },
      { keys: ['?'], label: 'Open this cheat sheet' },
      { keys: ['Esc'], label: 'Close modal / drawer / palette' },
    ],
  },
  {
    title: 'List / DataTable',
    i18nKey: 'shortcuts.section.list',
    rows: [
      { keys: ['j'], label: 'Next row' },
      { keys: ['k'], label: 'Previous row' },
      { keys: ['Enter'], label: 'Open selected row' },
      { keys: ['x'], label: 'Toggle row selection' },
      { keys: ['a'], label: 'Select all visible' },
      { keys: ['r'], label: 'Refresh' },
      { keys: ['f'], label: 'Open filter drawer' },
    ],
  },
  {
    title: 'Page actions',
    i18nKey: 'shortcuts.section.page',
    rows: [
      { keys: ['a'], label: 'Approve (ITR/GST review)', roles: ['SYSTEM_ADMIN', 'CA', 'OPERATIONS_MANAGER'] },
      { keys: ['d'], label: 'Decline (ITR review)', roles: ['SYSTEM_ADMIN', 'CA', 'OPERATIONS_MANAGER'] },
      { keys: ['r'], label: 'Reschedule (Callback)' },
      { keys: ['n'], label: 'Add note (Callback)' },
      { keys: ['Enter'], label: 'Send (Chat message)' },
      { keys: ['Shift', 'Enter'], label: 'New line (Chat)' },
    ],
  },
]

export function KeyboardShortcutsOverlay() {
  const { isCheatSheetOpen, closeCheatSheet } = useKeyboardShortcuts()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCheatSheetOpen) {
      setFilter('')
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isCheatSheetOpen])

  if (!isCheatSheetOpen) return null

  const filteredSections = SHORTCUT_SECTIONS.map(section => ({
    ...section,
    rows: section.rows.filter(row => {
      // Role filter
      if (row.roles && user && !row.roles.includes(user.role)) return false
      // Text filter
      if (!filter) return true
      return row.label.toLowerCase().includes(filter.toLowerCase()) ||
        row.keys.join(' ').toLowerCase().includes(filter.toLowerCase())
    }),
  })).filter(section => section.rows.length > 0)

  const roleLabel = user?.role ?? 'Unknown'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title', 'Keyboard shortcuts')}
    >
      <div
        className="absolute inset-0 bg-[var(--surface-overlay)]"
        onClick={closeCheatSheet}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full max-w-2xl mx-4 rounded-2xl shadow-[var(--shadow-lg)]',
          'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
          'flex flex-col max-h-[80vh] overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {t('shortcuts.title', 'Keyboard shortcuts')}
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Showing for: <span className="font-medium">{roleLabel}</span>
            </p>
          </div>
          <button
            onClick={closeCheatSheet}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter */}
        <div className="px-6 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)]">
            <Search className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={t('shortcuts.filter.placeholder', 'Filter shortcuts…')}
              className="flex-1 text-sm bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSections.map(section => (
              <div key={section.i18nKey}>
                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                  {t(section.i18nKey, section.title)}
                </h3>
                <div className="space-y-2">
                  {section.rows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {row.keys.map((key, ki) => (
                          <kbd
                            key={ki}
                            aria-label={key}
                            className="px-1.5 py-0.5 text-xs rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono text-[var(--text-primary)] shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filteredSections.length === 0 && (
            <div className="text-center py-8 text-sm text-[var(--text-tertiary)]">
              No shortcuts match &ldquo;{filter}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
