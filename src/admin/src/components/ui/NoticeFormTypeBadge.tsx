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
  warning: 'bg-amber-50 text-amber-800 border border-amber-200',
  error:   'bg-red-50 text-red-700 border border-red-200',
  brand:   'bg-violet-50 text-violet-800 border border-violet-200',
  info:    'bg-sky-50 text-sky-700 border border-sky-200',
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
        'bg-neutral-100 text-neutral-700 border border-neutral-200',
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
