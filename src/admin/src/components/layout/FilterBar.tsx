/**
 * FilterBar — standard filter row wrapper (Card + flex layout).
 * Use with Input, NativeSelect, and Button for consistent dark-mode filters.
 */
import { type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface FilterBarProps {
  children: ReactNode
  className?: string
  align?: 'center' | 'end'
}

export function FilterBar({ children, className, align = 'end' }: FilterBarProps) {
  return (
    <Card padding="sm" className={className}>
      <div
        className={cn(
          'flex flex-wrap gap-3',
          align === 'end' ? 'items-end' : 'items-center',
        )}
      >
        {children}
      </div>
    </Card>
  )
}
