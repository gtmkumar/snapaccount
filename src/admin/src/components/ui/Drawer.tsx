/**
 * Drawer — Phase 6F Track F1
 * Right-side (default), bottom, lg size, with snap-points for mobile.
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DrawerPlacement = 'right' | 'bottom'
type DrawerSize = 'sm' | 'md' | 'lg'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  placement?: DrawerPlacement
  size?: DrawerSize
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

const WIDTH_MAP: Record<DrawerSize, string> = {
  sm: 'w-80',
  md: 'w-[480px]',
  lg: 'w-[720px]',
}

const HEIGHT_MAP: Record<DrawerSize, string> = {
  sm: 'h-1/3',
  md: 'h-2/3',
  lg: 'h-5/6',
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  placement = 'right',
  size = 'md',
  children,
  footer,
  className,
}: DrawerProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const isRight = placement === 'right'

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'drawer-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--surface-overlay)]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'absolute bg-[var(--surface-raised)] border-[var(--border-subtle)] shadow-[var(--shadow-lg)]',
          'flex flex-col',
          isRight
            ? cn('right-0 top-0 bottom-0 border-l', WIDTH_MAP[size], 'max-w-[90vw]')
            : cn('left-0 right-0 bottom-0 border-t rounded-t-2xl', HEIGHT_MAP[size]),
          className
        )}
      >
        {/* Drag handle for bottom drawer */}
        {!isRight && (
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-[var(--border-default)]" aria-hidden="true" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border-subtle)]">
            <div>
              <h2 id="drawer-title" className="text-lg font-semibold text-[var(--text-primary)]">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="shrink-0 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border-subtle)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
