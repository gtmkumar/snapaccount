/**
 * CommandPalette — Phase 6F Track F1
 * cmd+k global search modal. Calls GET /search?q=&types=...
 * Keyboard nav: Up/Down/Enter/Esc, Tab/Shift+Tab (filter cycle), cmd+Enter (new tab), cmd+. (copy ID)
 * DG-ADMIN-07: cmd+Enter open-in-new-tab, cmd+. copy-ID, Tab/Shift+Tab filter cycling, wrapping arrow nav
 * DG-ADMIN-08: polite live region announcing results count
 */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search, Clock, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { useCommandPalette } from '@/contexts/CommandPaletteContext'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import api from '@/lib/api'
import { z } from 'zod'

// ── API types ────────────────────────────────────────────────────────────────
const SearchResultSchema = z.object({
  type: z.string(),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional().nullable(),
  url: z.string(),
})

const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
  totalCount: z.number(),
})

type SearchResult = z.infer<typeof SearchResultSchema>

const FILTER_OPTIONS = ['all', 'user', 'document', 'return', 'notice', 'loan', 'itr', 'plan'] as const
type FilterType = (typeof FILTER_OPTIONS)[number]

const TYPE_ICON_MAP: Record<string, string> = {
  user: '👤',
  organisation: '🏢',
  document: '📄',
  return: '📊',
  notice: '📬',
  loan: '💰',
  itr: '📋',
  plan: '💳',
}

const SUGGESTED_ACTIONS = [
  { label: 'Go to Dashboard', key: 'g h', url: '/dashboard' },
  { label: 'Open Users list', key: 'g u', url: '/users', adminOnly: true },
  { label: 'Open Callbacks queue', key: 'g c', url: '/callbacks' },
  { label: 'Open Notifications', key: 'g n', url: '/notifications' },
]

interface CommandPaletteProps {
  /** Injected for testability */
  _isOpen?: boolean
  _onClose?: () => void
}

