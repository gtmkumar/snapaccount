/**
 * Dialog — Phase 6F Track F1
 * Base modal + Destructive confirm variant + Wide + scrollable.
 */
import { useState, useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: DialogSize
  scrollable?: boolean
  mandatoryConfirm?: boolean
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

const SIZE_MAP: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  scrollable = false,
  mandatoryConfirm = false,
  children,
  footer,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !mandatoryConfirm) {
      e.preventDefault()
      onClose()
    }
    // Focus trap
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-desc' : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      {!mandatoryConfirm && (
        <div
          className="absolute inset-0 bg-[var(--surface-overlay)]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {mandatoryConfirm && (
        <div className="absolute inset-0 bg-[var(--surface-overlay)]" aria-hidden="true" />
      )}

      {/* Panel */}
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full rounded-2xl shadow-[var(--shadow-lg)]',
          'bg-[var(--surface-raised)] border border-[var(--border-subtle)]',
          'flex flex-col',
          scrollable ? 'max-h-[85vh]' : '',
          SIZE_MAP[size],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description && (
              <p id="dialog-desc" className="mt-1 text-sm text-[var(--text-secondary)]">
                {description}
              </p>
            )}
          </div>
          {!mandatoryConfirm && (
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className={cn(
                'shrink-0 p-1.5 rounded-lg text-[var(--text-tertiary)]',
                'hover:bg-[var(--surface-sunken)] transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]'
              )}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={cn('px-6 pb-2', scrollable && 'overflow-y-auto flex-1')}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-row-reverse gap-2 px-6 py-4 border-t border-[var(--border-subtle)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Destructive confirm dialog ──────────────────────────────────────────────
interface DestructiveDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  requireTyping?: string
  loading?: boolean
}

export function DestructiveDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  requireTyping,
  loading = false,
}: DestructiveDialogProps) {
  const [typed, setTyped] = useState('')
  const canConfirm = requireTyping ? typed === requireTyping : true

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            loading={loading}
            className="bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 mb-4">
        <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        </div>
      </div>
      {requireTyping && (
        <div className="mt-4">
          <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
            Type <strong className="font-mono">{requireTyping}</strong> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={requireTyping}
            className={cn(
              'w-full px-3 py-2 rounded-lg border text-sm',
              'bg-[var(--surface-sunken)] border-[var(--border-default)]',
              'text-[var(--text-primary)] placeholder-[var(--text-tertiary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]'
            )}
          />
        </div>
      )}
    </Dialog>
  )
}
