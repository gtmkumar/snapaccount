/**
 * Gstr1aPage — GSTR-1A Amendments list + create form
 * Route: /gst/ims/gstr1a
 * Permissions: gst.gstr1a.read (list), gst.gstr1a.create (create form)
 *
 * Entry points:
 *   1. Tab from /gst/ims
 *   2. "Fix via GSTR-1A" CTA from a rejected invoice row / detail page
 *      (pre-fills: ?from=<invoiceId>&invoiceNumber=<no>&supplierGstin=<gstin>&period=<MMYYYY>)
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Send, FilePen, Plus, ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listGstr1aAmendments,
  createGstr1aAmendment,
  periodToShortLabel,
  formatDateDMY,
  getCurrentOpenPeriod,
  getLastNPeriods,
  periodToLabel,
  GSTR1A_AMENDMENT_TYPES,
  type Gstr1aStatus,
  type Gstr1aAmendmentType,
  type Gstr1aAmendmentSummary,
} from '@/lib/gstImsApi'

// ---------------------------------------------------------------------------
// GSTR-1A status badge
// ---------------------------------------------------------------------------

function Gstr1aStatusBadge({ status }: { status: Gstr1aStatus }) {
  const config: Record<Gstr1aStatus, { label: string; cls: string; Icon: typeof CheckCircle }> = {
    DRAFT: { label: t('gst.gstr1a.status.DRAFT'), cls: 'bg-neutral-50 text-neutral-700 border-neutral-200', Icon: FilePen },
    SUBMITTED: { label: t('gst.gstr1a.status.SUBMITTED'), cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Send },
    FILED: { label: t('gst.gstr1a.status.FILED'), cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle },
  }
  const { label, cls, Icon } = config[status] ?? config.DRAFT
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Amendment type friendly labels
// ---------------------------------------------------------------------------

const AMENDMENT_TYPE_LABELS: Record<Gstr1aAmendmentType, string> = {
  B2B_AMENDMENT: t('gst.gstr1a.type.B2B_AMENDMENT'),
  B2BA: t('gst.gstr1a.type.B2BA'),
  CDNR_AMENDMENT: t('gst.gstr1a.type.CDNR_AMENDMENT'),
  CDNRA: t('gst.gstr1a.type.CDNRA'),
}

// ---------------------------------------------------------------------------
// Create amendment form
// ---------------------------------------------------------------------------

interface CreateAmendmentFormProps {
  open: boolean
  onClose: () => void
  prefill?: {
    originalImsInvoiceId?: string
    originalInvoiceNumber?: string
    originalSupplierGstin?: string
    period?: string
  }
  organizationId: string
}

function CreateAmendmentForm({ open, onClose, prefill, organizationId }: CreateAmendmentFormProps) {
  const queryClient = useQueryClient()

  const [amendmentType, setAmendmentType] = useState<Gstr1aAmendmentType>('B2B_AMENDMENT')
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState(prefill?.originalInvoiceNumber ?? '')
  const [originalSupplierGstin, setOriginalSupplierGstin] = useState(prefill?.originalSupplierGstin ?? '')
  const [period, setPeriod] = useState(prefill?.period ?? getCurrentOpenPeriod())

  // Minimal payload — taxable value, tax amounts
  const [taxableValue, setTaxableValue] = useState('')
  const [igstAmount, setIgstAmount] = useState('')
  const [cgstAmount, setCgstAmount] = useState('')
  const [sgstAmount, setSgstAmount] = useState('')
  const [cessAmount, setCessAmount] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const periods = getLastNPeriods(12)

  const createMutation = useMutation({
    mutationFn: () => {
      const payload = {
        taxableValue: parseFloat(taxableValue) || 0,
        igstAmount: parseFloat(igstAmount) || 0,
        cgstAmount: parseFloat(cgstAmount) || 0,
        sgstAmount: parseFloat(sgstAmount) || 0,
        cessAmount: parseFloat(cessAmount) || 0,
      }
      return createGstr1aAmendment({
        organizationId,
        originalImsInvoiceId: prefill?.originalImsInvoiceId,
        originalInvoiceNumber,
        originalSupplierGstin,
        amendmentType,
        amendmentPayloadJson: JSON.stringify(payload),
        period,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gstr1a'] })
      onClose()
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!originalInvoiceNumber.trim()) errs.invoiceNumber = 'Invoice number is required'
    if (!originalSupplierGstin.trim()) errs.supplierGstin = 'Supplier GSTIN is required'
    if (!period) errs.period = 'Period is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    createMutation.mutate()
  }

  function handleClose() {
    setErrors({})
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t('gst.gstr1a.create.cta')}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={createMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={createMutation.isPending}>
            {t('gst.gstr1a.create.cta')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
          This creates a <strong>draft</strong> amendment. Submission and filing are completed separately.
        </p>

        {/* Amendment type */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {t('gst.gstr1a.create.typeLabel')}
          </label>
          <select
            value={amendmentType}
            onChange={e => setAmendmentType(e.target.value as Gstr1aAmendmentType)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {GSTR1A_AMENDMENT_TYPES.map(type => (
              <option key={type} value={type}>
                {AMENDMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {/* Original invoice number */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Original Invoice Number
          </label>
          <input
            type="text"
            value={originalInvoiceNumber}
            onChange={e => setOriginalInvoiceNumber(e.target.value)}
            readOnly={!!prefill?.originalInvoiceNumber}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500',
              prefill?.originalInvoiceNumber ? 'bg-neutral-50 text-neutral-500' : '',
              errors.invoiceNumber ? 'border-red-300' : 'border-neutral-300'
            )}
            aria-invalid={!!errors.invoiceNumber}
          />
          {errors.invoiceNumber && (
            <p className="text-xs text-red-600 mt-1" role="alert">{errors.invoiceNumber}</p>
          )}
        </div>

        {/* Supplier GSTIN */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Supplier GSTIN
          </label>
          <input
            type="text"
            value={originalSupplierGstin}
            onChange={e => setOriginalSupplierGstin(e.target.value)}
            readOnly={!!prefill?.originalSupplierGstin}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500',
              prefill?.originalSupplierGstin ? 'bg-neutral-50 text-neutral-500' : '',
              errors.supplierGstin ? 'border-red-300' : 'border-neutral-300'
            )}
            aria-invalid={!!errors.supplierGstin}
          />
          {errors.supplierGstin && (
            <p className="text-xs text-red-600 mt-1" role="alert">{errors.supplierGstin}</p>
          )}
        </div>

        {/* Period */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {t('gst.ims.period.label')}
          </label>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
              errors.period ? 'border-red-300' : 'border-neutral-300'
            )}
            disabled={!!prefill?.period}
          >
            {periods.map(p => (
              <option key={p} value={p}>{periodToLabel(p)}</option>
            ))}
          </select>
        </div>

        {/* Corrected tax amounts */}
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Corrected Tax Figures</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Taxable Value', value: taxableValue, setter: setTaxableValue },
              { label: 'IGST', value: igstAmount, setter: setIgstAmount },
              { label: 'CGST', value: cgstAmount, setter: setCgstAmount },
              { label: 'SGST', value: sgstAmount, setter: setSgstAmount },
              { label: 'Cess', value: cessAmount, setter: setCessAmount },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs text-neutral-500 mb-1">{f.label}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.value}
                  onChange={e => f.setter(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

interface Gstr1aPageProps {
  organizationId?: string
}

export default function Gstr1aPage({ organizationId = '' }: Gstr1aPageProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Pre-fill from query params (set by "Fix via GSTR-1A" CTA)
  const prefillFromId = searchParams.get('from') ?? undefined
  const prefillInvoiceNumber = searchParams.get('invoiceNumber') ?? undefined
  const prefillSupplierGstin = searchParams.get('supplierGstin') ?? undefined
  const prefillPeriod = searchParams.get('period') ?? undefined

  const [period, setPeriod] = useState(prefillPeriod ?? getCurrentOpenPeriod())
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreateForm, setShowCreateForm] = useState(!!prefillFromId)
  const periods = getLastNPeriods(12)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gstr1a', 'list', organizationId, period, statusFilter, page],
    queryFn: () =>
      listGstr1aAmendments({
        organizationId,
        period: period || undefined,
        status: statusFilter || undefined,
        page,
        pageSize: 20,
      }),
    enabled: !!organizationId,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6 p-6">
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
        <span className="text-neutral-700">{t('gst.gstr1a.nav.title')}</span>
      </nav>

      <PageHeader
        title={t('gst.gstr1a.nav.title')}
        actions={
          <Can permission="gst.gstr1a.create">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setShowCreateForm(true)}
            >
              {t('gst.gstr1a.create.cta')}
            </Button>
          </Can>
        }
      />

      {/* Tabs */}
      <div role="tablist" className="flex gap-1 border-b border-neutral-200" aria-label="IMS views">
        <button
          role="tab"
          aria-selected={false}
          onClick={() => navigate('/gst/ims')}
          className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          {t('gst.ims.nav.title')}
        </button>
        <button
          role="tab"
          aria-selected={true}
          className="px-4 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-600 -mb-px"
        >
          {t('gst.gstr1a.nav.title')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period */}
        <div className="flex items-center gap-2">
          <label htmlFor="gstr1a-period" className="text-sm text-neutral-600">
            {t('gst.ims.period.label')}
          </label>
          <select
            id="gstr1a-period"
            value={period}
            onChange={e => { setPeriod(e.target.value); setPage(1) }}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All periods</option>
            {periods.map(p => (
              <option key={p} value={p}>{periodToLabel(p)}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="flex gap-2" role="group" aria-label="Filter by status">
          {[
            { value: '', label: t('gst.ims.filter.all') },
            { value: 'DRAFT', label: t('gst.gstr1a.status.DRAFT') },
            { value: 'SUBMITTED', label: t('gst.gstr1a.status.SUBMITTED') },
            { value: 'FILED', label: t('gst.gstr1a.status.FILED') },
          ].map(chip => (
            <button
              key={chip.value}
              onClick={() => { setStatusFilter(chip.value); setPage(1) }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                statusFilter === chip.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
              )}
              aria-pressed={statusFilter === chip.value}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : isError ? (
        <div role="alert" className="p-6 text-center text-sm text-red-600">
          <p className="font-medium">{t('gst.ims.error.loadFailed')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>
            {t('gst.ims.error.retry')}
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          variant="generic"
          title={t('gst.gstr1a.empty')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm" role="grid" aria-label="GSTR-1A amendments">
            <thead>
              <tr className="bg-neutral-50">
                {[
                  'Original Invoice',
                  'Amendment Type',
                  t('gst.ims.period.label'),
                  t('gst.ims.col.status'),
                  t('gst.gstr1a.col.arn'),
                  t('gst.gstr1a.col.filed'),
                  'Created',
                ].map(col => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((amendment: Gstr1aAmendmentSummary, idx: number) => (
                <tr
                  key={amendment.id}
                  className={cn(
                    'border-t border-neutral-100',
                    idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/30'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-neutral-900">{amendment.originalInvoiceNumber}</div>
                    <div className="font-mono text-xs text-neutral-500 mt-0.5">{amendment.originalSupplierGstin}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                      {AMENDMENT_TYPE_LABELS[amendment.amendmentType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {periodToShortLabel(amendment.period)}
                  </td>
                  <td className="px-4 py-3">
                    <Gstr1aStatusBadge status={amendment.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {amendment.arnNumber ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-700">
                    {amendment.filedAt ? formatDateDMY(amendment.filedAt) : t('gst.gstr1a.notFiled')}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {formatDateDMY(amendment.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalCount > 20 && (
        <div className="flex items-center justify-end gap-2 text-sm text-neutral-600">
          <Button
            variant="icon"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          >
            ‹
          </Button>
          <span>Page {page}</span>
          <Button
            variant="icon"
            size="sm"
            disabled={page * 20 >= data.totalCount}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
          >
            ›
          </Button>
        </div>
      )}

      {/* Create amendment form */}
      <Can permission="gst.gstr1a.create">
        <CreateAmendmentForm
          open={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          prefill={prefillFromId ? {
            originalImsInvoiceId: prefillFromId,
            originalInvoiceNumber: prefillInvoiceNumber,
            originalSupplierGstin: prefillSupplierGstin,
            period: prefillPeriod,
          } : undefined}
          organizationId={organizationId}
        />
      </Can>
    </div>
  )
}
