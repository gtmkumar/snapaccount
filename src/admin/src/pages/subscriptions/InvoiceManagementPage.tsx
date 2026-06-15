/**
 * InvoiceManagementPage — Admin invoice list + generate action
 * Route: /subscriptions/invoices
 * GAP-036: Screen 94 — invoice management
 *
 * Wired to: GET /subscriptions/invoices (ListInvoicesQuery — org-scoped)
 * Note: The existing endpoint returns invoices for the CALLER's org.
 * A platform-admin cross-org invoice list would require a new endpoint
 * (similar gap as SubscriberListPage). For now this shows the admin org's
 * own invoices and allows PDF download + invoice generation.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Receipt, Download, Plus, CheckCircle, Clock, AlertCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Can } from '@/components/shared/Can'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { DataTable } from '@/components/ui/DataTable'
import { formatIndianAmount } from '@/lib/utils'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { listInvoices, generateInvoice, getMySubscription, type Invoice } from '@/lib/subscriptionApi'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

// ── Status badge ──────────────────────────────────────────────────────────────

const INVOICE_STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  OVERDUE: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  VOID: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase()
  const color = INVOICE_STATUS_COLORS[upper] ?? 'bg-neutral-100 text-neutral-500'
  const icon = upper === 'PAID'
    ? <CheckCircle className="h-3 w-3" />
    : upper === 'PENDING'
    ? <Clock className="h-3 w-3" />
    : upper === 'OVERDUE'
    ? <AlertCircle className="h-3 w-3" />
    : null

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      {icon}
      {t(`subscriptions.invoiceStatus.${upper.toLowerCase()}`)}
    </span>
  )
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function InvoiceSummaryStrip({ invoices }: { invoices: Invoice[] }) {
  const totalPaid = invoices
    .filter(i => i.status.toUpperCase() === 'PAID')
    .reduce((sum, i) => sum + (i.totalInr ?? i.amountInr + i.gstAmountInr), 0)

  const totalPending = invoices
    .filter(i => i.status.toUpperCase() === 'PENDING')
    .reduce((sum, i) => sum + (i.totalInr ?? i.amountInr + i.gstAmountInr), 0)

  const paidCount = invoices.filter(i => i.status.toUpperCase() === 'PAID').length
  const pendingCount = invoices.filter(i => i.status.toUpperCase() === 'PENDING').length

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        {
          label: t('subscriptions.invoices.totalPaid'),
          value: `₹${formatIndianAmount(totalPaid)}`,
          sub: `${paidCount} ${t('subscriptions.invoices.invoiceCount')}`,
          color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
          icon: CheckCircle,
        },
        {
          label: t('subscriptions.invoices.totalPending'),
          value: `₹${formatIndianAmount(totalPending)}`,
          sub: `${pendingCount} ${t('subscriptions.invoices.invoiceCount')}`,
          color: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
          icon: Clock,
        },
        {
          label: t('subscriptions.invoices.totalInvoices'),
          value: String(invoices.length),
          color: 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
          icon: Receipt,
        },
      ].map(kpi => (
        <Card key={kpi.label} className="flex items-center gap-4">
          <div className={cn('p-3 rounded-xl', kpi.color)}>
            <kpi.icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">{kpi.label}</p>
            <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-[var(--text-tertiary)]">{kpi.sub}</p>}
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceManagementPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: subData } = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscription,
    staleTime: 60_000,
    retry: false,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['subscriptions', 'invoices', page],
    queryFn: () => listInvoices({ page, pageSize }),
    staleTime: 30_000,
  })

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!subData?.subscriptionId) throw new Error('No active subscription')
      return generateInvoice(subData.subscriptionId)
    },
    onSuccess: () => {
      toast.success(t('subscriptions.invoices.generated'))
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'invoices'] })
    },
    onError: () => toast.error(t('subscriptions.invoices.generateError')),
  })

  const allItems = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: 'invoiceNumber',
      header: t('subscriptions.invoices.col.number'),
      cell: ({ getValue }) => (
        <span className="font-mono text-sm font-medium text-[var(--text-primary)]">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('subscriptions.invoices.col.status'),
      cell: ({ getValue }) => <InvoiceStatusBadge status={getValue() as string} />,
    },
    {
      accessorKey: 'amountInr',
      header: t('subscriptions.invoices.col.amount'),
      cell: ({ row }) => {
        const total = row.original.totalInr ?? (row.original.amountInr + row.original.gstAmountInr)
        return (
          <div className="tabular-nums text-sm">
            <span className="font-semibold text-[var(--text-primary)]">₹{formatIndianAmount(total)}</span>
            <span className="text-[var(--text-tertiary)] ml-1 text-xs">
              (+₹{formatIndianAmount(row.original.gstAmountInr)} {t('subscriptions.invoices.gst')})
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'periodStart',
      header: t('subscriptions.invoices.col.period'),
      cell: ({ row }) => {
        const start = row.original.periodStart
        const end = row.original.periodEnd
        if (!start && !end) return <span className="text-[var(--text-tertiary)]">—</span>
        const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        return (
          <span className="text-sm text-[var(--text-secondary)]">
            {start ? fmt(start) : '?'} – {end ? fmt(end) : '?'}
          </span>
        )
      },
    },
    {
      accessorKey: 'paidAt',
      header: t('subscriptions.invoices.col.paidAt'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null | undefined
        if (!v) return <span className="text-[var(--text-tertiary)]">—</span>
        return (
          <span className="text-sm text-[var(--text-secondary)]">
            {new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (!row.original.pdfGcsUri) return null
        return (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => window.open(row.original.pdfGcsUri!, '_blank', 'noopener')}
            aria-label={t('subscriptions.invoices.downloadPdf')}
          >
            {t('subscriptions.invoices.downloadPdf')}
          </Button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <PageHeader
          title={t('subscriptions.invoices.title')}
          subtitle={t('subscriptions.invoices.subtitle')}
        />
        <Can permission="subscription.plan.create">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
            disabled={!subData?.subscriptionId || generateMutation.isPending}
          >
            {t('subscriptions.invoices.generate')}
          </Button>
        </Can>
      </div>

      {!isLoading && allItems.length > 0 && <InvoiceSummaryStrip invoices={allItems} />}

      <Card>
        <CardHeader title={t('subscriptions.invoices.tableTitle')} />
        <ErrorBoundary scope="pane">
          {isLoading ? (
            <Skeleton variant="dataTableDense" />
          ) : isError ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--semantic-error-fg)] mb-2">{t('common.loadError')}</p>
              <Button variant="ghost" size="sm" onClick={() => void refetch()}>{t('common.retry')}</Button>
            </div>
          ) : allItems.length === 0 ? (
            <EmptyState
              variant="generic"
              title={t('subscriptions.invoices.empty')}
              size="md"
            />
          ) : (
            <>
              <DataTable
                data={allItems}
                columns={columns}
                pageSize={pageSize}
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-4">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    {t('common.prev')}
                  </Button>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {t('common.pageOf', { page, total: totalPages })}
                  </span>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    {t('common.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </Card>
    </div>
  )
}
