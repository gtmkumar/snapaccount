/**
 * HsnSacTypeahead — debounced combobox for HSN/SAC code search (Phase 6B)
 *
 * Props:
 *   value       — currently selected HsnSacCode | null
 *   onChange    — called with HsnSacCode when user selects
 *   placeholder — input placeholder text
 *   className   — optional additional classes
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchHsnSac, type HsnSacCode } from '@/lib/gstApi'
import { t } from '@/i18n'

interface HsnSacTypeaheadProps {
  value: HsnSacCode | null
  onChange: (code: HsnSacCode | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function HsnSacTypeahead({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: HsnSacTypeaheadProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value ? `${value.code} — ${value.description}` : '')
  const [query, setQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['hsn-sac-search', query],
    queryFn: () => searchHsnSac(query),
    enabled: query.length >= 2,
    staleTime: 300_000, // HSN/SAC codes are stable
  })

  const items = data?.items ?? []

  // Sync external value changes
  useEffect(() => {
    if (value) {
      setInputValue(`${value.code} — ${value.description}`)
    } else {
      setInputValue('')
    }
  }, [value])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)
    setOpen(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQuery(raw.trim())
    }, 300)
  }, [])

  const handleSelect = useCallback((item: HsnSacCode) => {
    onChange(item)
    setInputValue(`${item.code} — ${item.description}`)
    setOpen(false)
    setQuery('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
    setInputValue('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }, [onChange])

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // Keyboard: Escape to close
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className={cn(
        'flex items-center gap-1.5 border rounded-lg px-3 py-2 bg-white',
        'border-neutral-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500',
        disabled && 'opacity-50 cursor-not-allowed bg-neutral-50',
      )}>
        <Search className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => { if (inputValue.length >= 2) setOpen(true) }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? t('admin.gst.invoice.hsnSac.placeholder')}
          className="flex-1 text-sm outline-none bg-transparent text-neutral-900 placeholder:text-neutral-400 min-w-0"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t('admin.gst.invoice.hsnSac.clear')}
            className="shrink-0 p-0.5 rounded text-neutral-400 hover:text-neutral-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && (
          <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden="true" />
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          aria-label={t('admin.gst.invoice.hsnSac.listboxLabel')}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg py-1"
        >
          {isFetching && (
            <li className="px-4 py-3 text-sm text-neutral-500 animate-pulse">
              {t('admin.gst.invoice.hsnSac.searching')}
            </li>
          )}

          {!isFetching && query.length >= 2 && items.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-500">
              {t('admin.gst.invoice.hsnSac.noResults')}
            </li>
          )}

          {!isFetching && query.length < 2 && (
            <li className="px-4 py-3 text-sm text-neutral-500">
              {t('admin.gst.invoice.hsnSac.typeToSearch')}
            </li>
          )}

          {items.map(item => (
            <li
              key={item.code}
              role="option"
              aria-selected={value?.code === item.code}
              onClick={() => handleSelect(item)}
              className={cn(
                'flex items-center justify-between px-4 py-2.5 cursor-pointer',
                'hover:bg-brand-50 text-sm',
                value?.code === item.code && 'bg-brand-50 text-brand-700',
              )}
            >
              <div className="min-w-0">
                <span className="font-mono font-semibold text-neutral-900 mr-2">{item.code}</span>
                <span className="text-neutral-600 truncate">{item.description}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-xs font-medium text-neutral-500 bg-neutral-100 rounded px-1.5 py-0.5">
                  {item.type}
                </span>
                <span className="text-xs font-semibold text-brand-700">
                  {item.gstRate}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
