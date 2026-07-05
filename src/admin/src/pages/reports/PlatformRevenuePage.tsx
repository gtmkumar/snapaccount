/**
 * PlatformRevenuePage — Screen 101
 * SnapAccount's own financial health: MRR, ARR, payment health, cohort retention.
 * DG-DASH-06
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  Line, Area, AreaChart, CartesianGrid,
} from 'recharts'
import { Download, RefreshCw, Info } from 'lucide-react'
import { t } from '@/i18n'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { cn } from '@/lib/utils'
import { getPlatformRevenue } from '@/lib/analyticsApi'

// Indian currency formatter
function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`
  return `₹${amount.toLocaleString('en-IN')}`
}

function MetricCard({
  title,
  value,
  subtitle,
  variant = 'default',
}: {
  title: string
  value: string
  subtitle?: string
  variant?: 'default' | 'success' | 'warning'
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">{title}</p>
      <p className={cn(
        'text-2xl font-bold',
        variant === 'success' && 'text-success-600',
        variant === 'warning' && 'text-warning-600',
        variant === 'default' && 'text-[var(--text-primary)]',
      )}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
    </Card>
  )
}

const PLAN_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444']

// Cohort retention heatmap cell
function CohortCell({ value }: { value: number | null }) {
  if (value === null) return <td className="p-2 text-center text-xs text-[var(--text-tertiary)]">—</td>
  const intensity = value / 100
  const bg = `rgba(99, 102, 241, ${0.1 + intensity * 0.7})`
  const fg = intensity > 0.5 ? 'white' : 'var(--text-primary)'
  return (
    <td
      className="p-2 text-center text-xs font-medium w-16 rounded"
      style={{ backgroundColor: bg, color: fg }}
    >
      {value}%
    </td>
  )
}

export default function PlatformRevenuePage() {
  const [fy, setFy] = useState('2025-26')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['analytics', 'platform-revenue', fy],
    queryFn: () => getPlatformRevenue({ range: '30d' }),
    staleTime: 300_000,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title={t('analytics.revenue.title')}
          subtitle={t('analytics.revenue.subtitle')}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={fy}
            onChange={e => setFy(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-primary)]"
            aria-label={t('reports.fy')}
          >
            <option value="2024-25">FY 2024-25</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2026-27">FY 2026-27</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4 mr-1" />
            {t('analytics.revenue.exportForAccountant')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : isError ? (
        <EmptyState variant="generic" title={t('analytics.error.load')} size="md" />
      ) : !data ? null : (
        <ErrorBoundary scope="route">
          {/* Revenue Overview */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-2">
            {t('analytics.revenue.overview')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard title={t('analytics.revenue.mrr')} value={formatINR(data.mrr)} variant="success" />
            <MetricCard title={t('analytics.revenue.arr')} value={formatINR(data.arr)} variant="success" />
            <MetricCard title={t('analytics.revenue.totalYtd')} value={formatINR(data.totalRevenueYtd)} />
            <MetricCard title={t('analytics.revenue.momGrowth')} value={`${data.revenueMomGrowthPct}%`} variant="success" />
            <MetricCard title={t('analytics.revenue.netRevenue')} value={formatINR(data.netRevenue)} />
            <MetricCard title={t('analytics.revenue.refundRate')} value={`${data.refundRatePct}%`} variant="warning" />
          </div>

          {/* Revenue by Plan chart */}
          <Card className="mt-4">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {t('analytics.revenue.byPlanChart')}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.revenueByPlanTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatINR(v)} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
                {data.byPlan.map((plan, i) => (
                  <Bar
                    key={plan.planName}
                    dataKey={`byPlan.${plan.planName}`}
                    name={plan.planName}
                    stackId="a"
                    fill={PLAN_COLORS[i % PLAN_COLORS.length]}
                    radius={i === data.byPlan.length - 1 ? [2, 2, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Payment Health */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.revenue.paymentHealth')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard title={t('analytics.revenue.totalPayments')} value={formatINR(data.totalPaymentsReceived)} />
            <MetricCard
              title={t('analytics.revenue.failedPayments')}
              value={`${data.failedPaymentsCount} (${formatINR(data.failedPaymentsValue)})`}
              variant="warning"
            />
            <MetricCard title={t('analytics.revenue.recoveryRate')} value={`${data.recoveryRatePct}%`} variant="success" />
            <MetricCard title={t('analytics.revenue.razorpayFees')} value={formatINR(data.razorpayFees)} />
          </div>

          {/* Subscription Cohort Analysis */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.revenue.cohortAnalysis')}
          </h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 px-3 text-xs font-medium text-[var(--text-secondary)]">
                      {t('analytics.revenue.cohort')}
                    </th>
                    <th className="py-2 px-2 text-xs font-medium text-[var(--text-secondary)]">M1</th>
                    <th className="py-2 px-2 text-xs font-medium text-[var(--text-secondary)]">M2</th>
                    <th className="py-2 px-2 text-xs font-medium text-[var(--text-secondary)]">M3</th>
                    <th className="py-2 px-2 text-xs font-medium text-[var(--text-secondary)]">M6</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohortRetention.map(row => (
                    <tr key={row.cohort} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{row.cohort}</td>
                      <CohortCell value={row.m1} />
                      <CohortCell value={row.m2} />
                      <CohortCell value={row.m3} />
                      <CohortCell value={row.m6} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" />
              {t('analytics.revenue.cohortNote')}
            </p>
          </Card>

          {/* Revenue Forecast */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.revenue.forecast')}
          </h2>
          <Card>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.revenueForecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatINR(v)} />
                <Tooltip formatter={(v: unknown) => typeof v === 'number' ? formatINR(v) : '—'} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="high"
                  name={t('analytics.revenue.forecastHigh')}
                  stroke="transparent"
                  fill="#6366f120"
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="low"
                  name={t('analytics.revenue.forecastLow')}
                  stroke="transparent"
                  fill="#6366f120"
                  connectNulls={false}
                />
                <Line type="monotone" dataKey="actual" name={t('analytics.revenue.actual')} stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="projected" name={t('analytics.revenue.projected')} stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* GST on Revenue */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.revenue.gstOnRevenue')}
          </h2>
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.revenue.taxableRevenue')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatINR(data.gstOnRevenue.taxableRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.revenue.gstRate')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.gstOnRevenue.gstRate}%</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.revenue.gstPayable')}</p>
                <p className="text-lg font-bold text-warning-600">{formatINR(data.gstOnRevenue.gstPayable)}</p>
              </div>
            </div>
            <div className="mt-3 p-3 bg-[var(--surface-sunken)] rounded-lg">
              <p className="text-xs text-[var(--text-secondary)] italic">{t('analytics.revenue.gstNote')}</p>
            </div>
          </Card>
        </ErrorBoundary>
      )}
    </div>
  )
}
