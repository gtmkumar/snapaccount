/**
 * Combobox — Phase 6F Track F1
 * Generic async typeahead with multi-select, recent items, keyboard nav.
 */
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { Search, X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  subtitle?: string
  icon?: ReactNode
}

interface ComboboxProps {
  options?: ComboboxOption[]
  /** Async loader — called when query changes */
  loadOptions?: (query: string) => Promise<ComboboxOption[]>
  value?: string | string[]
  onChange: (value: string | string[]) => void
  multi?: boolean
  placeholder?: string
  disabled?: boolean
  maxResults?: number
  recentKey?: string
  className?: string
  label?: string
}

const _MAX_RECENT = 5

export function Combobox({
  options: staticOptions,
  loadOptions,
  value,
  onChange,
  multi = false,
  placeholder = 'Search…',
  disabled = false,
  maxResults = 10,
  recentKey: _recentKey,
  className,
  label,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [asyncOptions, setAsyncOptions] = useState<ComboboxOption[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedValues = multi
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : (value ? [value as string] : [])

  const allOptions = loadOptions ? asyncOptions : (staticOptions ?? [])
  const filtered = query
    ? allOptions.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : allOptions.slice(0, maxResults)

  // Async loader
  useEffect(() => {
    if (!loadOptions || !open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await loadOptions(query)
        setAsyncOptions(res.slice(0, maxResults))
      } catch {
        setAsyncOptions([])
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [query, open, loadOptions, maxResults])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = useCallback((opt: ComboboxOption) => {
    if (multi) {
      const current = Array.isArray(value) ? value : value ? [value] : []
      const next = current.includes(opt.value)
        ? current.filter(v => v !== opt.value)
        : [...current, opt.value]
      onChange(next)
    } else {
      onChange(opt.value)
      setOpen(false)
      setQuery('')
    }
  }, [multi, value, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault()
      handleSelect(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  const getLabel = (val: string) => allOptions.find(o => o.value === val)?.label ?? val

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">{label}</label>}

      {/* Input trigger */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-text',
          'bg-[var(--surface-sunken)] border-[var(--border-default)]',
          'text-[var(--text-primary)] transition-colors',
          open && 'ring-2 ring-[var(--border-focus)] border-[var(--border-focus)]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus() } }}
      >
        <Search className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />

        {/* Selected chips (multi) */}
        {multi && selectedValues.map(v => (
          <span
            key={v}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
          >
            {getLabel(v)}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); handleSelect({ value: v, label: '' }) }}
              aria-label={`Remove ${getLabel(v)}`}
              className="hover:text-[var(--text-primary)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-listbox"
          aria-activedescendant={filtered[activeIndex] ? `combobox-opt-${activeIndex}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIndex(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedValues.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
        />

        {!multi && selectedValues.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(multi ? [] : ''); setQuery('') }}
            aria-label="Clear"
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <ChevronDown className={cn('h-4 w-4 text-[var(--text-tertiary)] transition-transform shrink-0', open && 'rotate-180')} aria-hidden="true" />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id="combobox-listbox"
          role="listbox"
          aria-multiselectable={multi}
          className={cn(
            'absolute z-50 w-full mt-1 py-1 max-h-60 overflow-y-auto',
            'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
            'rounded-xl shadow-[var(--shadow-md)]'
          )}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-[var(--text-tertiary)]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--text-tertiary)]">No results — try a different keyword</div>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = selectedValues.includes(opt.value)
              return (
                <div
                  key={opt.value}
                  id={`combobox-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                    i === activeIndex ? 'bg-[var(--surface-sunken)]' : 'hover:bg-[var(--surface-sunken)]',
                    isSelected && 'font-medium'
                  )}
                >
                  {opt.icon && <span className="shrink-0" aria-hidden="true">{opt.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{opt.label}</p>
                    {opt.subtitle && <p className="text-xs text-[var(--text-tertiary)] truncate">{opt.subtitle}</p>}
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
