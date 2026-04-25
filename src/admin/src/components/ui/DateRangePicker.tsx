/**
 * DateRangePicker — Phase 6F Track F1
 * Two-month calendar, FY-aware presets, DD/MM/YYYY display.
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateRange {
  start: Date | null
  end: Date | null
}

interface Preset {
  label: string
  getValue: () => DateRange
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (v: DateRange) => void
  presets?: Preset[]
  minDate?: Date
  maxDate?: Date
  fyAware?: boolean
  align?: 'start' | 'end'
  placeholder?: string
  className?: string
}

function formatDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const days: (Date | null)[] = Array(startDay).fill(null)
  const last = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= last; d++) days.push(new Date(year, month, d))
  return days
}

function getCurrentFY(): DateRange {
  const now = new Date()
  const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1)
  const fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31)
  return { start: fyStart, end: fyEnd }
}

const DEFAULT_PRESETS: Preset[] = [
  { label: 'Today', getValue: () => { const d = new Date(); d.setHours(0,0,0,0); return { start: d, end: d } }},
  { label: 'Yesterday', getValue: () => { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); return { start: d, end: d } }},
  { label: 'Last 7 days', getValue: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-6); return { start: s, end: e } }},
  { label: 'Last 30 days', getValue: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-29); return { start: s, end: e } }},
  { label: 'This month', getValue: () => { const now = new Date(); return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth()+1, 0) } }},
  { label: 'Last month', getValue: () => { const now = new Date(); return { start: new Date(now.getFullYear(), now.getMonth()-1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) } }},
  { label: 'Current FY', getValue: getCurrentFY },
  { label: 'Custom', getValue: () => ({ start: null, end: null }) },
]

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  minDate,
  maxDate,
  align = 'start',
  placeholder = 'Select date range',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = value.start ?? new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [selecting, setSelecting] = useState<'start' | 'end' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const rightMonth = leftMonth.month === 11
    ? { year: leftMonth.year + 1, month: 0 }
    : { year: leftMonth.year, month: leftMonth.month + 1 }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDayClick = (date: Date) => {
    if (selecting === 'start' || !selecting) {
      onChange({ start: date, end: null })
      setSelecting('end')
    } else {
      if (value.start && date < value.start) {
        onChange({ start: date, end: value.start })
      } else {
        onChange({ start: value.start, end: date })
      }
      setSelecting(null)
      setOpen(false)
    }
  }

  const triggerLabel = value.start && value.end
    ? `${formatDate(value.start)} – ${formatDate(value.end)}`
    : value.start
    ? `${formatDate(value.start)} – …`
    : placeholder

  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const renderMonth = (year: number, month: number) => {
    const days = getMonthDays(year, month)
    const monthName = new Date(year, month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

    return (
      <div className="min-w-[220px]">
        <p className="text-sm font-semibold text-[var(--text-primary)] text-center mb-3">{monthName}</p>
        <div className="grid grid-cols-7 gap-0.5">
          {DAYS.map(d => (
            <div key={d} className="text-xs text-[var(--text-tertiary)] text-center py-1">{d}</div>
          ))}
          {days.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />
            const isStart = value.start && day.getTime() === value.start.setHours(0,0,0,0)
            const isEnd = value.end && day.getTime() === value.end.setHours(0,0,0,0)
            const isInRange = value.start && value.end &&
              day >= value.start && day <= value.end
            const isHoverRange = value.start && !value.end && hoverDate &&
              ((day >= value.start && day <= hoverDate) || (day <= value.start && day >= hoverDate))
            const isDisabled = (minDate && day < minDate) || (maxDate && day > maxDate)

            return (
              <button
                key={day.toISOString()}
                onClick={() => !isDisabled && handleDayClick(day)}
                onMouseEnter={() => setHoverDate(day)}
                onMouseLeave={() => setHoverDate(null)}
                disabled={!!isDisabled}
                aria-label={formatDate(day)}
                aria-pressed={!!(isStart || isEnd)}
                className={cn(
                  'h-8 w-8 text-xs rounded-lg transition-colors mx-auto block',
                  (isStart || isEnd) && 'bg-[var(--brand-primary)] text-white font-semibold',
                  isInRange && !isStart && !isEnd && 'bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]',
                  isHoverRange && !isStart && 'bg-[var(--brand-primary)]/10',
                  !isStart && !isEnd && !isInRange && !isHoverRange && 'text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
                  isDisabled && 'opacity-30 cursor-not-allowed'
                )}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSelecting('start') }}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
          'bg-[var(--surface-sunken)] border-[var(--border-default)]',
          'text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors',
          open && 'ring-2 ring-[var(--border-focus)] border-[var(--border-focus)]'
        )}
      >
        <Calendar className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className={cn(!value.start && 'text-[var(--text-tertiary)]')}>{triggerLabel}</span>
        {(value.start || value.end) && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange({ start: null, end: null }) }}
            aria-label="Clear date range"
            className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 p-4',
            'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
            'rounded-2xl shadow-[var(--shadow-lg)]',
            'flex gap-4',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {/* Presets rail */}
          <div className="flex flex-col gap-0.5 min-w-[110px] border-r border-[var(--border-subtle)] pr-4">
            {presets.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  const v = preset.getValue()
                  if (v.start && v.end) {
                    onChange(v)
                    setOpen(false)
                  }
                }}
                className="text-left text-sm px-2 py-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div className="flex gap-6">
            {/* Nav */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => {
                    const prev = leftMonth.month === 0
                      ? { year: leftMonth.year - 1, month: 11 }
                      : { year: leftMonth.year, month: leftMonth.month - 1 }
                    setLeftMonth(prev)
                  }}
                  aria-label="Previous month"
                  className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span />
                <button
                  onClick={() => {
                    const next = leftMonth.month === 11
                      ? { year: leftMonth.year + 1, month: 0 }
                      : { year: leftMonth.year, month: leftMonth.month + 1 }
                    setLeftMonth(next)
                  }}
                  aria-label="Next month"
                  className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)] invisible"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {renderMonth(leftMonth.year, leftMonth.month)}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => {
                    const next = leftMonth.month === 11
                      ? { year: leftMonth.year + 1, month: 0 }
                      : { year: leftMonth.year, month: leftMonth.month + 1 }
                    setLeftMonth(next)
                  }}
                  aria-label="Next month"
                  className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {renderMonth(rightMonth.year, rightMonth.month)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
