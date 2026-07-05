/**
 * SelectionToolbar — floats above table when ≥1 row selected.
 * Phase 6B new primitive.
 */
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface SelectionAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  pending?: boolean
}

interface SelectionToolbarProps {
  selectedCount: number
  actions: SelectionAction[]
  onClear: () => void
  className?: string
}

const toolbarActionClass =
  '!bg-[var(--surface-sunken)] !border !border-[var(--border-default)] !text-[var(--text-primary)] hover:!bg-[var(--surface-canvas)] hover:!border-[var(--border-strong)]'

export function SelectionToolbar({
  selectedCount,
  actions,
  onClear,
  className,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      role="toolbar"
      aria-label={`${selectedCount} rows selected`}
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-3 px-4 py-3',
        'bg-[var(--surface-raised)] text-[var(--text-primary)]',
        'rounded-xl shadow-[var(--shadow-lg)] border border-[var(--border-default)]',
        'animate-in slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] shrink-0">
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--badge-brand-bg)] px-1.5 text-xs font-bold tabular-nums text-[var(--badge-brand-fg)]"
          aria-hidden="true"
        >
          {selectedCount}
        </span>
        <span className="font-semibold">selected</span>
      </span>
      <div className="h-5 w-px bg-[var(--border-default)]" aria-hidden="true" />
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant === 'primary' ? 'primary' : 'secondary'}
          size="sm"
          onClick={action.onClick}
          disabled={action.pending}
          className={action.variant === 'primary' ? undefined : toolbarActionClass}
        >
          {action.pending ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
              {action.label}
            </span>
          ) : (
            action.label
          )}
        </Button>
      ))}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
