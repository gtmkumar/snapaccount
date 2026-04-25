/**
 * DropdownMenu — Phase 6F Track F1
 * Generic dropdown with sections, destructive items, keyboard nav.
 */
import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  createContext,
  useContext,
} from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface DropdownMenuContextValue {
  close: () => void
}

const DropdownMenuContext = createContext<DropdownMenuContextValue>({ close: () => {} })

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ close: () => setOpen(false) }}>
      <div ref={containerRef} className={cn('relative inline-block', className)}>
        <div onClick={() => setOpen(v => !v)}>
          {trigger}
        </div>
        {open && (
          <div
            role="menu"
            className={cn(
              'absolute z-50 min-w-[11rem] mt-1 py-1',
              'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
              'rounded-xl shadow-[var(--shadow-md)]',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {children}
          </div>
        )}
      </div>
    </DropdownMenuContext.Provider>
  )
}

// ── Items ────────────────────────────────────────────────────────────────────
interface DropdownMenuItemProps {
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  icon?: ReactNode
  children: ReactNode
}

export function DropdownMenuItem({ onClick, disabled, destructive, icon, children }: DropdownMenuItemProps) {
  const { close } = useContext(DropdownMenuContext)

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    close()
  }

  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left',
        destructive
          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon && <span className="h-4 w-4 shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  )
}

// ── Separator ────────────────────────────────────────────────────────────────
export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-[var(--border-subtle)]" role="separator" />
}

// ── Checkbox item ─────────────────────────────────────────────────────────────
interface DropdownMenuCheckboxItemProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}

export function DropdownMenuCheckboxItem({ checked, onCheckedChange, children, disabled }: DropdownMenuCheckboxItemProps) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left',
        'text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span className={cn('flex items-center justify-center h-4 w-4 rounded border', checked ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)]' : 'border-[var(--border-default)]')}>
        {checked && <Check className="h-3 w-3 text-white" />}
      </span>
      {children}
    </button>
  )
}
