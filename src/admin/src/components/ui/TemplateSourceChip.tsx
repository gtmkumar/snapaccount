/**
 * TemplateSourceChip — indicates whether a notification template cell is a
 * custom override or falls back to the code default (GAP-037, Wave 7).
 */
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { TemplateSource } from '@/lib/notificationTemplateApi'

interface TemplateSourceChipProps {
  source: TemplateSource
  size?: 'sm' | 'md'
  className?: string
}

export function TemplateSourceChip({ source, size = 'md', className }: TemplateSourceChipProps) {
  const isCustom = source === 'CUSTOM'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium whitespace-nowrap',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        isCustom
          ? 'bg-violet-100 text-violet-800 border border-violet-200'
          : 'bg-neutral-100 text-neutral-600 border border-neutral-200',
        className
      )}
    >
      {isCustom ? t('ntpl.source.custom') : t('ntpl.source.default')}
    </span>
  )
}
