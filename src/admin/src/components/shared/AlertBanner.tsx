import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

type AlertType = 'success' | 'error' | 'warning' | 'info'

interface AlertBannerProps {
  type: AlertType
  title?: string
  description?: string
  children?: ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  actions?: ReactNode
  className?: string
}

const config: Record<AlertType, {
  bg: string
  border: string
  title: string
  text: string
  icon: React.FC<{ className?: string }>
}> = {
  success: {
    bg: 'bg-emerald-50',
    border: '',
    title: 'text-emerald-800',
    text: 'text-emerald-700',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-50',
    border: '',
    title: 'text-red-800',
    text: 'text-red-700',
    icon: XCircle,
  },
  warning: {
    bg: 'bg-amber-50',
    border: '',
    title: 'text-amber-800',
    text: 'text-amber-700',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-info-50',
    border: '',
    title: 'text-info-800',
    text: 'text-info-700',
    icon: Info,
  },
}

export function AlertBanner({
  type,
  title,
  description,
  children,
  dismissible = false,
  onDismiss,
  actions,
  className,
}: AlertBannerProps) {
  const c = config[type]
  const Icon = c.icon

  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl px-4 py-3.5',
        c.bg,
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', c.title)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn('text-sm font-semibold', c.title)}>{title}</p>
        )}
        {description && (
          <p className={cn('text-sm mt-0.5', c.text)}>{description}</p>
        )}
        {children && (
          <div className={cn('text-sm mt-1', c.text)}>{children}</div>
        )}
        {actions && (
          <div className="flex gap-3 mt-2">{actions}</div>
        )}
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className={cn('shrink-0 rounded p-0.5 hover:bg-black/10 transition-colors', c.title)}
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
