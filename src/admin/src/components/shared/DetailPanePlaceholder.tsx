/**
 * DetailPanePlaceholder — empty state for split-view detail panes.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DetailPanePlaceholderProps {
  children: ReactNode
  className?: string
}

export function DetailPanePlaceholder({ children, className }: DetailPanePlaceholderProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)]',
        'h-full min-h-64 flex items-center justify-center text-sm text-[var(--text-tertiary)] p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
