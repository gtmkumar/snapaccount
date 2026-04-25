/**
 * IrpStatusCard — shows IRP e-invoice (IRN) status for an invoice.
 * Phase 6B new primitive.
 */
import { CheckCircle, Clock, XCircle, AlertCircle, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IrnStatus } from '@/lib/gstApi'

interface IrpStatusCardProps {
  status: IrnStatus | null
  loading?: boolean
  onGenerate?: () => void
  generating?: boolean
  className?: string
}

const statusConfig = {
  GENERATED: {
    icon: CheckCircle,
    iconClass: 'text-success-600',
    label: 'IRN Generated',
    bgClass: 'bg-success-50 border-success-200',
  },
  CANCELLED: {
    icon: XCircle,
    iconClass: 'text-error-600',
    label: 'IRN Cancelled',
    bgClass: 'bg-error-50 border-error-200',
  },
  PENDING: {
    icon: Clock,
    iconClass: 'text-warning-600',
    label: 'Pending',
    bgClass: 'bg-warning-50 border-warning-200',
  },
  NOT_APPLICABLE: {
    icon: AlertCircle,
    iconClass: 'text-neutral-400',
    label: 'Not Applicable',
    bgClass: 'bg-neutral-50 border-neutral-200',
  },
} as const

export function IrpStatusCard({
  status,
  loading = false,
  onGenerate,
  generating = false,
  className,
}: IrpStatusCardProps) {
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
          <p className="text-sm font-semibold text-neutral-700">E-Invoice (IRP)</p>
          <p className="text-xs text-neutral-400 mt-0.5">No IRN generated yet</p>
        </div>
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate IRN'}
          </button>
        )}
      </div>
    )
  }

  const cfg = statusConfig[status.status] ?? statusConfig.NOT_APPLICABLE
  const Icon = cfg.icon

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', cfg.bgClass, className)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', cfg.iconClass)} aria-hidden="true" />
        <p className="text-sm font-semibold text-neutral-800">E-Invoice (IRP) — {cfg.label}</p>
      </div>

      {status.irnNumber && (
        <div className="text-xs text-neutral-700 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-500 w-16 shrink-0">IRN</span>
            <span className="font-mono break-all">{status.irnNumber}</span>
          </div>
          {status.ackNumber && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-16 shrink-0">Ack No.</span>
              <span className="font-mono">{status.ackNumber}</span>
            </div>
          )}
          {status.ackDate && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-500 w-16 shrink-0">Ack Date</span>
              <span>{new Date(status.ackDate).toLocaleDateString('en-IN')}</span>
            </div>
          )}
          {status.signedQRCode && (
            <div className="flex items-center gap-1.5 text-brand-600 mt-1">
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs">QR code available</span>
            </div>
          )}
        </div>
      )}

      {status.cancelledAt && (
        <p className="text-xs text-error-600">
          Cancelled on {new Date(status.cancelledAt).toLocaleDateString('en-IN')}
          {status.cancelRemark && ` — ${status.cancelRemark}`}
        </p>
      )}
    </div>
  )
}
