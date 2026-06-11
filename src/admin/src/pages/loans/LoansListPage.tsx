/**
 * LoansListPage — Phase 6C full build (replaces stub)
 * Route: /loans
 * Filterable DataGrid of all loan applications. KpiStrip, FilterBar,
 * bulk-assign, bulk export CSV. Role-gated to LOAN_OFFICER / ADMIN / CA.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  CreditCard,
  Search,
  Download,
  Eye,
  RefreshCw,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { MetricCard } from '@/components/shared/MetricCard'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { BankAdapterTypeBadge } from '@/components/ui/BankAdapterTypeBadge'
import { SelectionToolbar } from '@/components/ui/SelectionToolbar'
import { formatDate, cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listLoanApplications,
  assignBank,
  listPartnerBanks,
  getLoanKpi,
  type LoanApplicationSummary,
  type LoanApplicationStatus,
  type LoanKpi,
} from '@/lib/loanApi'

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const LOAN_STATUS_CONFIG: Record<LoanApplicationStatus, { variant: 'neutral' | 'info' | 'warning' | 'success' | 'error'; label: string }> = {
  DRAFT: { variant: 'neutral', label: 'Draft' },
  SUBMITTED: { variant: 'info', label: 'Submitted' },
  UNDER_REVIEW: { variant: 'info', label: 'Under review' },
  DOCS_REQUESTED: { variant: 'warning', label: 'Docs requested' },
  APPROVED: { variant: 'success', label: 'Approved' },
  REJECTED: { variant: 'error', label: 'Rejected' },
  DISBURSED: { variant: 'success', label: 'Disbursed' },
  CLOSED: { variant: 'neutral', label: 'Closed' },
}

function LoanStatusBadge({ status }: { status: LoanApplicationStatus }) {
  const cfg = LOAN_STATUS_CONFIG[status] ?? { variant: 'neutral' as const, label: status }
  const labelKey = `admin.loans.status.${status.toLowerCase()}`
  return <Badge variant={cfg.variant}>{t(labelKey)}</Badge>
}

// ---------------------------------------------------------------------------
// Days in stage cell
// ---------------------------------------------------------------------------

function DaysInStageCell({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-neutral-400">—</span>
  const cls =
    days > 7
      ? 'text-error-700 font-semibold'
      : days > 3
        ? 'text-warning-700 font-medium'
        : 'text-neutral-700'
  return <span className={cls}>{days}d</span>
}

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------

function KpiStrip({ kpi, loading }: { kpi: LoanKpi | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        aria-label={t('loansList.kpi.loading.ariaLabel')}
        aria-busy="true"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-20" />
        ))}
      </div>
    )
  }

  const tiles = [
    { label: t('admin.loans.kpi.total'), value: kpi?.totalApps ?? 0 },
    { label: t('admin.loans.kpi.submitted'), value: kpi?.submitted ?? 0 },
    { label: t('admin.loans.kpi.underReview'), value: kpi?.underReview ?? 0 },
    { label: t('admin.loans.kpi.awaitingDocs'), value: kpi?.awaitingDocs ?? 0 },
    { label: t('admin.loans.kpi.approved'), value: kpi?.approved ?? 0 },
    { label: t('admin.loans.kpi.disbursed'), value: kpi?.disbursed ?? 0 },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map(tile => (
        <MetricCard key={tile.label} title={tile.label} value={tile.value} color="loan" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bulk assign modal
// ---------------------------------------------------------------------------

interface BulkAssignModalProps {
  count: number
  applicationIds: string[]
  onDone: () => void
  onClose: () => void
}

function BulkAssignModal({ count, applicationIds, onDone, onClose }: BulkAssignModalProps) {
  const [selectedBankId, setSelectedBankId] = useState('')

  const { data: banksData } = useQuery({
    queryKey: ['partnerBanks'],
    queryFn: () => listPartnerBanks({ pageSize: 100 }),
  })

  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.all(applicationIds.map(id => assignBank(id, { bankId: selectedBankId })))
    },
    onSuccess: () => {
      toast.success(t('admin.loans.bulkAssign.success', { count }))
      void qc.invalidateQueries({ queryKey: ['loanApplications'] })
      onDone()
    },
    onError: () => toast.error(t('admin.loans.bulkAssign.error')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={t('admin.loans.bulkAssign.title')}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">
          {t('admin.loans.bulkAssign.title')}
        </h2>
        <p className="text-sm text-neutral-600">
          {t('admin.loans.bulkAssign.desc', { count })}
        </p>
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            {t('admin.loans.bulkAssign.bank')}
          </label>
          <select
            value={selectedBankId}
            onChange={e => setSelectedBankId(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('admin.loans.bulkAssign.selectBank')}</option>
            {banksData?.items.map(bank => (
              <option key={bank.bankId} value={bank.bankId}>{bank.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={!selectedBankId || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('admin.loans.bulkAssign.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------

function exportCsv(data: LoanApplicationSummary[]) {
  const headers = ['ID', 'Org', 'Product', 'Amount', 'Tenure', 'Status', 'Bank', 'Submitted', 'Days in stage', 'Owner']
  const rows = data.map(r => [
    r.applicationId,
    r.orgName ?? '',
    r.productName ?? '',
    r.requestedAmount,
    r.tenureMonths,
    r.status,
    r.bankName ?? '',
    r.submittedAt ?? '',
    r.daysInStage ?? '',
    r.assignedOfficer ?? '',
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `loans-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LoansListPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LoanApplicationStatus | ''>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)

  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['loanKpi'],
    queryFn: getLoanKpi,
    retry: 1,
  })

  const { data: applicationsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['loanApplications', { status: statusFilter, search }],
    queryFn: () =>
      listLoanApplications({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
        pageSize: 100,
      }),
    retry: 1,
  })

  const applications = applicationsData?.items ?? []

  const filteredApplications = useMemo(() => {
    if (!search) return applications
    const q = search.toLowerCase()
    return applications.filter(
      a =>
        a.applicationId.toLowerCase().includes(q) ||
        (a.orgName ?? '').toLowerCase().includes(q) ||
        (a.pan ?? '').toLowerCase().includes(q) ||
        (a.gstin ?? '').toLowerCase().includes(q) ||
        (a.bankReferenceNo ?? '').toLowerCase().includes(q)
    )
  }, [applications, search])

  const selectedItems = filteredApplications.filter(a => selectedIds.has(a.applicationId))

  const columns = useMemo<ColumnDef<LoanApplicationSummary>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          aria-label={t('admin.loans.selectAll')}
          className="rounded border-neutral-300"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.applicationId)}
          onChange={() => {
            const id = row.original.applicationId
            setSelectedIds(prev => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          aria-label={t('admin.loans.selectRow')}
          className="rounded border-neutral-300"
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'applicationId',
      header: t('admin.loans.col.id'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-brand-600">{(getValue<string>()).slice(0, 8)}…</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'orgName',
      header: t('admin.loans.col.org'),
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-neutral-900 text-sm">{row.original.orgName ?? '—'}</div>
          {row.original.pan && (
            <div className="text-xs text-neutral-400">{row.original.pan}</div>
          )}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'productName',
      header: t('admin.loans.col.product'),
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.bankName && (
            <span className="text-neutral-500 text-xs">{row.original.bankName} · </span>
          )}
          {row.original.productName ?? '—'}
        </div>
      ),
      size: 220,
    },
    {
      accessorKey: 'requestedAmount',
      header: t('admin.loans.col.amount'),
      cell: ({ getValue }) => (
        <div className="text-right">
          <AmountDisplay amount={getValue<number>()} size="sm" />
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: 'tenureMonths',
      header: t('admin.loans.col.tenure'),
      cell: ({ getValue }) => <span>{getValue<number>()} mo</span>,
      size: 90,
    },
    {
      accessorKey: 'status',
      header: t('admin.loans.col.status'),
      cell: ({ getValue }) => <LoanStatusBadge status={getValue<LoanApplicationStatus>()} />,
      size: 140,
    },
    {
      id: 'bank',
      header: t('admin.loans.col.bank'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{row.original.bankName ?? '—'}</span>
          {row.original.bankAdapterType && (
            <BankAdapterTypeBadge adapterType={row.original.bankAdapterType} />
          )}
        </div>
      ),
      size: 160,
    },
    {
      accessorKey: 'submittedAt',
      header: t('admin.loans.col.submitted'),
      cell: ({ getValue }) => {
        const v = getValue<string | null>()
        return v ? <span className="text-xs text-neutral-600">{formatDate(v)}</span> : <span className="text-neutral-400">—</span>
      },
      size: 130,
    },
    {
      accessorKey: 'daysInStage',
      header: t('admin.loans.col.daysInStage'),
      cell: ({ getValue }) => <DaysInStageCell days={getValue<number | null>()} />,
      size: 110,
    },
    {
      accessorKey: 'assignedOfficer',
      header: t('admin.loans.col.owner'),
      cell: ({ getValue }) => <span className="text-sm">{getValue<string | null>() ?? '—'}</span>,
      size: 140,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); void navigate(`/loans/${row.original.applicationId}`) }}
          aria-label={t('admin.loans.action.view')}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
      size: 48,
    },
  ], [t, navigate, selectedIds])

  const emptyState = (
    <div className="py-16 text-center space-y-3">
      <CreditCard className="h-10 w-10 mx-auto text-neutral-300" aria-hidden="true" />
      <p className="text-neutral-500 font-medium">
        {search || statusFilter
          ? t('admin.loans.emptyFiltered')
          : t('admin.loans.empty')}
      </p>
      {(search || statusFilter) && (
        <button
          type="button"
          className="text-sm text-brand-600 hover:underline"
          onClick={() => { setSearch(''); setStatusFilter('') }}
        >
          {t('admin.loans.clearFilters')}
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.loans.title')}
        subtitle={t('admin.loans.subtitle')}
      />

      {/* KPI strip */}
      <KpiStrip kpi={kpiData} loading={kpiLoading} />

      {/* Error banner */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.loans.loadError')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('admin.loans.searchPlaceholder')}
              className={cn(
                'w-full rounded-lg border border-neutral-200 pl-9 pr-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
                'placeholder:text-neutral-400'
              )}
              aria-label={t('admin.loans.search')}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as LoanApplicationStatus | '')}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label={t('admin.loans.filter.status')}
          >
            <option value="">{t('admin.loans.filter.allStatuses')}</option>
            {(Object.keys(LOAN_STATUS_CONFIG) as LoanApplicationStatus[]).map(s => (
              <option key={s} value={s}>{t(`admin.loans.status.${s.toLowerCase()}`)}</option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => exportCsv(filteredApplications)}
          >
            {t('admin.loans.export')}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void refetch()}
          >
            {t('common.refresh')}
          </Button>
        </div>
      </Card>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <SelectionToolbar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            {
              label: t('admin.loans.bulkAssign.cta'),
              onClick: () => setBulkAssignOpen(true),
              variant: 'primary',
            },
            {
              label: t('admin.loans.bulkExport'),
              onClick: () => exportCsv(selectedItems),
              variant: 'ghost',
            },
          ]}
        />
      )}

      {/* Data table */}
      <DataTable
        data={filteredApplications}
        columns={columns}
        loading={isLoading}
        onRowClick={row => void navigate(`/loans/${row.applicationId}`)}
        emptyState={emptyState}
        pageSize={25}
      />

      {/* Bulk assign modal */}
      {bulkAssignOpen && (
        <BulkAssignModal
          count={selectedIds.size}
          applicationIds={Array.from(selectedIds)}
          onDone={() => { setBulkAssignOpen(false); setSelectedIds(new Set()) }}
          onClose={() => setBulkAssignOpen(false)}
        />
      )}
    </div>
  )
}
