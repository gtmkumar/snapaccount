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
        'bg-white rounded-xl shadow-xl border border-neutral-200',
        'animate-in slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      <span className="text-sm font-semibold text-neutral-700 shrink-0">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-neutral-300" aria-hidden="true" />
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant ?? 'secondary'}
          size="sm"
          onClick={action.onClick}
          disabled={action.pending}
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
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
