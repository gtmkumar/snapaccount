/**
 * OperationalReportPage — Screen 100
 * Platform-wide operational metrics: document processing, GST, ITR, callbacks, loans, chat.
 * DG-DASH-06
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import { RefreshCw, Download } from 'lucide-react'
import { t } from '@/i18n'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { cn } from '@/lib/utils'
import { getOperationalReport, type AnalyticsRange, type AnalyticsGroupBy } from '@/lib/analyticsApi'

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: t('analytics.range.7d') },
  { value: '30d', label: t('analytics.range.30d') },
  { value: '90d', label: t('analytics.range.90d') },
]

const GROUP_OPTIONS: { value: AnalyticsGroupBy; label: string }[] = [
  { value: 'day', label: t('analytics.groupBy.day') },
  { value: 'week', label: t('analytics.groupBy.week') },
  { value: 'month', label: t('analytics.groupBy.month') },
]

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444']
const CHART_COLORS = { primary: '#6366f1', secondary: '#10b981', tertiary: '#f59e0b' }

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------
function MetricCard({
  title,
  value,
  subtitle,
  highlight = false,
}: {
  title: string
  value: string | number
  subtitle?: string
  highlight?: boolean
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{title}</p>
      <p className={cn('text-2xl font-bold', highlight ? 'text-success-600' : 'text-[var(--text-primary)]')}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------
function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3 mt-6 border-b border-[var(--border-subtle)] pb-2">
      {title}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function OperationalReportPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy>('week')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['analytics', 'operational', range, groupBy],
    queryFn: () => getOperationalReport({ range, groupBy }),
    staleTime: 300_000,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title={t('analytics.operational.title')}
          subtitle={t('analytics.operational.subtitle')}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {/* Range selector */}
          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  range === opt.value
                    ? 'bg-[var(--brand-500)] text-white'
                    : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Group by */}
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as AnalyticsGroupBy)}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-primary)]"
            aria-label={t('analytics.groupBy.label')}
          >
            {GROUP_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4 mr-1" />
            {t('analytics.export.csv')}
          </Button>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4 mr-1" />
            {t('analytics.export.pdf')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : isError ? (
        <EmptyState variant="generic" title={t('analytics.error.load')} size="md" />
      ) : !data ? null : (
        <ErrorBoundary scope="route">
          {/* ── Document Processing ─────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.docs.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard title={t('analytics.operational.docs.totalReceived')} value={data.documents.totalReceived} />
            <MetricCard title={t('analytics.operational.docs.totalProcessed')} value={data.documents.totalProcessed} />
            <MetricCard title={t('analytics.operational.docs.avgTime')} value={`${data.documents.avgProcessingTimeHours}h`} />
            <MetricCard title={t('analytics.operational.docs.ocrAuto')} value={`${data.documents.ocrAutoProcessedPct}%`} highlight />
            <MetricCard title={t('analytics.operational.docs.manualReview')} value={`${data.documents.manualReviewPct}%`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.operational.docs.volumeChart')}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.documents.volumeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="received" name={t('analytics.operational.docs.received')} fill={CHART_COLORS.primary} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="processed" name={t('analytics.operational.docs.processed')} fill={CHART_COLORS.secondary} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.operational.docs.confidenceChart')}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.documents.confidenceDistribution}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ label, percent }) => `${label}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data.documents.confidenceDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── GST Operations ──────────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.gst.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard title={t('analytics.operational.gst.inQueue')} value={data.gst.returnsInQueue} />
            <MetricCard title={t('analytics.operational.gst.filed')} value={data.gst.returnsFiled} />
            <MetricCard title={t('analytics.operational.gst.onTimePct')} value={`${data.gst.onTimeFilingPct}%`} highlight />
            <MetricCard title={t('analytics.operational.gst.lateFilings')} value={data.gst.lateFilingsCount} />
            <MetricCard title={t('analytics.operational.gst.avgReviewTime')} value={`${data.gst.avgReviewTimeHours}h`} />
            <MetricCard title={t('analytics.operational.gst.itcResolved')} value={data.gst.itcMismatchesResolved} />
          </div>
          <div className="mt-4">
            <Card>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.operational.gst.filingTrendChart')}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.gst.filingTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="filed" name={t('analytics.operational.gst.filed')} stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="due" name={t('analytics.operational.gst.due')} stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── ITR Operations ──────────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.itr.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard title={t('analytics.operational.itr.verificationsCompleted')} value={data.itr.verificationsCompleted} />
            <MetricCard title={t('analytics.operational.itr.filingSubmitted')} value={data.itr.filingsSubmitted} />
            <MetricCard title={t('analytics.operational.itr.avgVerificationTime')} value={`${data.itr.avgVerificationTimeHours}h`} />
            <MetricCard title={t('analytics.operational.itr.eVerificationRate')} value={`${data.itr.eVerificationRate}%`} highlight />
            <MetricCard title={t('analytics.operational.itr.noticeResponses')} value={data.itr.noticeResponsesSent} />
          </div>
          {/* Funnel chart */}
          <div className="mt-4">
            <Card>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.operational.itr.funnel')}
              </p>
              <div className="space-y-2">
                {data.itr.funnel.map((item, idx) => {
                  const max = data.itr.funnel[0]?.count ?? 1
                  const pct = Math.round((item.count / max) * 100)
                  return (
                    <div key={item.stage} className="flex items-center gap-3">
                      <span className="w-32 text-xs text-[var(--text-secondary)] shrink-0">{item.stage}</span>
                      <div className="flex-1 bg-[var(--surface-sunken)] rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center pl-2 transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(${240 - idx * 35}, 70%, 55%)`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[var(--text-primary)] w-16 text-right">{item.count}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* ── Callback Performance ─────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.callbacks.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard title={t('analytics.operational.callbacks.totalHandled')} value={data.callbacks.totalHandled} />
            <MetricCard title={t('analytics.operational.callbacks.gstFcr')} value={`${data.callbacks.gstFcrRate}%`} highlight />
            <MetricCard title={t('analytics.operational.callbacks.itrFcr')} value={`${data.callbacks.itrFcrRate}%`} highlight />
            <MetricCard title={t('analytics.operational.callbacks.avgDurationGst')} value={`${data.callbacks.avgCallDurationGstMin}m`} />
            <MetricCard title={t('analytics.operational.callbacks.avgDurationItr')} value={`${data.callbacks.avgCallDurationItrMin}m`} />
            <MetricCard title={t('analytics.operational.callbacks.csat')} value={`${data.callbacks.customerSatisfaction}/5`} highlight />
          </div>
          <div className="mt-4">
            <Card>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.operational.callbacks.trendChart')}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.callbacks.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 5]} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="fcrRate" name={t('analytics.operational.callbacks.fcrRate')} stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="csat" name={t('analytics.operational.callbacks.csatTrend')} stroke={CHART_COLORS.tertiary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Loan Operations ──────────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.loans.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard title={t('analytics.operational.loans.received')} value={data.loans.applicationsReceived} />
            <MetricCard title={t('analytics.operational.loans.packagesGenerated')} value={data.loans.packagesGenerated} />
            <MetricCard title={t('analytics.operational.loans.submittedToBanks')} value={data.loans.submittedToBanks} />
            <MetricCard title={t('analytics.operational.loans.approvals')} value={data.loans.approvalsReceived} />
            <MetricCard title={t('analytics.operational.loans.approvalRate')} value={`${data.loans.approvalRatePct}%`} highlight />
            <MetricCard title={t('analytics.operational.loans.avgTime')} value={`${data.loans.avgProcessingTimeDays}d`} />
          </div>

          {/* ── Chat Operations ──────────────────────────────────────────────── */}
          <SectionHeader title={t('analytics.operational.chat.title')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard title={t('analytics.operational.chat.conversations')} value={data.chat.conversationsHandled} />
            <MetricCard title={t('analytics.operational.chat.avgFirstResponse')} value={`${data.chat.avgFirstResponseTimeSec}s`} />
            <MetricCard title={t('analytics.operational.chat.resolutionRate')} value={`${data.chat.resolutionRatePct}%`} highlight />
            <MetricCard title={t('analytics.operational.chat.videoCalls')} value={data.chat.videoCallsCompleted} />
            <MetricCard title={t('analytics.operational.chat.csat')} value={`${data.chat.csatScore}/5`} highlight />
          </div>
        </ErrorBoundary>
      )}
    </div>
  )
}
