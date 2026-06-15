/**
 * GstTaxRatesPage — GAP-022: Admin GST Tax Rate Configuration
 * Route: /gst/tax-rates
 * Permission: gst.admin.taxrates (read + write)
 *
 * Indian compliance mandate: GST rates must be configuration-driven and
 * effective-dated. Rates change with government policy (Finance Ministry
 * notifications); changes must apply from the notified effective date and
 * must NOT retroactively affect already-filed returns.
 *
 * Page features:
 *  - List all rates with active/historical filter + temporal chain view
 *  - Create modal: name, slab select (auto-computes CGST/SGST/IGST), valid-from
 *  - Deactivate action with confirm dialog
 *  - Prominent compliance banner
 *  - Full i18n (en/hi/bn), Skeleton, EmptyState, TanStack Query
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, ShieldAlert, History, AlertTriangle, Power } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog, DestructiveDialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listTaxRates,
  createTaxRate,
  deactivateTaxRate,
  computeTaxBreakdown,
  GST_SLABS,
  type TaxRateDto,
  type CreateTaxRateRequest,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'active' | 'historical'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function pctDisplay(n: number): string {
  return `${n}%`
}

// ---------------------------------------------------------------------------
// Create Rate Form
// ---------------------------------------------------------------------------

interface CreateRateFormValues {
  rateName: string
  ratePct: number | ''
  validFrom: string
  notes: string
}

interface CreateRateFormErrors {
  rateName?: string
  ratePct?: string
  validFrom?: string
}

function validateCreateForm(values: CreateRateFormValues): CreateRateFormErrors {
  const errors: CreateRateFormErrors = {}
  if (!values.rateName.trim()) errors.rateName = t('gst.taxRates.form.error.nameRequired')
  if (values.ratePct === '' || values.ratePct === undefined || values.ratePct === null) {
    errors.ratePct = t('gst.taxRates.form.error.rateRequired')
  }
  if (!values.validFrom) errors.validFrom = t('gst.taxRates.form.error.validFromRequired')
  return errors
}

interface CreateRateModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function CreateRateModal({ open, onClose, onSuccess }: CreateRateModalProps) {
  const [values, setValues] = useState<CreateRateFormValues>({
    rateName: '',
    ratePct: '',
    validFrom: '',
    notes: '',
  })
  const [errors, setErrors] = useState<CreateRateFormErrors>({})
  const [touched, setTouched] = useState(false)

  const breakdown = useMemo(() => {
    if (values.ratePct === '') return null
    return computeTaxBreakdown(Number(values.ratePct))
  }, [values.ratePct])

  const { mutate, isPending } = useMutation({
    mutationFn: (body: CreateTaxRateRequest) => createTaxRate(body),
    onSuccess: () => {
      toast.success(t('gst.taxRates.create.success'))
      onSuccess()
      handleClose()
    },
    onError: (err: Error) => {
      toast.error(err.message || t('gst.taxRates.create.error'))
    },
  })

  function handleClose() {
    setValues({ rateName: '', ratePct: '', validFrom: '', notes: '' })
    setErrors({})
    setTouched(false)
    onClose()
  }

  function handleSubmit() {
    setTouched(true)
    const errs = validateCreateForm(values)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    mutate({
      rateName: values.rateName.trim(),
      ratePct: Number(values.ratePct),
      validFrom: values.validFrom,
      notes: values.notes.trim() || undefined,
    })
  }

  function handleRateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setValues(v => ({ ...v, ratePct: val === '' ? '' : Number(val) }))
    if (touched) setErrors(prev => ({ ...prev, ratePct: undefined }))
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t('gst.taxRates.create.title')}
      description={t('gst.taxRates.create.description')}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isPending}
            disabled={isPending}
          >
            {t('gst.taxRates.create.submit')}
          </Button>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        {/* Termination notice */}
        <div className="flex gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-800 leading-relaxed">
            {t('gst.taxRates.create.terminationNote')}
          </p>
        </div>

        {/* Rate name */}
        <Input
          label={t('gst.taxRates.form.rateName')}
          placeholder={t('gst.taxRates.form.rateNamePlaceholder')}
          value={values.rateName}
          onChange={e => {
            setValues(v => ({ ...v, rateName: e.target.value }))
            if (touched) setErrors(prev => ({ ...prev, rateName: undefined }))
          }}
          error={touched ? errors.rateName : undefined}
          required
          maxLength={100}
        />

        {/* GST slab select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">
            {t('gst.taxRates.form.ratePct')}
            <span className="text-error-600 ml-0.5" aria-hidden="true">*</span>
          </label>
          <select
            value={values.ratePct === '' ? '' : String(values.ratePct)}
            onChange={handleRateChange}
            className={cn(
              'w-full h-11 px-3 rounded-lg border-0 bg-neutral-50 text-neutral-900 text-base',
              'outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20',
              'disabled:bg-neutral-100 disabled:cursor-not-allowed',
              touched && errors.ratePct ? 'ring-2 ring-error-600/30 bg-error-50' : 'ring-0',
            )}
            aria-required="true"
            aria-invalid={touched && errors.ratePct ? 'true' : undefined}
          >
            <option value="">{t('gst.taxRates.form.selectRate')}</option>
            {GST_SLABS.map(s => (
              <option key={s} value={String(s)}>
                {s}% {t('gst.taxRates.form.gst')}
              </option>
            ))}
          </select>
          {touched && errors.ratePct && (
            <p className="text-xs text-error-600" role="alert">{errors.ratePct}</p>
          )}
        </div>

        {/* Auto-computed breakdown (read-only) */}
        {breakdown !== null && (
          <div
            className="grid grid-cols-3 gap-3 rounded-lg bg-neutral-50 border border-neutral-200 p-3"
            aria-label={t('gst.taxRates.form.breakdownLabel')}
          >
            {([
              ['CGST', breakdown.cgstPct],
              ['SGST', breakdown.sgstPct],
              ['IGST', breakdown.igstPct],
            ] as [string, number][]).map(([label, pct]) => (
              <div key={label} className="text-center">
                <p className="text-xs text-neutral-500 font-medium mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-neutral-800">{pctDisplay(pct)}</p>
              </div>
            ))}
          </div>
        )}
        {breakdown === null && (
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-neutral-50 border border-neutral-200 p-3 opacity-40" aria-hidden="true">
            {['CGST', 'SGST', 'IGST'].map(label => (
              <div key={label} className="text-center">
                <p className="text-xs text-neutral-500 font-medium mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-neutral-400">—</p>
              </div>
            ))}
          </div>
        )}

        {/* Valid from */}
        <Input
          type="date"
          label={t('gst.taxRates.form.validFrom')}
          value={values.validFrom}
          onChange={e => {
            setValues(v => ({ ...v, validFrom: e.target.value }))
            if (touched) setErrors(prev => ({ ...prev, validFrom: undefined }))
          }}
          error={touched ? errors.validFrom : undefined}
          required
        />

        {/* Notes (optional) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">
            {t('gst.taxRates.form.notes')}
          </label>
          <textarea
            value={values.notes}
            onChange={e => setValues(v => ({ ...v, notes: e.target.value }))}
            placeholder={t('gst.taxRates.form.notesPlaceholder')}
            maxLength={1000}
            rows={2}
            className={cn(
              'w-full px-3 py-2.5 rounded-lg border-0 bg-neutral-50 text-neutral-900 text-sm',
              'outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20',
              'placeholder:text-neutral-400 resize-none',
            )}
          />
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Rate Row — individual row + history chain
// ---------------------------------------------------------------------------

interface RateRowProps {
  rate: TaxRateDto
  onDeactivate: (rate: TaxRateDto) => void
}

function RateRow({ rate, onDeactivate }: RateRowProps) {
  const isCurrentlyActive = rate.isActive && rate.validTo === null

  return (
    <tr className={cn(
      'border-b border-neutral-100 last:border-0 text-sm transition-colors',
      isCurrentlyActive ? 'bg-white' : 'bg-neutral-50 opacity-75',
    )}>
      {/* Rate name */}
      <td className="px-4 py-3 font-medium text-neutral-900 whitespace-nowrap">
        {rate.rateName}
      </td>

      {/* Rate % */}
      <td className="px-4 py-3 text-center">
        <span className="font-semibold text-neutral-800">{pctDisplay(rate.ratePct)}</span>
      </td>

      {/* CGST / SGST / IGST breakdown */}
      <td className="px-4 py-3">
        <div className="flex gap-3 text-xs text-neutral-600 justify-center">
          <span><span className="font-medium">C</span> {pctDisplay(rate.cgstPct)}</span>
          <span><span className="font-medium">S</span> {pctDisplay(rate.sgstPct)}</span>
          <span><span className="font-medium">I</span> {pctDisplay(rate.igstPct)}</span>
        </div>
      </td>

      {/* Valid from → Valid to */}
      <td className="px-4 py-3 text-center text-neutral-600 whitespace-nowrap">
        {formatDate(rate.validFrom)}
        {' → '}
        {rate.validTo ? formatDate(rate.validTo) : (
          <span className="text-success-600 font-medium">{t('gst.taxRates.table.ongoing')}</span>
        )}
      </td>

      {/* Status badge */}
      <td className="px-4 py-3 text-center">
        {isCurrentlyActive ? (
          <Badge variant="success" dot>{t('gst.taxRates.badge.active')}</Badge>
        ) : rate.isActive ? (
          <Badge variant="neutral" dot>{t('gst.taxRates.badge.expired')}</Badge>
        ) : (
          <Badge variant="error" dot>{t('gst.taxRates.badge.inactive')}</Badge>
        )}
      </td>

      {/* Notes */}
      <td className="px-4 py-3 max-w-[160px]">
        <span className="text-xs text-neutral-500 line-clamp-2">{rate.notes ?? '—'}</span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <Can permission="gst.admin.taxrates">
          {rate.isActive && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Power className="h-3.5 w-3.5" />}
              onClick={() => onDeactivate(rate)}
              className="text-error-600 hover:bg-error-50 text-xs"
            >
              {t('gst.taxRates.action.deactivate')}
            </Button>
          )}
        </Can>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GstTaxRatesPage() {
  const [filter, setFilter] = useState<FilterMode>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<TaxRateDto | null>(null)

  const qc = useQueryClient()

  // Fetch all rates (not activeOnly — we want history too for the "all" tab)
  const { data: allRates, isLoading, isError } = useQuery({
    queryKey: ['gst', 'tax-rates'],
    queryFn: () => listTaxRates(false),
    staleTime: 60_000,
  })

  const { mutate: doDeactivate, isPending: deactivating } = useMutation({
    mutationFn: (id: string) => deactivateTaxRate(id),
    onSuccess: () => {
      toast.success(t('gst.taxRates.deactivate.success'))
      void qc.invalidateQueries({ queryKey: ['gst', 'tax-rates'] })
      setDeactivateTarget(null)
    },
    onError: (err: Error) => {
      toast.error(err.message || t('gst.taxRates.deactivate.error'))
    },
  })

  const filteredRates = useMemo(() => {
    if (!allRates) return []
    switch (filter) {
      case 'active':
        return allRates.filter(r => r.isActive && r.validTo === null)
      case 'historical':
        return allRates.filter(r => !r.isActive || r.validTo !== null)
      default:
        return allRates
    }
  }, [allRates, filter])

  const filterTabs: { key: FilterMode; label: string }[] = [
    { key: 'active', label: t('gst.taxRates.filter.active') },
    { key: 'historical', label: t('gst.taxRates.filter.historical') },
    { key: 'all', label: t('gst.taxRates.filter.all') },
  ]

  function handleCreateSuccess() {
    void qc.invalidateQueries({ queryKey: ['gst', 'tax-rates'] })
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title={t('gst.taxRates.title')}
        subtitle={t('gst.taxRates.subtitle')}
        actions={
          <Can permission="gst.admin.taxrates">
            <Button
              variant="primary"
              leftIcon={<PlusCircle className="h-4 w-4" />}
              onClick={() => setCreateOpen(true)}
              size="sm"
            >
              {t('gst.taxRates.cta.create')}
            </Button>
          </Can>
        }
      />

      {/* Compliance banner */}
      <div
        role="note"
        aria-label={t('gst.taxRates.compliance.bannerLabel')}
        className="flex gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3.5"
      >
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-amber-900 mb-0.5">
            {t('gst.taxRates.compliance.bannerTitle')}
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            {t('gst.taxRates.compliance.bannerBody')}
          </p>
        </div>
      </div>

      {/* Filter tabs + legend */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === tab.key
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700',
              )}
              aria-pressed={filter === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('gst.taxRates.legend.history')}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4" aria-label={t('common.loading')}>
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8">
            <EmptyState
              variant="generic"
              title={t('gst.taxRates.error.title')}
              description={t('gst.taxRates.error.body')}
            />
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="p-8">
            <EmptyState
              variant="generic"
              title={t('gst.taxRates.empty.title')}
              description={t('gst.taxRates.empty.body')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" aria-label={t('gst.taxRates.table.ariaLabel')}>
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('gst.taxRates.col.rateName')}</th>
                  <th className="px-4 py-3 text-center">{t('gst.taxRates.col.rate')}</th>
                  <th className="px-4 py-3 text-center">{t('gst.taxRates.col.breakdown')}</th>
                  <th className="px-4 py-3 text-center">{t('gst.taxRates.col.validity')}</th>
                  <th className="px-4 py-3 text-center">{t('gst.taxRates.col.status')}</th>
                  <th className="px-4 py-3 text-left">{t('gst.taxRates.col.notes')}</th>
                  <th className="px-4 py-3 text-right">{t('gst.taxRates.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map(rate => (
                  <RateRow
                    key={rate.id}
                    rate={rate}
                    onDeactivate={setDeactivateTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info: version history note */}
      {!isLoading && !isError && allRates && allRates.length > 0 && (
        <p className="text-xs text-neutral-500 flex gap-1.5 items-start">
          <History className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {t('gst.taxRates.versionHistoryNote')}
        </p>
      )}

      {/* Create modal */}
      <Can permission="gst.admin.taxrates">
        <CreateRateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      </Can>

      {/* Deactivate confirm */}
      <DestructiveDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && doDeactivate(deactivateTarget.id)}
        title={t('gst.taxRates.deactivate.title')}
        description={t('gst.taxRates.deactivate.description', { name: deactivateTarget?.rateName ?? '' })}
        confirmLabel={t('gst.taxRates.deactivate.confirm')}
        cancelLabel={t('common.cancel')}
        loading={deactivating}
      />
    </div>
  )
}
