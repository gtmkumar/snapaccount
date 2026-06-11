/**
 * CharCounter — inline SMS segment / character counter (GAP-037, Wave 7)
 * Shows segment count for DLT 160-char segments or simple char limit.
 */
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

const DLT_SEGMENT_LENGTH = 160

interface CharCounterProps {
  value: string
  /** If true, compute DLT SMS segments (160 chars each) */
  smsMode?: boolean
  /** Hard cap for plain-text mode */
  maxLength?: number
  className?: string
}

export function CharCounter({ value, smsMode = false, maxLength, className }: CharCounterProps) {
  const chars = value.length

  if (smsMode) {
    const segments = Math.ceil(chars / DLT_SEGMENT_LENGTH) || 1
    // DLT messages can be multi-segment; just warn at >1
    return (
      <span
        className={cn(
          'text-xs tabular-nums',
          segments > 1 ? 'text-warning-600' : 'text-neutral-400',
          className
        )}
        aria-live="polite"
        aria-label={t('ntpl.editor.sms.segments', { count: segments, chars })}
      >
        {t('ntpl.editor.sms.segments', { count: segments, chars })}
      </span>
    )
  }

  if (maxLength != null) {
    const remaining = maxLength - chars
    const isNearLimit = remaining < maxLength * 0.1
    const isOver = remaining < 0
    return (
      <span
        className={cn(
          'text-xs tabular-nums',
          isOver ? 'text-error-600' : isNearLimit ? 'text-warning-600' : 'text-neutral-400',
          className
        )}
        aria-live="polite"
      >
        {chars}/{maxLength}
      </span>
    )
  }

  return (
    <span className={cn('text-xs text-neutral-400 tabular-nums', className)} aria-live="polite">
      {chars}
    </span>
  )
}
