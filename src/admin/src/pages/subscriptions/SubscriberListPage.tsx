/**
 * SubscriberListPage — Platform-admin view of all active subscribers
 * Route: /subscriptions/subscribers
 * GAP-036: Screens 92/94 — subscriber list + link to invoice view
 *
 * BLOCKED (backend): GET /subscriptions/admin/list does not yet exist.
 * The page renders an "endpoint not available" state until backend-agent
 * ships the ListAllSubscriptionsQuery (subscription.plan.create permission).
 * The MRR by-plan breakdown IS available and is shown as a secondary panel.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Users, TrendingUp, AlertCircle, PauseCircle, XCircle,
  Search, RefreshCw, Receipt,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Can } from '@/components/shared/Can'
import { DataTable } from '@/components/ui/DataTable'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { formatIndianAmount } from '@/lib/utils'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  listAllSubscriptions,
  getMrrDashboard,
  type SubscriptionStatus,
  type PlanTier,
  type SubscriberRow,
} from '@/lib/subscriptionApi'
import type { ColumnDef } from '@tanstack/react-table'

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  TRIALING: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  PAST_DUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CANCELLED: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  PAUSED: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const labelKey = `subscriptions.status.${status.toLowerCase()}` as const
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[status])}>
      {t(labelKey)}
    </span>
  )
}

const TIER_COLORS: Record<string, string> = {
  Free: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  Starter: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  Growth: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Enterprise: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', TIER_COLORS[tier] ?? '')}>
      {tier}
    </span>
  )
}

// ── By-plan MRR panel ─────────────────────────────────────────────────────────

function ByPlanPanel() {
  const { data: mrr, isLoading } = useQuery({
    queryKey: ['subscriptions', 'mrr'],
    queryFn: getMrrDashboard,
    staleTime: 60_000,
  })

  const byPlan = mrr?.byPlan ?? []

  return (
    <Card>
      <CardHeader title={t('subscriptions.byPlan.title')} />
      {isLoading ? (
        <Skeleton variant="list" />
      ) : byPlan.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{t('subscriptions.byPlan.empty')}</p>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {byPlan.map(p => (
            <div key={p.planName} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <TierBadge tier={p.tier} />
                <span className="text-sm font-medium text-[var(--text-primary)]">{p.planName}</span>
              </div>
              <div className="flex items-center gap-4 text-sm tabular-nums">
                <span className="text-[var(--text-secondary)]">
                  {p.subscriberCount} {t('subscriptions.byPlan.subs')}
                </span>
                <span className="font-semibold text-[var(--text-primary)]">
                  ₹{formatIndianAmount(p.mrr)}{t('subscriptions.byPlan.perMonth')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiStrip() {
  const { data: mrr, isLoading } = useQuery({
    queryKey: ['subscriptions', 'mrr'],
    queryFn: getMrrDashboard,
    staleTime: 60_000,
  })

  const kpis = [
    {
      label: t('subscriptions.active'),
      value: String(mrr?.activeSubscriptions ?? 0),
      icon: Users,
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      label: t('subscriptions.mrr'),
      value: `₹${formatIndianAmount(mrr?.totalMrr ?? 0)}`,
      icon: TrendingUp,
      color: 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
    },
    {
      label: t('subscriptions.pastDue'),
      value: String(mrr?.pastDueSubscriptions ?? 0),
      icon: AlertCircle,
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    },
    {
      label: t('subscriptions.cancelled'),
      value: String(mrr?.cancelledThisMonth ?? 0),
      icon: XCircle,
      color: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(k => (
        <Card key={k.label} className="flex items-center gap-4">
          {isLoading ? (
            <Skeleton variant="card" />
          ) : (
            <>
              <div className={cn('p-3 rounded-xl', k.color)}>
                <k.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{k.label}</p>
                <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{k.value}</p>
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'PAUSED']
const TIERS: PlanTier[] = ['Free', 'Starter', 'Growth', 'Enterprise']

export default function SubscriberListPage() {
  const navigate = useNavigate()

  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')
  const [tierFilter, setTierFilter] = useState<PlanTier | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const queryParams = useMemo(() => ({
    status: statusFilter || undefined,
    tier: tierFilter || undefined,
    q: search || undefined,
    page,
    pageSize: 25,
  }), [statusFilter, tierFilter, search, page])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['subscriptions', 'admin-list', queryParams],
    queryFn: () => listAllSubscriptions(queryParams),
    staleTime: 30_000,
    retry: false,
  })

  // Detect 404 (endpoint not yet deployed) vs other errors
  const isEndpointMissing = isError && (
    // axios 404 or 501
    (error as { response?: { status?: number } })?.response?.status === 404 ||
    (error as { response?: { status?: number } })?.response?.status === 501
  )

  const columns: ColumnDef<SubscriberRow>[] = [
    {
      accessorKey: 'organizationName',
      header: t('subscriptions.col.org'),
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm text-[var(--text-primary)]">{row.original.organizationName}</p>
          <p className="text-xs text-[var(--text-tertiary)] font-mono">{row.original.organizationId.slice(0, 8)}…</p>
        </div>
      ),
    },
    {
      accessorKey: 'planName',
      header: t('subscriptions.col.plan'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TierBadge tier={row.original.tier} />
          <span className="text-sm text-[var(--text-primary)]">{row.original.planName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('subscriptions.col.status'),
      cell: ({ getValue }) => <StatusBadge status={getValue() as SubscriptionStatus} />,
    },
    {
      accessorKey: 'mrr',
      header: t('subscriptions.col.mrr'),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm font-medium text-[var(--text-primary)]">
          {getValue() != null ? `₹${formatIndianAmount(getValue() as number)}` : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'currentPeriodEnd',
      header: t('subscriptions.col.periodEnd'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null | undefined
        if (!v) return <span className="text-[var(--text-tertiary)]">—</span>
        return <span className="text-sm text-[var(--text-secondary)]">{new Date(v).toLocaleDateString('en-IN')}</span>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate(`/subscriptions/invoices/${row.original.subscriptionId}`)}
          aria-label={t('subscriptions.col.viewInvoices')}
        >
          <Receipt className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const clearFilters = () => {
    setStatusFilter('')
    setTierFilter('')
    setSearch('')
    setPage(1)
  }

  const isFiltered = !!(statusFilter || tierFilter || search)

  return (
    <Can permission="subscription.plan.create" fallback={
      <EmptyState variant="generic" title={t('common.forbidden')} size="md" />
    }>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PageHeader
            title={t('subscriptions.subscribers.title')}
            subtitle={t('subscriptions.subscribers.subtitle')}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void refetch()}
          >
            {t('common.refresh')}
          </Button>
        </div>

        <KpiStrip />

        {/* Subscriber list */}
        <Card>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-[var(--text-disabled)]" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder={t('subscriptions.subscribers.search')}
                className="pl-9 pr-3 h-9 w-56 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                {t('subscriptions.subscribers.filterStatus')}
              </label>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value as SubscriptionStatus | ''); setPage(1) }}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
              >
                <option value="">{t('subscriptions.subscribers.allStatuses')}</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{t(`subscriptions.status.${s.toLowerCase()}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                {t('subscriptions.subscribers.filterTier')}
              </label>
              <select
                value={tierFilter}
                onChange={e => { setTierFilter(e.target.value as PlanTier | ''); setPage(1) }}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
              >
                <option value="">{t('subscriptions.subscribers.allTiers')}</option>
                {TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </div>

            {isFiltered && (
              <button onClick={clearFilters} className="text-xs text-[var(--color-brand-500)] hover:underline self-end pb-1">
                {t('common.clearFilters')}
              </button>
            )}
          </div>

          <ErrorBoundary scope="pane">
            {isEndpointMissing ? (
              <div className="py-10 text-center space-y-3">
                <PauseCircle className="h-10 w-10 text-[var(--text-disabled)] mx-auto" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t('subscriptions.subscribers.endpointMissing.title')}
                </p>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  {t('subscriptions.subscribers.endpointMissing.body')}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] font-mono">
                  GET /subscriptions/admin/list — GAP-036 (backend-agent)
                </p>
              </div>
            ) : isError ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[var(--semantic-error-fg)] mb-2">{t('common.loadError')}</p>
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>{t('common.retry')}</Button>
              </div>
            ) : isLoading ? (
              <Skeleton variant="dataTableDense" />
            ) : !data?.items.length ? (
              <EmptyState
                variant="generic"
                title={t('subscriptions.subscribers.empty')}
                size="md"
              />
            ) : (
              <>
                <DataTable
                  data={data.items}
                  columns={columns}
                  pageSize={25}
                />
                {data.totalCount > 25 && (
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                      {t('common.prev')}
                    </Button>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {t('common.pageOf', { page, total: Math.ceil(data.totalCount / 25) })}
                    </span>
                    <Button variant="secondary" size="sm" disabled={page >= Math.ceil(data.totalCount / 25)} onClick={() => setPage(p => p + 1)}>
                      {t('common.next')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </ErrorBoundary>
        </Card>

        {/* By-plan breakdown from MRR endpoint (available now) */}
        <ByPlanPanel />
      </div>
    </Can>
  )
}
