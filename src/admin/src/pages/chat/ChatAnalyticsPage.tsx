/**
 * ChatAnalyticsPage — Screen 83 (DG-CHAT-09)
 * Chat performance metrics: queue health, CA workload, category distribution, peak-hours heatmap.
 * Routes: /chat/analytics
 * Perm: admin.dashboard.read (SUPER_ADMIN, OPERATIONS_MANAGER)
 *
 * Backend endpoints used:
 *   GET /chat/admin/queue-snapshot      — QueueItem[] (open unassigned threads, wait times)
 *   GET /chat/admin/workload-by-user    — UserWorkloadDto[] (per-CA assigned/completed counts)
 *   GET /chat/threads (aggregated)      — category distribution, total counts
 *
 * Analytics that require dedicated backend aggregation endpoints (response-time
 * histogram, CSAT, escalation %, CSAT trend, peak-hours heatmap) use dev/mock
 * data with a banner noting they need a backend analytics endpoint.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  Star,
  TrendingUp,
  Users,
  Download,
  AlertCircle,
} from 'lucide-react'
import { t } from '@/i18n'
import { MetricCard } from '@/components/shared/MetricCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { cn } from '@/lib/utils'
import { getChatQueueSnapshot, getChatWorkloadByUser, listThreads } from '@/lib/chatApi'

// ── Types ────────────────────────────────────────────────────────────────────

type RangePeriod = '7d' | '30d' | '90d' | 'custom'

// Category colours for table
const CATEGORY_COLOURS: Record<string, string> = {
  'tax-query':       '#6366f1',
  'gst-notice':      '#f59e0b',
  'loan':            '#10b981',
  'general':         '#3b82f6',
  'feature-request': '#8b5cf6',
  'bug':             '#ef4444',
}

const HOURS_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`)
const DAYS_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Mock peak-hour heatmap data (7 days × 24 hours) — real data needs backend endpoint
function buildMockHeatmap(): number[][] {
  // Stable pseudo-random so it doesn't flash on re-render
  const seed = (n: number) => Math.abs(Math.sin(n) * 43758.5453) % 1
  return DAYS_LABELS.map((_, dayIdx) =>
    HOURS_LABELS.map((_, hour) => {
      const isWeekday = dayIdx < 5
      const isBusinessHour = hour >= 9 && hour < 18
      const base = isWeekday && isBusinessHour ? 0.55 : 0.12
      return Math.min(1, base + seed(dayIdx * 24 + hour) * 0.35)
    })
  )
}

const MOCK_HEATMAP = buildMockHeatmap()

// Mock CSAT weekly trend (12 weeks) — stable seed
const MOCK_CSAT_TREND = Array.from({ length: 12 }, (_, i) => {
  const now = new Date('2026-06-28')
  const week = new Date(now.getTime() - (11 - i) * 7 * 24 * 3600 * 1000)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const score = 3.5 + (Math.abs(Math.sin(i * 1.7)) * 1.2)
  return { week, score }
})

// Response-time buckets (mock)
const RESPONSE_BUCKETS = [
  { label: '< 5m', count: 42 },
  { label: '5–10m', count: 68 },
  { label: '10–15m', count: 55 },
  { label: '15–30m', count: 29 },
  { label: '30–60m', count: 14 },
  { label: '> 60m', count: 6 },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineBar({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: colour }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-600 w-6 text-right">{pct}%</span>
    </div>
  )
}

function PeakHoursHeatmap() {
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Hour axis — every 3 hours */}
        <div className="flex pl-10 mb-0.5">
          {HOURS_LABELS.map((h, i) => (
            i % 6 === 0
              ? <div key={h} style={{ flex: `${6}` }} className="text-[10px] text-neutral-400">{h}</div>
              : null
          ))}
        </div>
        {DAYS_LABELS.map((day, dayIdx) => (
          <div key={day} className="flex items-center gap-px mt-px">
            <span className="text-[10px] text-neutral-500 w-9 text-right pr-1 shrink-0">{day}</span>
            {MOCK_HEATMAP[dayIdx].map((v, hourIdx) => (
              <div
                key={hourIdx}
                className="h-5 rounded-sm flex-1 transition-colors"
                style={{ backgroundColor: `rgba(99,102,241,${v.toFixed(2)})` }}
                title={`${day} ${HOURS_LABELS[hourIdx]}: ${Math.round(v * 100)}% volume`}
                role="img"
                aria-label={`${day} ${HOURS_LABELS[hourIdx]}: ${Math.round(v * 100)}%`}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[10px] text-neutral-400">{t('chatAnalytics.heatmap.low')}</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
            <div key={v} className="h-3 w-4 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${v})` }} />
          ))}
          <span className="text-[10px] text-neutral-400">{t('chatAnalytics.heatmap.high')}</span>
        </div>
      </div>
    </div>
  )
}

function CsatSparkline() {
  const max = 5
  const min = 3
  const range = max - min
  const W = 40
  const H = 60

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${MOCK_CSAT_TREND.length * W} ${H}`}
        className="w-full h-28"
        preserveAspectRatio="none"
        aria-label={t('chatAnalytics.csat.trend')}
        role="img"
      >
        <defs>
          <linearGradient id="csat-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={[
            `M 0 ${H - ((MOCK_CSAT_TREND[0].score - min) / range) * H}`,
            ...MOCK_CSAT_TREND.slice(1).map((p, i) =>
              `L ${(i + 1) * W} ${H - ((p.score - min) / range) * H}`
            ),
            `L ${(MOCK_CSAT_TREND.length - 1) * W} ${H} L 0 ${H} Z`,
          ].join(' ')}
          fill="url(#csat-gradient)"
        />
        <polyline
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          points={MOCK_CSAT_TREND.map((p, i) =>
            `${i * W},${H - ((p.score - min) / range) * H}`
          ).join(' ')}
        />
        {MOCK_CSAT_TREND.map((p, i) => (
          <circle key={i} cx={i * W} cy={H - ((p.score - min) / range) * H} r="3" fill="#6366f1" />
        ))}
      </svg>
      {/* X labels every 3 weeks */}
      <div className="flex justify-between">
        {MOCK_CSAT_TREND.filter((_, i) => i % 3 === 0).map((p, i) => (
          <span key={i} className="text-[10px] text-neutral-400">{p.week}</span>
        ))}
      </div>
    </div>
  )
}

function ResponseHistogram() {
  const maxCount = Math.max(...RESPONSE_BUCKETS.map(b => b.count))
  return (
    <div
      className="space-y-1.5"
      role="img"
      aria-label={t('chatAnalytics.responseHist.aria')}
    >
      {RESPONSE_BUCKETS.map((b, i) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 w-14 text-right shrink-0">{b.label}</span>
          <div className="flex-1 relative h-5 bg-neutral-100 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${(b.count / maxCount) * 100}%`,
                backgroundColor: i >= 3 ? '#f87171' : '#818cf8',
              }}
            />
          </div>
          <span className="text-xs tabular-nums text-neutral-600 w-6 text-right">{b.count}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <div className="h-0 w-6 border-t-2 border-dashed border-amber-500" />
        <span className="text-[11px] text-neutral-400">{t('chatAnalytics.responseHist.targetLabel')}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatAnalyticsPage() {
  const [period, setPeriod] = useState<RangePeriod>('30d')
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })

  const {
    data: queueSnapshot,
    isLoading: queueLoading,
    isError: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ['chat-queue-snapshot', 20],
    queryFn: () => getChatQueueSnapshot(20),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const {
    data: workloadData,
    isLoading: workloadLoading,
    isError: workloadError,
    refetch: refetchWorkload,
  } = useQuery({
    queryKey: ['chat-workload-by-user'],
    queryFn: () => getChatWorkloadByUser(),
    staleTime: 60_000,
  })

  const {
    data: threadsData,
    isLoading: threadsLoading,
    isError: threadsError,
    refetch: refetchThreads,
  } = useQuery({
    queryKey: ['chat-threads-analytics', period],
    queryFn: () => listThreads({ pageSize: 100 }),
    staleTime: 120_000,
  })

  const isLoading = queueLoading || workloadLoading || threadsLoading
  const isError = queueError || workloadError || threadsError

  // Derived KPIs from real data
  const queueItems = queueSnapshot ?? []
  const queueCount = queueItems.length
  const avgWaitMins = queueCount > 0
    ? Math.round(queueItems.reduce((s, q) => s + q.waitMins, 0) / queueCount)
    : 0
  const totalCompleted = (workloadData ?? []).reduce((s, w) => s + w.completed, 0)
  const totalConversations = threadsData?.totalCount ?? 0

  // Category breakdown
  const categoryMap: Record<string, number> = {}
  for (const thread of threadsData?.items ?? []) {
    categoryMap[thread.category] = (categoryMap[thread.category] ?? 0) + 1
  }
  const categoryEntries = Object.entries(categoryMap).sort(([, a], [, b]) => b - a)
  const categoryTotal = categoryEntries.reduce((s, [, c]) => s + c, 0)

  // CA workload table
  const caRows = (workloadData ?? []).sort((a, b) => b.assigned - a.assigned)
  const maxCaAssigned = Math.max(1, ...caRows.map(r => r.assigned))

  function handleRetry() {
    void refetchQueue()
    void refetchWorkload()
    void refetchThreads()
  }

  return (
    <main aria-labelledby="chat-analytics-title" className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400 mb-1">
            {t('chatAnalytics.breadcrumb')}
          </nav>
          <h1 id="chat-analytics-title" className="text-xl font-bold text-neutral-900">
            {t('chatAnalytics.title')}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">{t('chatAnalytics.subtitle')}</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-white text-sm"
            role="group"
            aria-label={t('chatAnalytics.period.label')}
          >
            {(['7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateRange({ start: null, end: null }) }}
                className={cn(
                  'px-3 py-1.5 font-medium transition-colors',
                  period === p ? 'bg-brand-600 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                )}
                aria-pressed={period === p}
              >
                {t(`chatAnalytics.period.${p}`)}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              className={cn(
                'px-3 py-1.5 font-medium transition-colors',
                period === 'custom' ? 'bg-brand-600 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              )}
              aria-pressed={period === 'custom'}
            >
              {t('chatAnalytics.period.custom')}
            </button>
          </div>
          {period === 'custom' && (
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 transition-colors"
            aria-label={t('chatAnalytics.export')}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('chatAnalytics.export')}
          </button>
        </div>
      </div>

      {/* Dev notice: some KPIs derived from mock data */}
      <AlertBanner
        type="info"
        title={t('chatAnalytics.mockNotice.title')}
        description={t('chatAnalytics.mockNotice.body')}
      />

      {isError && (
        <AlertBanner
          type="error"
          title={t('common.error.load')}
          actions={
            <button onClick={handleRetry} className="text-xs font-medium text-error-700 underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          title={t('chatAnalytics.kpi.totalConversations')}
          value={isLoading ? '…' : totalConversations.toLocaleString('en-IN')}
          icon={<MessageSquare />}
          color="brand"
          loading={isLoading}
        />
        <MetricCard
          title={t('chatAnalytics.kpi.avgFirstResponse')}
          value={isLoading ? '…' : `${avgWaitMins}m`}
          subtitle={t('chatAnalytics.kpi.avgFirstResponseTarget')}
          icon={<Clock />}
          color={avgWaitMins > 15 ? 'error' : 'success'}
          loading={isLoading}
        />
        <MetricCard
          title={t('chatAnalytics.kpi.resolved')}
          value={isLoading ? '…' : totalCompleted.toLocaleString('en-IN')}
          icon={<CheckCircle2 />}
          color="success"
          loading={isLoading}
        />
        <MetricCard
          title={t('chatAnalytics.kpi.csat')}
          value="4.2 / 5"
          subtitle={t('chatAnalytics.kpi.csatMock')}
          icon={<Star />}
          color="warning"
          loading={isLoading}
        />
        <MetricCard
          title={t('chatAnalytics.kpi.escalationRate')}
          value="3.8%"
          subtitle={t('chatAnalytics.kpi.escalationMock')}
          icon={<TrendingUp />}
          color="brand"
          loading={isLoading}
        />
      </div>

      {/* Response histogram + category table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">
                {t('chatAnalytics.responseHist.title')}
              </h2>
              <Badge variant="neutral" size="sm">{t('chatAnalytics.mockBadge')}</Badge>
            </div>
            <ResponseHistogram />
          </div>
        </Card>

        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">
                {t('chatAnalytics.category.title')}
              </h2>
              {threadsLoading && <Skeleton className="h-4 w-16" />}
            </div>
            {threadsLoading ? (
              <Skeleton variant="list" />
            ) : categoryEntries.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">{t('chatAnalytics.category.empty')}</p>
            ) : (
              <table className="w-full text-sm" aria-label={t('chatAnalytics.category.tableAria')}>
                <thead>
                  <tr className="text-left text-xs text-neutral-500 border-b border-neutral-100">
                    <th className="pb-1 font-medium">{t('chatAnalytics.category.col.category')}</th>
                    <th className="pb-1 font-medium text-right">{t('chatAnalytics.category.col.count')}</th>
                    <th className="pb-1 font-medium" colSpan={2}>{t('chatAnalytics.category.col.share')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {categoryEntries.map(([cat, count]) => (
                    <tr key={cat}>
                      <td className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: CATEGORY_COLOURS[cat] ?? '#9ca3af' }}
                          />
                          <span className="text-neutral-700 capitalize">{cat.replace(/-/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-600">{count}</td>
                      <td className="py-1.5 pl-2 w-32">
                        <InlineBar value={count} max={categoryTotal} colour={CATEGORY_COLOURS[cat] ?? '#9ca3af'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* CA performance table */}
      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">
              {t('chatAnalytics.caPerf.title')}
            </h2>
            <Users className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          </div>
          {workloadLoading ? (
            <Skeleton variant="dataTableDense" />
          ) : caRows.length === 0 ? (
            <p className="text-sm text-neutral-400 py-4 text-center">{t('chatAnalytics.caPerf.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid" aria-label={t('chatAnalytics.caPerf.tableAria')}>
                <thead>
                  <tr className="text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100">
                    <th className="pb-2">{t('chatAnalytics.caPerf.col.ca')}</th>
                    <th className="pb-2 text-right">{t('chatAnalytics.caPerf.col.assigned')}</th>
                    <th className="pb-2 text-right">{t('chatAnalytics.caPerf.col.completed')}</th>
                    <th className="pb-2 text-right">{t('chatAnalytics.caPerf.col.total')}</th>
                    <th className="pb-2">{t('chatAnalytics.caPerf.col.workload')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {caRows.map(row => (
                    <tr key={row.userId}>
                      <td className="py-2 font-mono text-xs text-neutral-500">
                        {row.userId.slice(0, 8)}…
                      </td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{row.assigned}</td>
                      <td className="py-2 text-right tabular-nums text-success-600">{row.completed}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-600">{row.assigned + row.completed}</td>
                      <td className="py-2 w-32">
                        <InlineBar value={row.assigned} max={maxCaAssigned} colour="#6366f1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-neutral-400 mt-2">{t('chatAnalytics.caPerf.userIdNote')}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Queue snapshot — real-time */}
      <Card>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">
              {t('chatAnalytics.queue.title')}
            </h2>
            {queueCount > 0 && (
              <Badge variant={queueCount > 5 ? 'error' : 'warning'} size="sm">
                {queueCount} {t('chatAnalytics.queue.waiting')}
              </Badge>
            )}
          </div>
          {queueLoading ? (
            <Skeleton variant="list" />
          ) : queueCount === 0 ? (
            <div className="flex items-center gap-2 text-success-600 py-3">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm font-medium">{t('chatAnalytics.queue.empty')}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {queueItems.slice(0, 10).map(item => (
                <div
                  key={item.threadId}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-neutral-50 transition-colors"
                >
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      item.waitMins > 30 ? 'bg-error-500' : item.waitMins > 15 ? 'bg-warning-500' : 'bg-success-500'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-700 truncate">
                      {item.subject ?? t('chatAnalytics.queue.noSubject')}
                    </p>
                    <p className="text-xs text-neutral-400 capitalize">{item.category.replace(/-/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs tabular-nums shrink-0">
                    <Clock className="h-3 w-3 text-neutral-400" aria-hidden="true" />
                    <span className={cn(item.waitMins > 15 ? 'text-error-600 font-medium' : 'text-neutral-500')}>
                      {item.waitMins}m
                    </span>
                  </div>
                </div>
              ))}
              {queueCount > 10 && (
                <p className="text-xs text-neutral-400 text-center pt-1">
                  {t('chatAnalytics.queue.andMore', { count: queueCount - 10 })}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* CSAT trend + peak-hours heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">{t('chatAnalytics.csat.title')}</h2>
              <Badge variant="neutral" size="sm">{t('chatAnalytics.mockBadge')}</Badge>
            </div>
            <CsatSparkline />
            <p className="text-[11px] text-neutral-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {t('chatAnalytics.csat.mockNote')}
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800">{t('chatAnalytics.heatmap.title')}</h2>
              <Badge variant="neutral" size="sm">{t('chatAnalytics.mockBadge')}</Badge>
            </div>
            <PeakHoursHeatmap />
            <p className="text-[11px] text-neutral-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {t('chatAnalytics.heatmap.mockNote')}
            </p>
          </div>
        </Card>
      </div>
    </main>
  )
}
