/**
 * PlatformRevenuePage — Screen 101
 * SnapAccount's own subscription revenue: MRR, ARR, and the current plan mix.
 * DG-DASH-06
 *
 * CG-ANALYTICS: this screen previously rendered MoM growth, net/YTD revenue,
 * refund/recovery rates, payment counts, Razorpay fees, a cohort-retention
 * heatmap, a revenue forecast and GST-on-revenue — all fabricated client-side
 * from hardcoded multipliers with NO backing endpoint. Showing invented
 * financial figures as if real is worse than showing nothing, so those sections
 * are removed. Only the real, backend-sourced MRR + plan-mix remain (ARR = MRR×12).
 * Real analytics endpoints for the removed metrics are a backend follow-up.
 */
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
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

export default function PlatformRevenuePage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['analytics', 'platform-revenue'],
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
        <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : isError ? (
        <EmptyState variant="generic" title={t('analytics.error.load')} size="md" />
      ) : !data ? null : (
        <ErrorBoundary scope="route">
          {/* Revenue Overview — real figures only */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-2">
            {t('analytics.revenue.overview')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard title={t('analytics.revenue.mrr')} value={formatINR(data.mrr)} variant="success" />
            <MetricCard title={t('analytics.revenue.arr')} value={formatINR(data.arr)} variant="success" subtitle={t('analytics.revenue.arrNote')} />
          </div>

          {/* Plan mix — real per-plan subscribers + MRR from /subscriptions/mrr */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.revenue.planMix')}
          </h2>
          <Card>
            {data.byPlan.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">
                {t('analytics.revenue.noPlans')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--text-secondary)]">
                        {t('analytics.revenue.plan')}
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--text-secondary)]">
                        {t('analytics.revenue.subscribers')}
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--text-secondary)]">
                        {t('analytics.revenue.mrr')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPlan.map(plan => (
                      <tr key={plan.planName} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{plan.planName}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">{plan.subscriberCount}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-[var(--text-primary)]">{formatINR(plan.mrr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </ErrorBoundary>
      )}
    </div>
  )
}
