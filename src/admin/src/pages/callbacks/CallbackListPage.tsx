/**
 * CallbackListPage — Admin Callback Queue
 * Route: /callbacks
 * Phase: 6E — GAP-053: role-gated via route + <Can> for KPI CTA
 */
import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search, BarChart3, PhoneCall, CheckCircle, Clock, Calendar, RotateCcw, ArrowUpCircle, X, Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import { formatRelativeTime, formatDateTime } from '@/lib/utils'
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { t } from '@/i18n'
import {
  listCallbacks,
  type CallbackStatus,
  type CallbackCategory,
  type CallbackPriority,
} from '@/lib/callbackApi'

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------
function CallbackStatusBadge({ status }: { status: CallbackStatus }) {
  const configs: Record<CallbackStatus, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING: {
      label: t('admin.callbacks.status.pending'),
      className: 'bg-warning-100 text-warning-700',
      icon: <Clock className="h-3 w-3" />,
    },
    SCHEDULED: {
      label: t('admin.callbacks.status.scheduled'),
      className: 'bg-info-100 text-info-700',
      icon: <Calendar className="h-3 w-3" />,
    },
    IN_PROGRESS: {
      label: t('admin.callbacks.status.inProgress'),
      className: 'bg-brand-100 text-brand-700',
      icon: <PhoneCall className="h-3 w-3" />,
    },
    COMPLETED: {
      label: t('admin.callbacks.status.completed'),
      className: 'bg-success-100 text-success-700',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    FOLLOW_UP_NEEDED: {
      label: t('admin.callbacks.status.followUpNeeded'),
      className: 'bg-accent-100 text-accent-700',
      icon: <RotateCcw className="h-3 w-3" />,
    },
    ESCALATED_TO_CA: {
      label: t('admin.callbacks.status.escalatedToCa'),
      className: 'bg-error-100 text-error-700',
      icon: <ArrowUpCircle className="h-3 w-3" />,
    },
    CANCELLED: {
      label: t('admin.callbacks.status.cancelled'),
      className: 'bg-neutral-100 text-neutral-500 line-through',
      icon: <X className="h-3 w-3" />,
    },
  }
  const c = configs[status]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', c.className)}>
      {c.icon}
      {c.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: CallbackPriority }) {
  const configs: Record<CallbackPriority, { label: string; className: string }> = {
    LOW: { label: t('admin.callbacks.priority.low'), className: 'border border-neutral-300 text-neutral-500 bg-white' },
    NORMAL: { label: t('admin.callbacks.priority.normal'), className: 'bg-neutral-100 text-neutral-700' },
    HIGH: { label: t('admin.callbacks.priority.high'), className: 'bg-warning-100 text-warning-700' },
    URGENT: { label: t('admin.callbacks.priority.urgent'), className: 'bg-error-100 text-error-700 ring-2 ring-error-300 animate-pulse' },
  }
  const c = configs[priority]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', c.className)}>
      {c.label}
    </span>
  )
}

