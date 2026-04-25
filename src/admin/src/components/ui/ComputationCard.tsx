/**
 * ComputationCard + DeltaPill — tax computation summary with before/after deltas.
 * Phase 6D new primitives.
 */
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AmountDisplay } from '@/components/ui/AmountDisplay'

// ---------------------------------------------------------------------------
// DeltaPill
// ---------------------------------------------------------------------------

interface DeltaPillProps {
  /** Positive = increase in value (context determines if good/bad) */
  delta: number
  /**
   * When positive delta is "good" (e.g., refund increase) → green up arrow.
   * When positive delta is "bad" (e.g., tax increase) → red up arrow. Default: bad.
   */
  positiveIsBad?: boolean
  className?: string
}

export function DeltaPill({ delta, positiveIsBad = true, className }: DeltaPillProps) {
  if (delta === 0) return null
  const isPositive = delta > 0
  const isBad = positiveIsBad ? isPositive : !isPositive
  const Icon = isPositive ? TrendingUp : TrendingDown
  const formatted = `₹${Math.abs(delta).toLocaleString('en-IN')}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
        isBad ? 'text-error-700 bg-error-50' : 'text-success-700 bg-success-50',
        className
      )}
      aria-label={`Change: ${isPositive ? 'increased' : 'decreased'} by ${formatted}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isPositive ? '+' : '-'}{formatted}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ComputationCard
// ---------------------------------------------------------------------------

export interface ComputationRow {
  label: string
  value: number
  delta?: number
  /** Bold total row */
  isTotal?: boolean
  /** Render as deduction (subtract sign) */
  isDeduction?: boolean
  /** Highlight row */
  highlight?: boolean
  hidden?: boolean
}

interface ComputationCardProps {
  rows: ComputationRow[]
  loading?: boolean
  recomputing?: boolean
  className?: string
}

export function ComputationCard({ rows, loading = false, recomputing = false, className }: ComputationCardProps) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border border-neutral-200 bg-white p-4 space-y-3 animate-pulse', className)}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex justify-between items-center">
            <div className="h-3 bg-neutral-100 rounded w-36" />
            <div className="h-3 bg-neutral-100 rounded w-24" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100', recomputing && 'opacity-60', className)}
      aria-live="polite"
      aria-label="Tax computation summary"
    >
      {rows.filter(r => !r.hidden).map((row, idx) => (
        <div
          key={idx}
          className={cn(
            'flex items-center justify-between px-4 py-3 gap-4',
            row.isTotal && 'bg-brand-50',
            row.highlight && 'bg-warning-50',
          )}
        >
          <span className={cn(
            'text-sm text-neutral-600',
            row.isTotal && 'font-bold text-neutral-900',
          )}>
            {row.label}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {row.delta !== undefined && row.delta !== 0 && (
              <DeltaPill
                delta={row.delta}
                positiveIsBad={!row.isDeduction}
              />
            )}
            <AmountDisplay
              amount={row.isDeduction ? -Math.abs(row.value) : row.value}
              size={row.isTotal ? 'md' : 'sm'}
              colorCode={row.isTotal}
              sign={row.isDeduction ? 'negative' : undefined}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
