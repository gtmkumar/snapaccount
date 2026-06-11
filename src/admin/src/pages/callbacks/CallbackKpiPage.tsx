/**
 * CallbackKpiPage — Admin Callback KPI Dashboard
 * Route: /callbacks/kpi
 * Phase: 6E
 * TODO Phase 6F: role-gate to Admin + Ops Lead only; CAs see limited view
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { t } from '@/i18n'
import { getCallbackKpi, type CallbackCategory } from '@/lib/callbackApi'

// ---------------------------------------------------------------------------
// Color maps (matching StatusBadge token mapping)
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',       // warning-500
  SCHEDULED: '#3b82f6',     // info-500
  IN_PROGRESS: '#6366f1',   // brand-500
  FOLLOW_UP_NEEDED: '#8b5cf6', // accent-500
  ESCALATED_TO_CA: '#ef4444', // error-500
  COMPLETED: '#10b981',     // success-500 (emerald — canonical S0 token)
  CANCELLED: '#9ca3af',     // neutral-400
}

const CATEGORY_COLORS: Record<CallbackCategory, string> = {
  GST: '#7c3aed',   // violet
  ITR: '#0891b2',   // cyan
  DOC: '#4f46e5',   // indigo
  LOAN: '#ea580c',  // orange
  BILLING: '#4b5563', // neutral-600
  OTHER: '#9ca3af', // neutral-400
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------
type RangeOption = '24h' | '7d' | '30d' | 'fy'

function MetricCard({
  title,
  value,
  delta,
  deltaSuffix = '',
  higherIsBetter = true,
  unit = '',
  onClick,
}: {
  title: string
  value: string | number
  delta: number
  deltaSuffix?: string
  higherIsBetter?: boolean
  unit?: string
  onClick?: () => void
}) {
  const isPositive = higherIsBetter ? delta >= 0 : delta <= 0
  const deltaColor = isPositive ? 'text-success-600' : 'text-error-600'
  const DeltaIcon = delta >= 0 ? TrendingUp : TrendingDown

  return (
    <button
      className="block w-full text-left"
      onClick={onClick}
      disabled={!onClick}
    >
      <Card className="hover:shadow-md transition-shadow h-full">
        <p className="text-xs text-neutral-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-neutral-900 mt-1">
          {value}{unit && <span className="text-base font-normal text-neutral-500 ml-1">{unit}</span>}
        </p>
        <div className={cn('flex items-center gap-1 mt-2', deltaColor)}>
          <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          <span className="text-xs font-medium">
            {delta >= 0 ? '+' : ''}{delta}{deltaSuffix} vs last period
          </span>
          <span className="sr-only">
            {isPositive ? 'up' : 'down'} {Math.abs(delta)} vs last period
          </span>
        </div>
      </Card>
    </button>
  )
}

// ---------------------------------------------------------------------------
// TTR formatter
// ---------------------------------------------------------------------------
function formatTtr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function CallbackKpiPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<RangeOption>('7d')
  const [lastRefresh] = useState(new Date())

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['callback-kpi', range],
    queryFn: () => getCallbackKpi({ range }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const rangeOptions: { value: RangeOption; label: string }[] = [
    { value: '24h', label: t('admin.callbacks.kpi.range.24h') },
    { value: '7d', label: t('admin.callbacks.kpi.range.7d') },
    { value: '30d', label: t('admin.callbacks.kpi.range.30d') },
    { value: 'fy', label: t('admin.callbacks.kpi.range.fy') },
  ]

  const isEmpty = !isLoading && !isError && data && data.open === 0 && data.completed === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.callbacks.kpi.title')}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">
              {t('admin.callbacks.kpi.updatedAgo', { time: formatRelativeTime(lastRefresh) })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {t('admin.callbacks.kpi.refresh')}
            </Button>
            {/* Range selector */}
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
              aria-label="Date range"
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
            >
              {rangeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        }
      />

      {isError && (
        <div className="text-center py-12">
          <p className="text-sm text-error-600">Failed to load KPI data.</p>
          <button onClick={() => void refetch()} className="mt-2 text-xs text-brand-600 hover:underline">Retry</button>
        </div>
      )}

      {isEmpty && (
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-neutral-900">{t('admin.callbacks.kpi.empty.title')}</p>
          <p className="text-sm text-neutral-500 mt-1">{t('admin.callbacks.kpi.empty.body')}</p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-neutral-100 rounded-xl animate-pulse" />
            ))
          : data && (
            <>
              <MetricCard
                title={t('admin.callbacks.kpi.metric.open')}
                value={data.open}
                delta={data.deltas.open}
                higherIsBetter={false}
                onClick={() => void navigate('/callbacks?status=PENDING,SCHEDULED,IN_PROGRESS')}
              />
              <MetricCard
                title={t('admin.callbacks.kpi.metric.avgTtr')}
                value={formatTtr(data.avgTtrSeconds)}
                delta={Math.round(data.deltas.avgTtrSeconds / 60)}
                deltaSuffix="m"
                higherIsBetter={false}
                onClick={() => void navigate('/callbacks?status=COMPLETED')}
              />
              <MetricCard
                title={t('admin.callbacks.kpi.metric.slaCompliance')}
                value={data.slaCompliance === 100 ? '100' : data.slaCompliance.toFixed(1)}
                unit="%"
                delta={Number(data.deltas.slaCompliance.toFixed(1))}
                deltaSuffix=" pp"
                higherIsBetter
                onClick={() => void navigate('/callbacks?breached=1')}
              />
              <MetricCard
                title={t('admin.callbacks.kpi.metric.completed')}
                value={data.completed}
                delta={data.deltas.completed}
                higherIsBetter
                onClick={() => void navigate('/callbacks?status=COMPLETED')}
              />
            </>
          )}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Status distribution */}
        <Card>
          <CardHeader title={t('admin.callbacks.kpi.chart.statusDist')} />
          {isLoading
            ? <div className="h-48 bg-neutral-100 rounded animate-pulse" />
            : data && data.statusDistribution.length > 0
              ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.statusDistribution} aria-label={t('admin.callbacks.kpi.chart.statusDist')}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {Object.keys(STATUS_COLORS).map(s => (
                      <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )
              : <p className="text-sm text-neutral-400 py-8 text-center">No data</p>}
        </Card>

        {/* Daily volume */}
        <Card>
          <CardHeader title={t('admin.callbacks.kpi.chart.dailyVolume')} />
          {isLoading
            ? <div className="h-48 bg-neutral-100 rounded animate-pulse" />
            : data && data.dailyVolume.length > 0
              ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={data.dailyVolume} aria-label={t('admin.callbacks.kpi.chart.dailyVolume')}>
                    <defs>
                      <linearGradient id="requested-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="requested"
                      name={t('admin.callbacks.kpi.chart.seriesRequested')}
                      stroke="#6366f1"
                      fill="url(#requested-gradient)"
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      name={t('admin.callbacks.kpi.chart.seriesCompleted')}
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )
              : <p className="text-sm text-neutral-400 py-8 text-center">No data</p>}
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* TTR histogram */}
        <Card>
          <CardHeader title={t('admin.callbacks.kpi.chart.ttrHistogram')} />
          {isLoading
            ? <div className="h-48 bg-neutral-100 rounded animate-pulse" />
            : data && data.ttrHistogram.length > 0
              ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.ttrHistogram} aria-label={t('admin.callbacks.kpi.chart.ttrHistogram')}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Callbacks">
                      {data.ttrHistogram.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.withinSla ? '#10b981' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
              : <p className="text-sm text-neutral-400 py-8 text-center">No data</p>}
        </Card>

        {/* Category mix donut */}
        <Card>
          <CardHeader title={t('admin.callbacks.kpi.chart.categoryMix')} />
          {isLoading
            ? <div className="h-48 bg-neutral-100 rounded animate-pulse" />
            : data && data.categoryMix.length > 0
              ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="60%" height={200}>
                    <PieChart aria-label={t('admin.callbacks.kpi.chart.categoryMix')}>
                      <Pie
                        data={data.categoryMix}
                        dataKey="count"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                      >
                        {data.categoryMix.map((entry) => (
                          <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {data.categoryMix.map(entry => (
                      <div key={entry.category} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: CATEGORY_COLORS[entry.category] }}
                        />
                        <span className="text-xs text-neutral-600">{entry.category}</span>
                        <span className="text-xs font-semibold text-neutral-900 ml-auto">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
              : <p className="text-sm text-neutral-400 py-8 text-center">No data</p>}
        </Card>
      </div>

      {/* Team performance table */}
      <Card>
        <CardHeader title={t('admin.callbacks.kpi.team.title')} />
        {isLoading
          ? <div className="h-32 bg-neutral-100 rounded animate-pulse" />
          : data && data.teamPerformance.length > 0
            ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label={t('admin.callbacks.kpi.team.title')}>
                  <thead>
                    <tr className="border-b border-neutral-100">
                      {[
                        t('admin.callbacks.kpi.team.col.handler'),
                        t('admin.callbacks.kpi.team.col.assigned'),
                        t('admin.callbacks.kpi.team.col.completed'),
                        t('admin.callbacks.kpi.team.col.avgTtr'),
                        t('admin.callbacks.kpi.team.col.sla'),
                        t('admin.callbacks.kpi.team.col.followUps'),
                      ].map(h => (
                        <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamPerformance.map(agent => (
                      <tr
                        key={agent.agentId}
                        className="border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer"
                        onClick={() => void navigate(`/callbacks?assigned=${agent.agentId}`)}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                              {agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-neutral-800">{agent.agentName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-neutral-600">{agent.assigned}</td>
                        <td className="px-3 py-3 text-neutral-600">{agent.completed}</td>
                        <td className="px-3 py-3 text-neutral-600">{agent.avgTtrMinutes}m</td>
                        <td className="px-3 py-3">
                          <span className={cn(
                            'font-semibold',
                            agent.slaPercent >= 95 ? 'text-success-600' :
                            agent.slaPercent >= 85 ? 'text-warning-600' :
                            'text-error-600'
                          )}>
                            {agent.slaPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-neutral-600">{agent.followUps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p className="text-sm text-neutral-400 py-4 text-center">No data for this range.</p>}
      </Card>

      {/* SLA breaches table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardHeader title={t('admin.callbacks.kpi.breaches.title')} />
          <button
            onClick={() => void navigate('/callbacks?breached=1')}
            className="text-xs text-brand-600 hover:underline"
          >
            {t('admin.callbacks.kpi.breaches.viewAll')}
          </button>
        </div>
        {isLoading
          ? <div className="h-32 bg-neutral-100 rounded animate-pulse" />
          : data && data.slaBreaches.length > 0
            ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label={t('admin.callbacks.kpi.breaches.title')}>
                  <thead>
                    <tr className="border-b border-neutral-100">
                      {[
                        t('admin.callbacks.kpi.breaches.col.callback'),
                        t('admin.callbacks.kpi.breaches.col.user'),
                        t('admin.callbacks.kpi.breaches.col.category'),
                        t('admin.callbacks.kpi.breaches.col.breach'),
                        t('admin.callbacks.kpi.breaches.col.resolvedIn'),
                      ].map(h => (
                        <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slaBreaches.slice(0, 20).map(breach => (
                      <tr
                        key={breach.callbackId}
                        className="border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer"
                        onClick={() => void navigate(`/callbacks/${breach.callbackId}`)}
                      >
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-brand-600">#{breach.callbackId.slice(0, 8)}</span>
                        </td>
                        <td className="px-3 py-3 text-neutral-700">{breach.userName}</td>
                        <td className="px-3 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ background: CATEGORY_COLORS[breach.category] }}
                          >
                            {breach.category}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-error-600 font-semibold text-xs">+{breach.breachMinutes}m past SLA</span>
                        </td>
                        <td className="px-3 py-3 text-neutral-600">
                          {breach.resolvedInMinutes != null ? `${breach.resolvedInMinutes}m` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p className="text-sm text-neutral-400 py-4 text-center">No SLA breaches in this range.</p>}
      </Card>
    </div>
  )
}
