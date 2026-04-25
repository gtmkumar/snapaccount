/**
 * BankHealthBadge — Phase 6C
 * Card-level health indicator on PartnerBanksSettingsPage.
 * Variants: healthy (success), degraded (warning), down (error), inactive (neutral).
 * Always icon + text — never color-only.
 */
import { CheckCircle, AlertTriangle, XCircle, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type HealthStatus = 'healthy' | 'degraded' | 'down' | 'inactive'

interface BankHealthBadgeProps {
  status: HealthStatus
  size?: 'sm' | 'md'
  className?: string
}

const variantConfig: Record<
  HealthStatus,
  { label: string; icon: React.FC<{ className?: string }>; classes: string }
> = {
  healthy: {
    label: 'Healthy',
    icon: CheckCircle,
    classes: 'bg-success-50 text-success-700',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    classes: 'bg-warning-50 text-warning-700',
  },
  down: {
    label: 'Down',
    icon: XCircle,
    classes: 'bg-error-50 text-error-700',
  },
  inactive: {
    label: 'Inactive',
    icon: PauseCircle,
    classes: 'bg-neutral-50 text-neutral-500',
  },
}

export function BankHealthBadge({
  status,
  size = 'sm',
  className,
}: BankHealthBadgeProps) {
  const config = variantConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full tracking-wide',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        config.classes,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {config.label}
    </span>
  )
}
