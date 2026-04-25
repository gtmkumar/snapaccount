/**
 * EwbStatusCard — shows e-way bill (EWB) status for an invoice.
 * Phase 6B new primitive.
 */
import { CheckCircle, Clock, XCircle, AlertCircle, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EwbStatus } from '@/lib/gstApi'

interface EwbStatusCardProps {
  status: EwbStatus | null
  loading?: boolean
  onGenerate?: () => void
  generating?: boolean
  className?: string
}

const statusConfig = {
  GENERATED: {
    icon: CheckCircle,
    iconClass: 'text-success-600',
    label: 'Generated',
    bgClass: 'bg-success-50 border-success-200',
  },
  CANCELLED: {
    icon: XCircle,
    iconClass: 'text-error-600',
    label: 'Cancelled',
    bgClass: 'bg-error-50 border-error-200',
  },
  EXPIRED: {
    icon: Clock,
    iconClass: 'text-warning-600',
    label: 'Expired',
    bgClass: 'bg-warning-50 border-warning-200',
  },
  PENDING: {
    icon: Clock,
    iconClass: 'text-warning-600',
    label: 'Pending',
    bgClass: 'bg-warning-50 border-warning-200',
  },
  NOT_REQUIRED: {
    icon: AlertCircle,
    iconClass: 'text-neutral-400',
    label: 'Not Required',
    bgClass: 'bg-neutral-50 border-neutral-200',
  },
} as const

export function EwbStatusCard({
  status,
  loading = false,
  onGenerate,
  generating = false,
  className,
}: EwbStatusCardProps) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border p-4 animate-pulse', className)}>
        <div className="h-4 bg-neutral-100 rounded w-32 mb-2" />
        <div className="h-3 bg-neutral-100 rounded w-48" />
      </div>
    )
  }

  if (!status) {
    return (
      <div className={cn('rounded-xl border border-neutral-200 bg-neutral-50 p-4 flex items-center justify-between', className)}>
        <div>
          <p className="text-sm font-semibold text-neutral-700">E-Way Bill (EWB)</p>
          <p className="text-xs text-neutral-400 mt-0.5">No EWB generated yet</p>
        </div>
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate EWB'}
          </button>
        )}
      </div>
    )
  }

  const cfg = statusConfig[status.status] ?? statusConfig.NOT_REQUIRED
  const Icon = cfg.icon

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', cfg.bgClass, className)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', cfg.iconClass)} aria-hidden="true" />
        <Truck className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-neutral-800">E-Way Bill — {cfg.label}</p>
      </div>

      {status.ewbNumber && (
        <div className="text-xs text-neutral-700 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-500 w-24 shrink-0">EWB Number</span>
            <span className="font-mono">{status.ewbNumber}</span>
          </div>
          {status.ewbDate && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-24 shrink-0">Generated</span>
              <span>{new Date(status.ewbDate).toLocaleDateString('en-IN')}</span>
            </div>
          )}
          {status.validUpto && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-24 shrink-0">Valid upto</span>
              <span>{new Date(status.validUpto).toLocaleDateString('en-IN')}</span>
            </div>
          )}
          {status.vehicleNo && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-24 shrink-0">Vehicle No.</span>
              <span className="font-mono uppercase">{status.vehicleNo}</span>
            </div>
          )}
          {status.transportMode && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-24 shrink-0">Mode</span>
              <span className="capitalize">{status.transportMode.toLowerCase()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
