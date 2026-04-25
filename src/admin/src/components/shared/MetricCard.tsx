import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type MetricColor = 'brand' | 'success' | 'warning' | 'error' | 'gst' | 'loan' | 'itr'
type TrendDir = 'up' | 'down' | 'neutral'

interface MetricCardProps {
  title: string
  value: string | number
  trend?: TrendDir
  trendValue?: string
  icon?: ReactNode
  color?: MetricColor
  loading?: boolean
  onClick?: () => void
  className?: string
  subtitle?: string
}

const colorConfig: Record<MetricColor, { iconBg: string; iconText: string; iconGradient: string; trendUpColor: string; trendDownColor: string }> = {
  brand: {
    iconBg: 'bg-brand-50',
    iconText: 'text-brand-600',
    iconGradient: 'from-brand-100 to-brand-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  success: {
    iconBg: 'bg-success-50',
    iconText: 'text-success-600',
    iconGradient: 'from-success-100 to-success-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  warning: {
    iconBg: 'bg-warning-50',
    iconText: 'text-warning-600',
    iconGradient: 'from-warning-100 to-warning-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  error: {
    iconBg: 'bg-error-50',
    iconText: 'text-error-600',
    iconGradient: 'from-error-100 to-error-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  gst: {
    iconBg: 'bg-purple-50',
    iconText: 'text-purple-600',
    iconGradient: 'from-purple-100 to-purple-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  loan: {
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    iconGradient: 'from-amber-100 to-amber-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
  itr: {
    iconBg: 'bg-cyan-50',
    iconText: 'text-cyan-600',
    iconGradient: 'from-cyan-100 to-cyan-50',
    trendUpColor: 'text-success-600',
    trendDownColor: 'text-error-600',
  },
}

export function MetricCard({
  title,
  value,
  trend,
  trendValue,
  icon,
  color = 'brand',
  loading = false,
  onClick,
  className,
  subtitle,
}: MetricCardProps) {
  const config = colorConfig[color]

  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm p-5', className)}>
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-lg skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded skeleton-shimmer" />
            <div className="h-7 w-32 rounded skeleton-shimmer" />
            <div className="h-3 w-20 rounded skeleton-shimmer" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-sm p-5 transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-px',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div className={cn(
            'h-12 w-12 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br',
            config.iconGradient
          )}>
            <div className={cn('h-6 w-6', config.iconText)} aria-hidden="true">
              {icon}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-500 leading-snug">{title}</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 leading-tight tabular-nums">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium',
              trend === 'up'
                ? `${config.trendUpColor} bg-success-50`
                : trend === 'down'
                ? `${config.trendDownColor} bg-error-50`
                : 'text-neutral-500 bg-neutral-50'
            )}>
              {trend === 'up' && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
              {trend === 'neutral' && <Minus className="h-3 w-3" aria-hidden="true" />}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