function CategoryBadge({ category }: { category: CallbackCategory }) {
  const configs: Record<CallbackCategory, { label: string; className: string }> = {
    GST: { label: t('admin.callbacks.category.gst'), className: 'bg-violet-100 text-violet-700' },
    ITR: { label: t('admin.callbacks.category.itr'), className: 'bg-cyan-100 text-cyan-700' },
    DOC: { label: t('admin.callbacks.category.doc'), className: 'bg-indigo-100 text-indigo-700' },
    LOAN: { label: t('admin.callbacks.category.loan'), className: 'bg-orange-100 text-orange-700' },
    BILLING: { label: t('admin.callbacks.category.billing'), className: 'bg-neutral-100 text-neutral-600' },
    OTHER: { label: t('admin.callbacks.category.other'), className: 'bg-neutral-100 text-neutral-400' },
  }
  const c = configs[category]
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', c.className)}>
      {c.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// SLA dot
// ---------------------------------------------------------------------------
function SlaDot({ slaExpiresAt }: { slaExpiresAt: string | null | undefined }) {
  if (!slaExpiresAt) return <span className="text-xs text-neutral-400">—</span>

  const now = Date.now()
  const expires = new Date(slaExpiresAt).getTime()
  const diffMs = expires - now
  const totalWindowMs = 24 * 60 * 60 * 1000 // assume 24h SLA window

  let color: string
  let label: string
  let ariaLabel: string

  if (diffMs < 0) {
    const breachedMins = Math.floor(Math.abs(diffMs) / 60000)
    color = 'bg-error-500'
    label = t('admin.callbacks.sla.breached', { time: `${breachedMins}m` })
    ariaLabel = `SLA breached ${breachedMins} minutes ago`
  } else {
    const remaining = diffMs / totalWindowMs
    if (remaining > 0.5) {
      color = 'bg-success-500'
    } else if (remaining > 0.1) {
      color = 'bg-warning-500'
    } else {
      color = 'bg-error-500'
    }
    const mins = Math.floor(diffMs / 60000)
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    const timeStr = hours > 0 ? `${hours}h ${remMins}m` : `${mins}m`
    label = t('admin.callbacks.sla.remaining', { time: timeStr })
    ariaLabel = `SLA remaining: ${timeStr}`
  }

  return (
    <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', color)} aria-hidden="true" />
      <span className="text-xs text-neutral-600 whitespace-nowrap">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
// "Open" = every non-terminal status (everything except COMPLETED / CANCELLED), matching the
// dashboard "Open Callbacks" stat. These are sent to the Assist API, so they use the BACKEND
// status vocabulary (Pending/Assigned/Confirmed/Escalated), not this client's display labels.
const ALL_OPEN_STATUSES = 'PENDING,ASSIGNED,CONFIRMED,ESCALATED'

export default function CallbackListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? ALL_OPEN_STATUSES)
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? '')
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') ?? '')
  const [assignedFilter, setAssignedFilter] = useState(searchParams.get('assigned') ?? '')
  const [breachedOnly, setBreachedOnly] = useState(searchParams.get('breached') === '1')
  const [page, setPage] = useState(1)
  // DG-ADMIN-10: migrated to shared DataTable density vocabulary ('roomy'|'compact')
  // localStorage key aligned with DataTable pattern: snap_dt_density_{tableId}
  const [density, setDensity] = useState<'roomy' | 'compact'>(() => {
    try {
      // Support legacy 'dense' value from snap_cb_density key
      const legacy = localStorage.getItem('snap_cb_density')
      const shared = localStorage.getItem('snap_dt_density_callbacks')
      const raw = shared ?? legacy
      if (raw === 'dense' || raw === 'compact') return 'compact'
      return 'roomy'
    } catch { return 'roomy' }
  })

  function setDensityPersisted(d: 'roomy' | 'compact') {
    setDensity(d)
    try {
      localStorage.setItem('snap_dt_density_callbacks', d)
      localStorage.removeItem('snap_cb_density') // clean up legacy key
    } catch { /* noop */ }
  }

  const queryParams = useMemo(() => ({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    priority: priorityFilter || undefined,
    assigned: assignedFilter || undefined,
    breached: breachedOnly || undefined,
    q: search || undefined,
    page,
    size: 20,
  }), [statusFilter, categoryFilter, priorityFilter, assignedFilter, breachedOnly, search, page])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['callbacks', queryParams],
    queryFn: () => listCallbacks(queryParams),
    staleTime: 30_000,
  })

  const isFiltered = !!(categoryFilter || priorityFilter || assignedFilter || breachedOnly || search || statusFilter !== ALL_OPEN_STATUSES)

  function clearFilters() {
    setStatusFilter(ALL_OPEN_STATUSES)
    setCategoryFilter('')
    setPriorityFilter('')
    setAssignedFilter('')
    setBreachedOnly(false)
    setSearch('')
    setPage(1)
  }

  const summary = data?.summary

  const rowHeight = density === 'compact' ? 'py-2' : 'py-4'

  // Export the current filtered page to CSV (P-35).
  function handleExport() {
    const rows = data?.items ?? []
    const csv = toCsv(rows, [
      { header: t('admin.callbacks.column.user'), value: c => c.userName },
      { header: t('admin.callbacks.export.col.phone'), value: c => c.userPhone },
      { header: t('admin.callbacks.filter.category'), value: c => c.category },
      { header: t('admin.callbacks.column.priority'), value: c => c.priority },
      { header: t('admin.callbacks.filter.status'), value: c => c.status },
      { header: t('admin.callbacks.column.requested'), value: c => formatDateTime(c.requestedAt) },
      { header: t('admin.callbacks.column.assigned'), value: c => c.assignedAgentName ?? '' },
    ])
    downloadCsv(csvFilename('callbacks'), csv)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.callbacks.title')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleExport}
              disabled={(data?.items?.length ?? 0) === 0}
            >
              {t('admin.callbacks.export')}
            </Button>
            {/* KPI page is Admin/Ops only — CAs can view list but not KPI */}
            <Can anyOf={['callback.kpi.read', 'admin.dashboard.read']}>
              <Button variant="secondary" size="sm" leftIcon={<BarChart3 className="h-4 w-4" />} onClick={() => void navigate('/callbacks/kpi')}>
                {t('admin.callbacks.cta.kpi')}
              </Button>
            </Can>
          </div>
        }
      />

      {/* Stats strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('admin.callbacks.stats.open'), value: summary.open, highlight: summary.open > 20 ? 'text-warning-600' : 'text-[var(--text-primary)]' },
            { label: t('admin.callbacks.stats.scheduled'), value: summary.scheduled, highlight: 'text-[var(--text-primary)]' },
            { label: t('admin.callbacks.stats.breached'), value: summary.breached, highlight: summary.breached > 0 ? 'text-error-600' : 'text-[var(--text-primary)]' },
            {
              label: t('admin.callbacks.stats.avgTtr'),
              value: (() => {
                const mins = summary.avgTtrMinutes
                if (mins < 60) return `${mins}m`
                return `${Math.floor(mins / 60)}h ${mins % 60}m`
              })(),
              highlight: 'text-[var(--text-primary)]'
            },
          ].map((s) => (
            <Card key={s.label} padding="sm">
              <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
              <p className={cn('text-2xl font-bold mt-1', s.highlight)}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-64">
            <Input
              placeholder={t('admin.callbacks.filter.search')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
            />
          </div>

          {[
            {
              label: t('admin.callbacks.filter.status'),
              value: statusFilter,
              setter: (v: string) => { setStatusFilter(v); setPage(1) },
              options: [
                { value: ALL_OPEN_STATUSES, label: 'All Open' },
                { value: 'PENDING', label: t('admin.callbacks.status.pending') },
                { value: 'SCHEDULED', label: t('admin.callbacks.status.scheduled') },
                { value: 'IN_PROGRESS', label: t('admin.callbacks.status.inProgress') },
                { value: 'COMPLETED', label: t('admin.callbacks.status.completed') },
                { value: 'FOLLOW_UP_NEEDED', label: t('admin.callbacks.status.followUpNeeded') },
                { value: 'ESCALATED_TO_CA', label: t('admin.callbacks.status.escalatedToCa') },
                { value: 'CANCELLED', label: t('admin.callbacks.status.cancelled') },
              ],
            },
            {
              label: t('admin.callbacks.filter.category'),
              value: categoryFilter,
              setter: (v: string) => { setCategoryFilter(v); setPage(1) },
              options: [
                { value: '', label: 'All categories' },
                { value: 'GST', label: t('admin.callbacks.category.gst') },
                { value: 'ITR', label: t('admin.callbacks.category.itr') },
                { value: 'DOC', label: t('admin.callbacks.category.doc') },
                { value: 'LOAN', label: t('admin.callbacks.category.loan') },
                { value: 'BILLING', label: t('admin.callbacks.category.billing') },
                { value: 'OTHER', label: t('admin.callbacks.category.other') },
              ],
            },
            {
              label: t('admin.callbacks.filter.priority'),
              value: priorityFilter,
              setter: (v: string) => { setPriorityFilter(v); setPage(1) },
              options: [
                { value: '', label: 'All priorities' },
                { value: 'URGENT', label: t('admin.callbacks.priority.urgent') },
                { value: 'HIGH', label: t('admin.callbacks.priority.high') },
                { value: 'NORMAL', label: t('admin.callbacks.priority.normal') },
                { value: 'LOW', label: t('admin.callbacks.priority.low') },
              ],
            },
          ].map((f) => (
            <div key={f.label}>
              <label className="text-xs font-medium text-neutral-500 block mb-1">{f.label}</label>
              <select
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                aria-label={f.label}
                className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              >
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}

          <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 self-end pb-0.5">
            <input
              type="checkbox"
              checked={breachedOnly}
              onChange={e => { setBreachedOnly(e.target.checked); setPage(1) }}
              className="h-4 w-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
            />
            {t('admin.callbacks.filter.breachedOnly')}
          </label>

          {isFiltered && (
            <button onClick={clearFilters} className="text-xs text-brand-600 hover:underline self-end pb-1">
              {t('admin.callbacks.filter.clearAll')}
            </button>
          )}

          {/* Density toggle — DG-ADMIN-10: aligned with shared DataTable 'roomy'|'compact' vocabulary */}
          <div className="ml-auto flex gap-1 self-end" role="group" aria-label={t('dataTable.density.label')}>
            {(['roomy', 'compact'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDensityPersisted(d)}
                aria-pressed={density === d}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  density === d ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                )}
              >
                {t(d === 'roomy' ? 'dataTable.density.roomy' : 'dataTable.density.compact')}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <div className="hidden md:block">
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Callback queue">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.user')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.category')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.priority')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.status')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.requested')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    {t('admin.callbacks.column.sla')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                    {t('admin.callbacks.column.assigned')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-neutral-100 animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 bg-neutral-100 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                )}

                {isError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-sm text-error-600 mb-2">Failed to load callbacks.</p>
                      <button onClick={() => void refetch()} className="text-xs text-brand-600 hover:underline">
                        Retry
                      </button>
                    </td>
                  </tr>
                )}

                {!isLoading && !isError && (data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <p className="text-sm font-medium text-neutral-900">{t('admin.callbacks.empty.title')}</p>
                      <p className="text-sm text-neutral-500 mt-1">
                        {isFiltered ? t('admin.callbacks.emptyFiltered.body') : t('admin.callbacks.empty.body')}
                      </p>
                      {isFiltered && (
                        <button onClick={clearFilters} className="mt-2 text-xs text-brand-600 hover:underline">
                          {t('admin.callbacks.filter.clearAll')}
                        </button>
                      )}
                    </td>
                  </tr>
                )}

                {!isLoading && (data?.items ?? []).map((cb) => (
                  <tr
                    key={cb.id}
                    className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors"
                    onClick={() => void navigate(`/callbacks/${cb.id}`)}
                  >
                    <td className={cn('px-4', rowHeight)}>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {cb.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-neutral-800 text-sm">{cb.userName}</p>
                          {density === 'roomy' && (
                            <p className="font-mono text-xs text-neutral-400">{cb.userPhone}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={cn('px-4', rowHeight)}>
                      <CategoryBadge category={cb.category} />
                    </td>
                    <td className={cn('px-4', rowHeight)}>
                      <PriorityBadge priority={cb.priority} />
                    </td>
                    <td className={cn('px-4', rowHeight)}>
                      <CallbackStatusBadge status={cb.status} />
                    </td>
                    <td className={cn('px-4', rowHeight)}>
                      <span
                        className="text-sm text-neutral-600 cursor-default"
                        title={formatDateTime(cb.requestedAt)}
                      >
                        {formatRelativeTime(cb.requestedAt)}
                      </span>
                    </td>
                    <td className={cn('px-4', rowHeight)}>
                      <SlaDot slaExpiresAt={cb.slaExpiresAt} />
                    </td>
                    <td className={cn('px-4', rowHeight, 'hidden lg:table-cell')}>
                      {cb.assignedAgentName
                        ? <span className="text-sm text-neutral-600">{cb.assignedAgentName}</span>
                        : <span className="text-sm text-warning-600 font-medium">Unassigned</span>}
                    </td>
                    <td className={cn('px-4', rowHeight)} onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void navigate(`/callbacks/${cb.id}`)}
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-neutral-500">
                Page {page} of {Math.ceil(data.total / 20)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= Math.ceil(data.total / 20)}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {isLoading && (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-neutral-100 rounded-xl animate-pulse" />
          ))
        )}
        {!isLoading && (data?.items ?? []).map((cb) => (
          <button
            key={cb.id}
            className="w-full text-left"
            onClick={() => void navigate(`/callbacks/${cb.id}`)}
          >
            <Card padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-neutral-900">{cb.userName}</span>
                    <CategoryBadge category={cb.category} />
                  </div>
                  <div className="flex items-center gap-2">
                    <CallbackStatusBadge status={cb.status} />
                    <PriorityBadge priority={cb.priority} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-neutral-400">{formatRelativeTime(cb.requestedAt)}</p>
                  <SlaDot slaExpiresAt={cb.slaExpiresAt} />
                </div>
              </div>
            </Card>
          </button>
        ))}
        {!isLoading && (data?.items ?? []).length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm font-medium text-neutral-900">{t('admin.callbacks.empty.title')}</p>
            <p className="text-sm text-neutral-500 mt-1">{t('admin.callbacks.empty.body')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
