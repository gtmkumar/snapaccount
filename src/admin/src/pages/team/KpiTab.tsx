/**
 * KpiTab — design Screen 90 (Team KPI Dashboard).
 *
 * Honest sourcing: callback SLA / TTR / volume come from the real
 * /callbacks/kpi endpoint (getCallbackKpi). Per-staff load comes from the
 * workload grid. Metrics with no backing schema yet — Document/GST/ITR review
 * SLA, FCR rate, CSAT, avg handle time — are rendered as "—" with a
 * "not tracked yet" note rather than fabricated. When those trackers land,
 * swap the placeholder cards for live values.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { t } from '@/i18n'
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Download } from 'lucide-react'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { getStaffWorkloadGrid } from '@/lib/staffApi'
import { getCallbackKpi, type CallbackKpiParams } from '@/lib/callbackApi'
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { cn, getInitials } from '@/lib/utils'

type Range = '24h' | '7d' | '30d' | 'fy'

function formatTtr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const NOT_TRACKED = '—'

export function KpiTab() {
  const [range, setRange] = useState<Range>('7d')

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['team', 'kpi', 'callback', range],
    queryFn: () => getCallbackKpi({ range } as CallbackKpiParams),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { data: grid, isLoading: gridLoading } = useQuery({
    queryKey: ['staff', 'workload-grid'],
    queryFn: getStaffWorkloadGrid,
    staleTime: 30_000,
  })

  const rangeOptions: { value: Range; label: string }[] = [
    { value: '24h', label: t('team.kpi.range.24h') },
    { value: '7d', label: t('team.kpi.range.7d') },
    { value: '30d', label: t('team.kpi.range.30d') },
    { value: 'fy', label: t('team.kpi.range.fy') },
  ]

  // Merge per-staff load with callback team performance (avg TTR, SLA %).
  const perfByUser = new Map((kpi?.teamPerformance ?? []).map(a => [a.agentId, a]))
  const staffRows = (grid?.rows ?? []).map(r => ({
    ...r,
    perf: perfByUser.get(r.userId),
  }))

  const exportStaffCsv = () => {
    const csv = toCsv(staffRows, [
      { header: t('team.kpi.staff.col.name'), value: r => r.name },
      { header: t('team.kpi.staff.col.role'), value: r => r.roleDisplayName },
      { header: t('team.kpi.staff.col.assigned'), value: r => r.totalAssigned },
      { header: t('team.kpi.staff.col.completed'), value: r => r.totalCompleted },
      { header: t('team.kpi.staff.col.avgTtr'), value: r => r.perf ? `${r.perf.avgTtrMinutes}m` : NOT_TRACKED },
      { header: t('team.kpi.staff.col.sla'), value: r => r.perf ? r.perf.slaPercent.toFixed(1) : NOT_TRACKED },
    ])
    downloadCsv(csvFilename('team-staff-kpis'), csv)
  }

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex items-center justify-end">
        <select
          value={range}
          onChange={e => setRange(e.target.value as Range)}
          aria-label={t('team.kpi.range.label')}
          className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] text-sm px-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
        >
          {rangeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* SLA compliance — only callback SLA is tracked today */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">
          {t('team.kpi.section.sla')}
        </h3>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            color="success"
            loading={kpiLoading}
            title={t('team.kpi.sla.callback')}
            value={kpi ? `${kpi.slaCompliance.toFixed(1)}%` : NOT_TRACKED}
            subtitle={t('team.kpi.target')}
          />
          <MetricCard
            color="brand"
            title={t('team.kpi.sla.docReview')}
            value={NOT_TRACKED}
            subtitle={t('team.kpi.notTracked')}
          />
          <MetricCard
            color="gst"
            title={t('team.kpi.sla.gst')}
            value={NOT_TRACKED}
            subtitle={t('team.kpi.notTracked')}
          />
          <MetricCard
            color="itr"
            title={t('team.kpi.sla.itr')}
            value={NOT_TRACKED}
            subtitle={t('team.kpi.notTracked')}
          />
        </div>
      </div>

      {/* Callback KPIs — real data */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2">
          {t('team.kpi.section.callback')}
        </h3>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            color="warning"
            loading={kpiLoading}
            title={t('team.kpi.callback.open')}
            value={kpi?.open ?? NOT_TRACKED}
          />
          <MetricCard
            color="success"
            loading={kpiLoading}
            title={t('team.kpi.callback.completed')}
            value={kpi?.completed ?? NOT_TRACKED}
          />
          <MetricCard
            color="brand"
            loading={kpiLoading}
            title={t('team.kpi.callback.avgTtr')}
            value={kpi ? formatTtr(kpi.avgTtrSeconds) : NOT_TRACKED}
          />
          <MetricCard
            color="itr"
            title={t('team.kpi.callback.csat')}
            value={NOT_TRACKED}
            subtitle={t('team.kpi.notTracked')}
          />
        </div>
      </div>

      {/* Callback volume trend */}
      <Card>
        <CardHeader title={t('team.kpi.chart.volume')} />
        {kpiLoading ? (
          <div className="h-60 rounded skeleton-shimmer" />
        ) : kpi && kpi.dailyVolume.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={kpi.dailyVolume} aria-label={t('team.kpi.chart.volume')}>
              <defs>
                <linearGradient id="team-kpi-requested" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="requested" name={t('team.kpi.chart.requested')} stroke="#6366f1" fill="url(#team-kpi-requested)" />
              <Line type="monotone" dataKey="completed" name={t('team.kpi.chart.completedSeries')} stroke="#22c55e" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">{t('team.kpi.noData')}</p>
        )}
      </Card>

      {/* Individual staff KPI table */}
      <Card>
        <CardHeader
          title={t('team.kpi.staff.title')}
          actions={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={exportStaffCsv}
              disabled={staffRows.length === 0}
            >
              {t('team.kpi.export')}
            </Button>
          }
        />
        <ErrorBoundary scope="pane">
          {gridLoading ? (
            <div className="h-32 rounded skeleton-shimmer" />
          ) : staffRows.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">{t('team.kpi.staff.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={t('team.kpi.staff.title')}>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {[
                      t('team.kpi.staff.col.name'),
                      t('team.kpi.staff.col.role'),
                      t('team.kpi.staff.col.assigned'),
                      t('team.kpi.staff.col.completed'),
                      t('team.kpi.staff.col.avgTtr'),
                      t('team.kpi.staff.col.sla'),
                    ].map(h => (
                      <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map(r => (
                    <tr key={r.userId} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                            {getInitials(r.name || r.email)}
                          </div>
                          <span className="font-medium text-[var(--text-primary)]">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{r.roleDisplayName}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{r.totalAssigned}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{r.totalCompleted}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">
                        {r.perf ? `${r.perf.avgTtrMinutes}m` : NOT_TRACKED}
                      </td>
                      <td className="px-3 py-3">
                        {r.perf ? (
                          <span className={cn('font-semibold tabular-nums',
                            r.perf.slaPercent >= 95 ? 'text-success-600' :
                            r.perf.slaPercent >= 85 ? 'text-warning-600' : 'text-error-600'
                          )}>
                            {r.perf.slaPercent.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">{NOT_TRACKED}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ErrorBoundary>
      </Card>
    </div>
  )
}
