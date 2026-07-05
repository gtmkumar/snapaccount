import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  fullWidth?: boolean
}

const selectClassName =
  'h-9 w-full appearance-none rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm pl-3 pr-9 focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed'

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ label, hint, fullWidth = false, className, id, children, ...props }, ref) => {
    const selectId = id ?? (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined)

    return (
      <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={selectId} className="text-xs font-medium text-[var(--text-tertiary)]">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(selectClassName, className)}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
        </div>
        {hint && <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>}
      </div>
    )
  },
)

NativeSelect.displayName = 'NativeSelect'
