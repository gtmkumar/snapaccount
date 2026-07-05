/**
 * NoticeFormTypeBadge — statutory GST notice form-code badge (GAP-108, Wave 7)
 * Distinct from StatusBadge (lifecycle). Form-type = the kind of notice.
 * Accessible: label = code + meaning; tooltip for sighted users.
 */
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  FileSearch, AlertOctagon, AlertTriangle, GitCompare, ClipboardCheck,
} from 'lucide-react'

export type NoticeFormType =
  | 'ASMT-10'
  | 'DRC-01'
  | 'DRC-01A'
  | 'DRC-01B'
  | 'DRC-01C'
  | 'ADT-01'

interface NoticeFormTypeConfig {
  variant: 'warning' | 'error' | 'brand' | 'info'
  icon: React.FC<{ className?: string }>
  labelKey: string
  meaningKey: string
  canSimulate: boolean
}

const FORM_TYPE_CONFIG: Record<NoticeFormType, NoticeFormTypeConfig> = {
  'ASMT-10': {
    variant: 'warning',
    icon: FileSearch,
    labelKey: 'gst.notice.formType.asmt10',
    meaningKey: 'gst.notice.formType.asmt10.meaning',
    canSimulate: false,
  },
  'DRC-01': {
    variant: 'error',
    icon: AlertOctagon,
    labelKey: 'gst.notice.formType.drc01',
    meaningKey: 'gst.notice.formType.drc01.meaning',
    canSimulate: false,
  },
  'DRC-01A': {
    variant: 'warning',
    icon: AlertTriangle,
    labelKey: 'gst.notice.formType.drc01a',
    meaningKey: 'gst.notice.formType.drc01a.meaning',
    canSimulate: false,
  },
  'DRC-01B': {
    variant: 'brand',
    icon: GitCompare,
    labelKey: 'gst.notice.formType.drc01b',
    meaningKey: 'gst.notice.formType.drc01b.meaning',
    canSimulate: true,
  },
  'DRC-01C': {
    variant: 'brand',
    icon: GitCompare,
    labelKey: 'gst.notice.formType.drc01c',
    meaningKey: 'gst.notice.formType.drc01c.meaning',
    canSimulate: true,
  },
  'ADT-01': {
    variant: 'info',
    icon: ClipboardCheck,
    labelKey: 'gst.notice.formType.adt01',
    meaningKey: 'gst.notice.formType.adt01.meaning',
    canSimulate: false,
  },
}

const variantClasses: Record<NoticeFormTypeConfig['variant'], string> = {
  warning: 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)] border border-[var(--chip-amber-border)]',
  error:   'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)] border border-[var(--semantic-error-fg)]/25',
  brand:   'bg-[var(--chip-violet-bg)] text-[var(--chip-violet-fg)] border border-[var(--chip-violet-border)]',
  info:    'bg-[var(--semantic-info-bg)] text-[var(--semantic-info-fg)] border border-[var(--semantic-info-fg)]/25',
}

interface NoticeFormTypeBadgeProps {
  formType: NoticeFormType | string
  size?: 'sm' | 'md'
  className?: string
}

export function NoticeFormTypeBadge({
  formType,
  size = 'md',
  className,
}: NoticeFormTypeBadgeProps) {
  const config = FORM_TYPE_CONFIG[formType as NoticeFormType]

  // Unknown form types render a plain neutral badge
  if (!config) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded font-mono font-medium',
        'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)] border border-[var(--border-default)]',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        className
      )}>
        {formType}
      </span>
    )
  }

  const Icon = config.icon
  const label = t(config.labelKey)
  const meaning = t(config.meaningKey)
  // Accessible name: code + meaning (AT users hear both)
  const ariaLabel = `${label}, ${meaning}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium whitespace-nowrap',
        variantClasses[config.variant],
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        className
      )}
      aria-label={ariaLabel}
      title={meaning}
      role="img"
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="font-mono">{label}</span>
    </span>
  )
}

export { FORM_TYPE_CONFIG }
