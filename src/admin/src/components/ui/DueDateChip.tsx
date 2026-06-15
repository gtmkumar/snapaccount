/**
 * DueDateChip — compact colour-coded countdown for any deadline cell.
 * Phase 6B new primitive.
 */
import { cn } from '@/lib/utils'

type DueDateChipSize = 'sm' | 'md'

interface DueDateChipProps {
  dueDate: string
  referenceDate?: string
  size?: DueDateChipSize
  className?: string
}

type DueBucket = 'overdue' | 'critical' | 'warning' | 'normal' | 'far'

function getDiffDays(dueDate: string, refDate: string): number {
  const due = new Date(dueDate).getTime()
  const ref = new Date(refDate).getTime()
  return Math.floor((due - ref) / (1000 * 60 * 60 * 24))
}

function getBucket(days: number): DueBucket {
  if (days < 0) return 'overdue'
  if (days <= 2) return 'critical'
  if (days <= 7) return 'warning'
  if (days <= 30) return 'normal'
  return 'far'
}

function formatDueLabel(days: number, dueDate: string): string {
  if (days < 0) return `Overdue · ${Math.abs(days)}d`
  if (days === 0) return 'Due today'
  if (days <= 7) return `Due in ${days}d`
  // Format as "Due DD MMM"
  const d = new Date(dueDate)
  const day = d.getDate()
  const month = d.toLocaleString('en-IN', { month: 'short' })
  return `Due ${day} ${month}`
}

function formatAriaLabel(days: number, dueDate: string): string {
  const d = new Date(dueDate)
  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  if (days < 0) return `Overdue by ${Math.abs(days)} days, was due ${dateStr}`
  if (days === 0) return `Due today, ${dateStr}`
  if (days === 1) return `Due tomorrow, ${dateStr}`
  return `Due in ${days} days, ${dateStr}`
}

const bucketClasses: Record<DueBucket, string> = {
  overdue: 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)] border-l-2 border-[var(--semantic-error-fg)]',
  critical: 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]',
  warning: 'bg-[var(--chip-amber-bg)] text-[var(--chip-amber-fg)]',
  normal: 'bg-[var(--chip-slate-bg)] text-[var(--chip-slate-fg)]',
  far: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]',
}

const sizeClasses: Record<DueDateChipSize, string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export function DueDateChip({
  dueDate,
  referenceDate,
  size = 'md',
  className,
}: DueDateChipProps) {
  const ref = referenceDate ?? new Date().toISOString()
  const days = getDiffDays(dueDate, ref)
  const bucket = getBucket(days)
  const label = formatDueLabel(days, dueDate)
  const ariaLabel = formatAriaLabel(days, dueDate)

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded whitespace-nowrap',
        bucketClasses[bucket],
        sizeClasses[size],
        className
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {label}
    </span>
  )
}
