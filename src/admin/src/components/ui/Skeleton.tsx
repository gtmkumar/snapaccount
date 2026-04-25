/**
 * Skeleton — Phase 6F Track F1
 * Multiple variants: row, card, list, shell, dataTableDense, chart, pdf
 * Respects prefers-reduced-motion.
 */
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  variant?: 'row' | 'card' | 'list' | 'shell' | 'dataTableDense' | 'chart' | 'pdf'
}

export function Skeleton({ className, variant = 'row' }: SkeletonProps) {
  const base = 'skeleton-shimmer rounded'

  if (variant === 'shell') {
    return (
      <div className="flex h-screen overflow-hidden bg-[var(--surface-canvas)]">
        {/* Sidebar placeholder */}
        <div className="hidden md:block w-60 h-full bg-[var(--surface-raised)] border-r border-[var(--border-subtle)]">
          <div className={cn(base, 'h-12 mx-4 mt-4 mb-6')} />
          {[1,2,3,4,5,6].map(i => <div key={i} className={cn(base, 'h-8 mx-4 mb-2')} />)}
        </div>
        {/* Content placeholder */}
        <div className="flex-1 flex flex-col">
          <div className={cn(base, 'h-16 mx-0 shrink-0')} />
          <div className="flex-1 p-6 grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className={cn(base, 'h-32 rounded-xl')} />)}
            <div className="col-span-3">
              {[1,2,3,4].map(i => <div key={i} className={cn(base, 'h-10 mb-3 rounded')} />)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('bg-[var(--surface-raised)] rounded-xl p-5 border border-[var(--border-subtle)]', className)}>
        <div className={cn(base, 'h-5 w-1/3 mb-3')} />
        <div className={cn(base, 'h-8 w-2/3 mb-2')} />
        <div className={cn(base, 'h-4 w-full mb-1')} />
        <div className={cn(base, 'h-4 w-5/6')} />
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className={cn('space-y-2', className)}>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
            <div className={cn(base, 'h-10 w-10 rounded-full shrink-0')} />
            <div className="flex-1">
              <div className={cn(base, 'h-4 w-1/3 mb-2')} />
              <div className={cn(base, 'h-3 w-1/2')} />
            </div>
            <div className={cn(base, 'h-6 w-16 rounded-full')} />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'dataTableDense') {
    return (
      <div className={cn('space-y-1', className)}>
        <div className={cn(base, 'h-9 rounded-t-lg')} />
        {[1,2,3,4,5,6,7,8].map(i => <div key={i} className={cn(base, 'h-8')} />)}
      </div>
    )
  }

  if (variant === 'chart') {
    const heights = ['40%', '65%', '50%', '80%', '35%', '70%', '55%']
    return (
      <div className={cn('flex items-end gap-2 h-40 p-4', className)}>
        {heights.map((h, i) => (
          <div key={i} className={cn(base, 'flex-1 rounded-t')} style={{ height: h }} />
        ))}
      </div>
    )
  }

  if (variant === 'pdf') {
    return (
      <div
        className={cn('bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-8', className)}
        style={{ aspectRatio: '1 / 1.414' }}
      >
        <div className={cn(base, 'h-5 w-2/3 mb-4')} />
        {[1,2,3,4,5,6,7,8].map(i => <div key={i} className={cn(base, 'h-3 w-full mb-2')} />)}
        <div className={cn(base, 'h-3 w-3/4 mb-6')} />
        <div className={cn(base, 'h-20 w-full mb-4')} />
        {[1,2,3].map(i => <div key={i} className={cn(base, 'h-3 w-full mb-2')} />)}
      </div>
    )
  }

  // Default: row
  return (
    <div className={cn(base, 'h-4 w-full', className)} />
  )
}
