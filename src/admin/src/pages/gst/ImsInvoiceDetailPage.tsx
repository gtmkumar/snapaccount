/**
 * ImsInvoiceDetailPage — Full detail + action log for a single IMS invoice
 * Route: /gst/ims/:invoiceId
 * Permission: gst.ims.read
 */
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Clock, CheckCircle, XCircle, PauseCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getImsInvoice,
  periodToLabel,
  formatDateDMMMY,
  formatTimestampIST,
  type ImsStatus,
} from '@/lib/gstImsApi'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function ImsStatusBadge({ status, deemedAccepted }: { status: ImsStatus; deemedAccepted?: boolean }) {
  const config: Record<ImsStatus, { label: string; cls: string; Icon: typeof CheckCircle }> = {
    PENDING: { label: t('gst.ims.status.PENDING'), cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
    ACCEPTED: { label: t('gst.ims.status.ACCEPTED'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle },
    REJECTED: { label: t('gst.ims.status.REJECTED'), cls: 'bg-red-50 text-red-700 border-red-200', Icon: XCircle },
    PENDING_KEPT: { label: t('gst.ims.status.PENDING_KEPT'), cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: PauseCircle },
  }
  const { label, cls, Icon } = config[status] ?? config.PENDING
  return (
    <span className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border', cls)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      {deemedAccepted && (
        <span className="ml-1 text-xs text-neutral-500 font-normal">(Deemed)</span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Detail field row
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-sm font-medium text-neutral-500 sm:w-40 shrink-0">{label}</dt>
      <dd className="text-sm text-neutral-900 mt-0.5 sm:mt-0">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ImsInvoiceDetailPageProps {
  organizationId?: string
}

export default function ImsInvoiceDetailPage({ organizationId = '' }: ImsInvoiceDetailPageProps) {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['ims', 'detail', invoiceId, organizationId],
    queryFn: () => getImsInvoice(invoiceId!, organizationId),
    enabled: !!invoiceId && !!organizationId,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton variant="row" className="h-8 w-48" />
        <Skeleton variant="card" />
        <Skeleton variant="dataTableDense" />
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 font-medium">{t('gst.ims.error.loadFailed')}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/gst/ims')}>
          {t('common.back')}
        </Button>
      </div>
    )
  }

  const taxTotal = invoice.igstAmount + invoice.cgstAmount + invoice.sgstAmount + invoice.cessAmount

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb nav */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-neutral-500">
        <button
          onClick={() => navigate('/gst/ims')}
          className="flex items-center gap-1 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t('gst.ims.breadcrumb')}
        </button>
        <span aria-hidden="true">›</span>
        <span className="font-mono text-neutral-700">{invoice.invoiceNumber}</span>
      </nav>

      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={`${invoice.supplierName} · ${periodToLabel(invoice.period)}`}
        actions={
          <Can permission="gst.ims.action">
            <Button variant="ghost" size="sm" onClick={() => navigate('/gst/ims')}>
              {t('common.back')}
            </Button>
          </Can>
        }
      />

      {/* Status badge */}
      <div>
        <ImsStatusBadge status={invoice.status as ImsStatus} deemedAccepted={invoice.deemedAccepted} />
      </div>

      {/* Invoice details card */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-base font-semibold text-neutral-900 mb-4">Invoice Details</h2>
        <dl className="space-y-3">
          <DetailRow label={t('gst.ims.col.supplier')} value={
            <span>
              <span className="font-medium">{invoice.supplierName}</span>
              <span className="font-mono text-neutral-500 ml-2 text-xs">{invoice.supplierGstin}</span>
            </span>
          } />
          <DetailRow label="Invoice No." value={<span className="font-mono">{invoice.invoiceNumber}</span>} />
          <DetailRow label="Invoice Date" value={formatDateDMMMY(invoice.invoiceDate)} />
          <DetailRow label="Period" value={periodToLabel(invoice.period)} />
          <DetailRow label="Source" value={
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
              {invoice.source}
            </span>
          } />
        </dl>
      </div>

      {/* Tax breakdown card */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-base font-semibold text-neutral-900 mb-4">Tax Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left pb-2 text-neutral-500 font-medium">{t('gst.ims.col.taxableValue')}</th>
                <th className="text-right pb-2 text-neutral-500 font-medium">IGST</th>
                <th className="text-right pb-2 text-neutral-500 font-medium">CGST</th>
                <th className="text-right pb-2 text-neutral-500 font-medium">SGST</th>
                <th className="text-right pb-2 text-neutral-500 font-medium">Cess</th>
                <th className="text-right pb-2 text-neutral-500 font-medium">{t('gst.ims.col.tax')}</th>
                <th className="text-right pb-2 text-neutral-900 font-semibold">{t('gst.ims.col.invoiceValue')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3"><AmountDisplay amount={invoice.taxableValue} size="sm" /></td>
                <td className="py-3 text-right"><AmountDisplay amount={invoice.igstAmount} size="sm" /></td>
                <td className="py-3 text-right"><AmountDisplay amount={invoice.cgstAmount} size="sm" /></td>
                <td className="py-3 text-right"><AmountDisplay amount={invoice.sgstAmount} size="sm" /></td>
                <td className="py-3 text-right"><AmountDisplay amount={invoice.cessAmount} size="sm" /></td>
                <td className="py-3 text-right"><AmountDisplay amount={taxTotal} size="sm" /></td>
                <td className="py-3 text-right font-semibold"><AmountDisplay amount={invoice.invoiceValue} size="sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection reason */}
      {invoice.status === 'REJECTED' && invoice.rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-800 mb-1">{t('gst.ims.reject.reasonLabel')}</h2>
          <p className="text-sm text-red-700">{invoice.rejectionReason}</p>
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/gst/ims/gstr1a?from=${invoice.id}&invoiceNumber=${invoice.invoiceNumber}&supplierGstin=${invoice.supplierGstin}&period=${invoice.period}`)}
            >
              {t('gst.ims.action.fixViaGstr1a')}
            </Button>
          </div>
        </div>
      )}

      {/* Action log */}
      {invoice.actionLog && invoice.actionLog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-base font-semibold text-neutral-900 mb-4">Action History</h2>
          <div className="space-y-3">
            {invoice.actionLog.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0">
                <div className="h-8 w-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                  {entry.action === 'ACCEPTED' && <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                  {entry.action === 'REJECTED' && <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />}
                  {entry.action === 'PENDING_KEPT' && <PauseCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-neutral-900">
                      {t(`gst.ims.status.${entry.action as ImsStatus}` as Parameters<typeof t>[0])}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatTimestampIST(entry.actionedAt)}
                    </span>
                  </div>
                  {entry.reason && (
                    <p className="text-xs text-neutral-500 mt-0.5">{entry.reason}</p>
                  )}
                  {entry.previousStatus && (
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {entry.previousStatus} → {entry.newStatus}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