export function CommandPalette({ _isOpen, _onClose }: CommandPaletteProps = {}) {
  const { isOpen: ctxOpen, close: ctxClose, recentItems, addRecent } = useCommandPalette()
  const { user } = useAuth()
  const navigate = useNavigate()

  const isOpen = _isOpen !== undefined ? _isOpen : ctxOpen
  const onClose = _onClose ?? ctxClose

  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // DG-ADMIN-04: focus trap — cycles Tab within the panel, restores focus on close
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen)

  // Reset state on open and auto-focus the search input
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveFilter('all')
      setSelectedIndex(0)
      // Defer so the panel is mounted before we try to focus
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Global cmd+k binding
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose, ctxClose])

  // Search query (debounced via enabled)
  const { data, isLoading } = useQuery({
    queryKey: ['search', query, activeFilter],
    queryFn: async () => {
      const types = activeFilter === 'all' ? undefined : activeFilter
      const res = await api.get('/search', { params: { q: query, types } })
      return SearchResponseSchema.parse(res.data)
    },
    enabled: isOpen && query.trim().length >= 2,
    staleTime: 10_000,
  })

  const results: SearchResult[] = data?.results ?? []
  const showRecent = query.trim().length < 2
  const displayItems = showRecent
    ? recentItems.slice(0, 5).map(r => ({ type: r.type, id: r.id, title: r.label, subtitle: r.secondary, url: r.url }))
    : results

  const handleSelect = useCallback((item: { url: string; type: string; id: string; title: string; subtitle?: string | null }) => {
    addRecent({ type: item.type, id: item.id, label: item.title, secondary: item.subtitle ?? '', url: item.url })
    void navigate(item.url)
    onClose()
  }, [navigate, onClose, addRecent])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const isMod = e.metaKey || e.ctrlKey

    // DG-ADMIN-07: cmd/ctrl+Enter → open in new tab
    if (isMod && e.key === 'Enter' && displayItems[selectedIndex]) {
      e.preventDefault()
      const item = displayItems[selectedIndex]
      window.open(item.url, '_blank', 'noopener,noreferrer')
      onClose()
      return
    }

    // DG-ADMIN-07: cmd/ctrl+. → copy ID to clipboard
    if (isMod && e.key === '.') {
      e.preventDefault()
      const item = displayItems[selectedIndex]
      if (item) {
        void navigator.clipboard.writeText(item.id).then(() => {
          toast.success(t('palette.copyId.success', { id: item.id }))
        })
      }
      return
    }

    // DG-ADMIN-07: Tab/Shift+Tab → cycle filter chips
    if (e.key === 'Tab') {
      e.preventDefault()
      const currentIdx = FILTER_OPTIONS.indexOf(activeFilter)
      const nextIdx = e.shiftKey
        ? (currentIdx - 1 + FILTER_OPTIONS.length) % FILTER_OPTIONS.length
        : (currentIdx + 1) % FILTER_OPTIONS.length
      setActiveFilter(FILTER_OPTIONS[nextIdx])
      setSelectedIndex(0)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // DG-ADMIN-07: wrap at bottom
      setSelectedIndex(i => (i + 1) % (displayItems.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // DG-ADMIN-07: wrap at top
      setSelectedIndex(i => (i - 1 + (displayItems.length || 1)) % (displayItems.length || 1))
    } else if (e.key === 'Enter' && displayItems[selectedIndex]) {
      e.preventDefault()
      handleSelect(displayItems[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ paddingTop: '12vh' }}
      role="dialog"
      aria-label="Command palette"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--surface-overlay)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette panel — focus trap container (DG-ADMIN-04) */}
      <div
        ref={panelRef}
        className={cn(
          'relative w-full max-w-xl mx-4 rounded-2xl shadow-[var(--shadow-lg)]',
          'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
          'flex flex-col max-h-[80vh] overflow-hidden'
        )}
      >
        {/* Search row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={true}
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={displayItems[selectedIndex] ? `cmdk-item-${selectedIndex}` : undefined}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder={t('palette.placeholder')}
            className="flex-1 text-base bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close palette (Escape)"
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono">esc</kbd>
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-subtle)] overflow-x-auto">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setSelectedIndex(0) }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors',
                activeFilter === f
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
              )}
            >
              {f === 'all' ? t('palette.filter.all') : f}
            </button>
          ))}
        </div>

        {/* Results */}
        <div
          id="cmdk-listbox"
          role="listbox"
          className="flex-1 overflow-y-auto min-h-0"
        >
          {query.trim().length < 2 ? (
            <>
              {/* Recent items */}
              {recentItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('palette.section.recent')}
                  </div>
                  {recentItems.slice(0, 5).map((item, i) => (
                    <ResultRow
                      key={`recent-${i}`}
                      id={`cmdk-item-${i}`}
                      icon={TYPE_ICON_MAP[item.type] ?? '🔍'}
                      title={item.label}
                      secondary={item.secondary}
                      typeLabel={item.type}
                      isSelected={selectedIndex === i}
                      onClick={() => handleSelect({ url: item.url, type: item.type, id: item.id, title: item.label, subtitle: item.secondary })}
                    />
                  ))}
                </div>
              )}

              {/* Suggested actions */}
              <div>
                <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('palette.section.actions')}
                </div>
                {SUGGESTED_ACTIONS
                  .filter(a => !('adminOnly' in a && a.adminOnly) || user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_MANAGER')
                  .map((action, i) => (
                    <ResultRow
                      key={`action-${i}`}
                      id={`cmdk-item-${recentItems.length + i}`}
                      icon="⚡"
                      title={action.label}
                      secondary={action.key}
                      typeLabel="action"
                      isSelected={selectedIndex === recentItems.length + i}
                      onClick={() => { void navigate(action.url); onClose() }}
                    />
                  ))}
              </div>

              {recentItems.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  {t('palette.empty.placeholder')}
                </div>
              )}
            </>
          ) : isLoading ? (
            <div className="px-4 py-3 space-y-2">
              {[1,2,3].map(n => (
                <div key={n} className="h-11 rounded-lg skeleton-shimmer" />
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              {t('palette.empty.noResults', { query })}
            </div>
          ) : (
            displayItems.map((item, i) => (
              <ResultRow
                key={item.id ?? i}
                id={`cmdk-item-${i}`}
                icon={TYPE_ICON_MAP[item.type] ?? '🔍'}
                title={item.title}
                secondary={item.subtitle ?? ''}
                typeLabel={item.type}
                isSelected={selectedIndex === i}
                onClick={() => handleSelect(item)}
              />
            ))
          )}
        </div>

        {/* DG-ADMIN-08: polite live region — announces result count to screen readers after query settles */}
        <span
          aria-live="polite"
          role="status"
          className="sr-only"
        >
          {!isLoading && query.trim().length >= 2
            ? t('palette.results.count', { count: displayItems.length })
            : undefined}
        </span>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-tertiary)]">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono mr-1">↑↓</kbd>
            {t('palette.hint.navigate')}
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono mr-1">↵</kbd>
            {t('palette.hint.open')}
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono mr-1">⌘↵</kbd>
            {t('palette.hint.newTab')}
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--border-default)] font-mono mr-1">esc</kbd>
            {t('palette.hint.close')}
          </span>
        </div>
      </div>
    </div>
  )
}

interface ResultRowProps {
  id: string
  icon: string
  title: string
  secondary: string
  typeLabel: string
  isSelected: boolean
  onClick: () => void
}

function ResultRow({ id, icon, title, secondary, typeLabel, isSelected, onClick }: ResultRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'border-l-2',
        isSelected
          ? 'bg-[var(--surface-sunken)] border-l-[var(--brand-primary)]'
          : 'border-l-transparent hover:bg-[var(--surface-sunken)]'
      )}
    >
      <span className="text-lg shrink-0 w-6 text-center" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{title}</p>
        {secondary && (
          <p className="text-xs text-[var(--text-tertiary)] truncate">{secondary}</p>
        )}
      </div>
      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)] shrink-0">
        {typeLabel}
      </span>
    </div>
  )
}

// Wrapper that reads from context
export function CommandPaletteWrapper() {
  const { isOpen, close } = useCommandPalette()
  return <CommandPalette _isOpen={isOpen} _onClose={close} />
}
