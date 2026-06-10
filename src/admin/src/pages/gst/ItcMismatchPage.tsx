import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { cn } from '@/lib/utils'
import {
  getItcMismatches,
  reconcileItc,
  type ItcMismatch,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// Reconciliation modal state
// ---------------------------------------------------------------------------

interface ReconcileForm {
  organizationId: string
  financialYear: string
  periodMonth: number
  reconciliationType: 'GSTR_2A' | 'GSTR_2B'
}

const DEFAULT_ORG_ID = '' // In production this comes from the current user's org context

// ---------------------------------------------------------------------------
// Cause label helper
// ---------------------------------------------------------------------------

function CauseBadge({ mismatchType }: { mismatchType: ItcMismatch['mismatchType'] }) {
  const variantMap: Record<ItcMismatch['mismatchType'], 'warning' | 'error' | 'info'> = {
    AMOUNT_MISMATCH: 'warning',
    MISSING_IN_2B: 'error',
    EXCESS_CLAIM: 'info',
  }
  return (
    <Badge variant={variantMap[mismatchType]} dot>
      {t(`itcMismatch.cause.${mismatchType}`)}
    </Badge>
  )
}

function StatusBadgeItc({ status }: { status: ItcMismatch['status'] }) {
  const variantMap: Record<ItcMismatch['status'], 'success' | 'error' | 'neutral'> = {
    RESOLVED: 'success',
    OPEN: 'error',
    IGNORED: 'neutral',
  }
  return (
    <Badge variant={variantMap[status]} dot>
      {t(`itcMismatch.status.${status.toLowerCase()}`)}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function buildColumns(): ColumnDef<ItcMismatch>[] {
  return [
    {
      accessorKey: 'mismatchType',
      header: t('itcMismatch.col.mismatchType'),
      cell: ({ row }) => <CauseBadge mismatchType={row.original.mismatchType} />,
    },
    {
      accessorKey: 'claimedAmount',
      header: t('itcMismatch.col.claimed'),
      cell: ({ row }) => <AmountDisplay amount={row.original.claimedAmount} size="sm" />,
    },
    {
      accessorKey: 'availableAmount',
      header: t('itcMismatch.col.available'),
      cell: ({ row }) => <AmountDisplay amount={row.original.availableAmount} size="sm" />,
    },
    {
      accessorKey: 'differenceAmount',
      header: t('itcMismatch.col.difference'),
      cell: ({ row }) => {
        const diff = row.original.differenceAmount
        const claimed = row.original.claimedAmount
        const pct = claimed > 0 ? Math.abs(diff / claimed) * 100 : 0
        const color =
          pct > 10 ? 'text-error-600' : pct > 5 ? 'text-warning-600' : 'text-neutral-600'
        return (
          <div className="flex items-center gap-2">
            <AmountDisplay
              amount={Math.abs(diff)}
              size="sm"
              colorCode
              sign={diff > 0 ? 'positive' : 'negative'}
            />
            <span className={cn('text-xs font-mono', color)}>
              {diff >= 0 ? '+' : '-'}{pct.toFixed(1)}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: t('itcMismatch.col.status'),
      cell: ({ row }) => <StatusBadgeItc status={row.original.status} />,
    },
    {
      id: 'actions',
      header: t('itcMismatch.col.actions'),
      cell: () => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm">
            {t('itcMismatch.action.resolve')}
          </Button>
          <Button variant="ghost" size="sm">
            {t('itcMismatch.action.createCallback')}
          </Button>
        </div>
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Reconcile Modal
// ---------------------------------------------------------------------------

function ReconcileModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void
  onSubmit: (form: ReconcileForm) => void
  isPending: boolean
}) {
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState<ReconcileForm>({
    organizationId: DEFAULT_ORG_ID,
    financialYear: `${currentYear - 1}-${String(currentYear).slice(2)}`,
    periodMonth: new Date().getMonth() + 1,
    reconciliationType: 'GSTR_2B',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('itcMismatch.reconcile.title')}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-5">
          {t('itcMismatch.reconcile.title')}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              {t('itcMismatch.reconcile.fy')}
            </label>
            <input
              type="text"
              value={form.financialYear}
              onChange={(e) => setForm((f) => ({ ...f, financialYear: e.target.value }))}
              placeholder={t('itcMismatch.reconcile.fyPlaceholder')}
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            />
            <p className="text-xs text-neutral-400 mt-1">{t('itcMismatch.reconcile.fyHint')}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              {t('itcMismatch.reconcile.month')}
            </label>
            <select
              value={form.periodMonth}
              onChange={(e) => setForm((f) => ({ ...f, periodMonth: Number(e.target.value) }))}
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString('en-IN', { month: 'long' })} ({m})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">
              {t('itcMismatch.reconcile.type')}
            </label>
            <select
              value={form.reconciliationType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  reconciliationType: e.target.value as 'GSTR_2A' | 'GSTR_2B',
                }))
              }
              className="w-full h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            >
              <option value="GSTR_2B">GSTR-2B</option>
              <option value="GSTR_2A">GSTR-2A</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="primary"
            onClick={() => onSubmit(form)}
            loading={isPending}
            className="flex-1"
          >
            {isPending ? t('itcMismatch.reconciling') : t('itcMismatch.reconcile.submit')}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {t('itcMismatch.reconcile.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ItcMismatchPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('OPEN')
  const [causeFilter, setCauseFilter] = useState<string>('')
  const [showReconcile, setShowReconcile] = useState(false)

  // organizationId — in production this comes from the current user's org context.
  // For admin views the backend uses currentUser.OrganizationId from the JWT.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['itc-mismatches', { status: statusFilter || undefined }],
    queryFn: () =>
      getItcMismatches({
        organizationId: DEFAULT_ORG_ID,
        status: statusFilter || undefined,
      }),
  })

  const reconcileMutation = useMutation({
    mutationFn: reconcileItc,
    onSuccess: (res) => {
      toast.success(t('itcMismatch.reconcileSuccess', { count: res.mismatchesDetected }))
      setShowReconcile(false)
      void queryClient.invalidateQueries({ queryKey: ['itc-mismatches'] })
    },
    onError: () => toast.error(t('itcMismatch.reconcileError')),
  })

  const filteredData = useMemo(() => {
    if (!data) return []
    return data.filter((d) => {
      if (causeFilter && d.mismatchType !== causeFilter) return false
      return true
    })
  }, [data, causeFilter])

  const totalMismatch = filteredData.reduce((sum, d) => sum + Math.abs(d.differenceAmount), 0)
  const criticalCount = filteredData.filter((d) => {
    const pct =
      d.claimedAmount > 0
        ? (Math.abs(d.differenceAmount) / d.claimedAmount) * 100
        : 0
    return pct > 10
  }).length

  const columns = useMemo(() => buildColumns(), [])

  return (
    <>
      {showReconcile && (
        <ReconcileModal
          onClose={() => setShowReconcile(false)}
          onSubmit={(form) => reconcileMutation.mutate(form)}
          isPending={reconcileMutation.isPending}
        />
      )}

      <div className="space-y-5">
        <PageHeader
          title={t('itcMismatch.title')}
          subtitle={t('itcMismatch.subtitle', {
            count: filteredData.length,
            amount: (totalMismatch / 100000).toFixed(1),
          })}
          actions={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => setShowReconcile(true)}
            >
              {t('itcMismatch.runReconciliation')}
            </Button>
          }
        />

        {/* Load error */}
        {isError && (
          <AlertBanner
            type="error"
            title={t('itcMismatch.loadError')}
            actions={
              <button type="button" onClick={() => void refetch()} className="text-xs underline">
                {t('common.retry')}
              </button>
            }
          />
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-neutral-500">{t('itcMismatch.stat.total')}</p>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums mt-1">
              {filteredData.length}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">{t('itcMismatch.stat.amount')}</p>
            <AmountDisplay amount={totalMismatch} size="lg" colorCode />
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">{t('itcMismatch.stat.critical')}</p>
            <p className="text-2xl font-bold text-error-600 tabular-nums mt-1">
              {criticalCount}
            </p>
          </Card>
        </div>

        {/* Filters */}
        <Card padding="sm">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1">
                {t('itcMismatch.filter.status')}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                aria-label={t('itcMismatch.filter.status')}
              >
                <option value="">{t('itcMismatch.filter.allStatuses')}</option>
                <option value="OPEN">{t('itcMismatch.filter.open')}</option>
                <option value="RESOLVED">{t('itcMismatch.filter.resolved')}</option>
                <option value="IGNORED">{t('itcMismatch.filter.ignored')}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-500 block mb-1">
                {t('itcMismatch.filter.causeGroup')}
              </label>
              <select
                value={causeFilter}
                onChange={(e) => setCauseFilter(e.target.value)}
                className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                aria-label={t('itcMismatch.filter.causeGroup')}
              >
                <option value="">{t('itcMismatch.filter.allCauses')}</option>
                <option value="AMOUNT_MISMATCH">{t('itcMismatch.filter.amountMismatch')}</option>
                <option value="MISSING_IN_2B">{t('itcMismatch.filter.missingIn2b')}</option>
                <option value="EXCESS_CLAIM">{t('itcMismatch.filter.excessClaim')}</option>
              </select>
            </div>
          </div>
        </Card>

        <DataTable
          data={filteredData}
          columns={columns}
          loading={isLoading}
          emptyState={
            <div className="py-8 text-center text-neutral-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-neutral-300" />
              <p className="font-medium">{t('itcMismatch.empty.title')}</p>
              <p className="text-sm mt-1">{t('itcMismatch.empty.desc')}</p>
            </div>
          }
        />
      </div>
    </>
  )
}
