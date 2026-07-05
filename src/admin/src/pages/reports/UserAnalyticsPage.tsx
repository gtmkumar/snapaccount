/**
 * UserAnalyticsPage — Screen 102
 * User acquisition, activation, engagement, retention analytics.
 * DG-DASH-06
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { RefreshCw, TrendingDown } from 'lucide-react'
import { t } from '@/i18n'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { cn } from '@/lib/utils'
import { getUserAnalytics, type AnalyticsRange } from '@/lib/analyticsApi'

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: t('analytics.range.7d') },
  { value: '30d', label: t('analytics.range.30d') },
  { value: '90d', label: t('analytics.range.90d') },
]

// Funnel step colours (blue fade)
const FUNNEL_COLORS = ['#6366f1', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd']

function RetentionBadge({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? 'text-success-600' : value >= 35 ? 'text-warning-600' : 'text-error-600'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('text-3xl font-bold', color)}>{value}%</div>
      <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
    </div>
  )
}

function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`
  return `₹${amount.toLocaleString('en-IN')}`
}

export default function UserAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['analytics', 'users', range],
    queryFn: () => getUserAnalytics({ range }),
    staleTime: 300_000,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title={t('analytics.users.title')}
          subtitle={t('analytics.users.subtitle')}
        />
        <div className="flex items-center gap-2">
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
          <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : isError ? (
        <EmptyState variant="generic" title={t('analytics.error.load')} size="md" />
      ) : !data ? null : (
        <ErrorBoundary scope="route">
          {/* Acquisition Funnel */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-2">
            {t('analytics.users.acquisitionFunnel')}
          </h2>
          <Card>
            <div className="space-y-3">
              {data.acquisitionFunnel.map((step, idx) => {
                const max = data.acquisitionFunnel[0]?.count ?? 1
                const widthPct = Math.round((step.count / max) * 100)
                return (
                  <div key={step.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">{step.stage}</span>
                      <div className="flex items-center gap-3">
                        {step.dropOffPct !== null && (
                          <span className="flex items-center gap-0.5 text-error-600">
                            <TrendingDown className="h-3 w-3" />
                            {step.dropOffPct}% {t('analytics.users.dropOff')}
                          </span>
                        )}
                        <span className="font-semibold text-[var(--text-primary)]">{step.count.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    <div className="w-full bg-[var(--surface-sunken)] rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300 flex items-center pl-3"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
                        }}
                      >
                        <span className="text-white text-xs font-medium">{widthPct}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* User Growth Chart */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.users.growth')}
          </h2>
          <Card>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.growthTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="cumulative" name={t('analytics.users.cumulative')} stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="newUsers" name={t('analytics.users.newUsers')} stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="mau" name={t('analytics.users.mau')} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Feature Adoption Table */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.users.featureAdoption')}
          </h2>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">
                      {t('analytics.users.feature')}
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">
                      {t('analytics.users.usersUsing')}
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">
                      {t('analytics.users.pctOfTotal')}
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">
                      {t('analytics.users.avgSessions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.featureAdoption.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={cn(
                        'border-b border-[var(--border-subtle)] last:border-0',
                        i === 0 && 'bg-[var(--surface-sunken)]',
                      )}
                    >
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{row.feature}</td>
                      <td className="py-3 px-4 text-right text-[var(--text-primary)]">
                        {row.usersUsing.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-[var(--surface-sunken)] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-[var(--brand-500)] rounded-full"
                              style={{ width: `${row.pctOfTotal}%` }}
                            />
                          </div>
                          <span className="text-[var(--text-primary)] w-12 text-right">{row.pctOfTotal}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-[var(--text-secondary)]">{row.avgSessionsPerWeek}/wk</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Geographic Distribution */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.users.geographic')}
          </h2>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">{t('analytics.users.state')}</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">{t('analytics.users.users')}</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">{t('analytics.users.gstFilersPct')}</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-[var(--text-secondary)] uppercase">{t('analytics.users.mrrContribution')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topStates.map((row, i) => (
                    <tr key={row.state} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-2.5 px-4 flex items-center gap-2 font-medium text-[var(--text-primary)]">
                        <span className="text-xs text-[var(--text-tertiary)] w-4">{i + 1}</span>
                        {row.state}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--text-primary)]">{row.users.toLocaleString('en-IN')}</td>
                      <td className="py-2.5 px-4 text-right text-[var(--text-secondary)]">{row.gstFilersPct}%</td>
                      <td className="py-2.5 px-4 text-right text-success-600 font-medium">{formatINR(row.mrrContribution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Behavior Patterns + Retention */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Behavior */}
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.users.behaviorPatterns')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-[var(--text-secondary)]">{t('analytics.users.avgDocsPerMonth')}</div>
                  <div className="text-lg font-bold text-[var(--text-primary)]">{data.behaviorPatterns.avgDocsPerMonthPerUser}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-[var(--text-secondary)]">{t('analytics.users.avgUploadToFiling')}</div>
                  <div className="text-lg font-bold text-[var(--text-primary)]">{data.behaviorPatterns.avgUploadToFilingDays} {t('analytics.users.days')}</div>
                </div>
              </div>
            </Card>

            {/* Retention */}
            <Card>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                {t('analytics.users.retentionRates')}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                <RetentionBadge label={t('analytics.users.day1')} value={data.retention.day1} />
                <RetentionBadge label={t('analytics.users.day7')} value={data.retention.day7} />
                <RetentionBadge label={t('analytics.users.day30')} value={data.retention.day30} />
                <RetentionBadge label={t('analytics.users.day90')} value={data.retention.day90} />
              </div>
            </Card>
          </div>

          {/* Churn Analysis */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.users.churnAnalysis')}
          </h2>
          <Card>
            <div className="space-y-2">
              {data.churnByLastAction.map(row => {
                const max = Math.max(...data.churnByLastAction.map(r => r.count))
                const pct = Math.round((row.count / max) * 100)
                return (
                  <div key={row.lastAction} className="flex items-center gap-3">
                    <span className="w-44 text-xs text-[var(--text-secondary)] truncate">{row.lastAction}</span>
                    <div className="flex-1 bg-[var(--surface-sunken)] rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-error-500 rounded-full"
                        style={{ width: `${pct}%`, opacity: 0.7 }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--text-primary)] w-8 text-right">{row.count}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </ErrorBoundary>
      )}
    </div>
  )
}
