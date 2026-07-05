/**
 * DashboardPage — S5 visual hierarchy redesign (design-elevation-spec §4.1)
 *
 * 3-tier layout:
 *   Tier 1 — "Needs attention now" urgent band (GST due, pending docs, callbacks)
 *   Tier 2 — operational KPI compact strip (ITR, loans, active loan count)
 *   Tier 3 — trends & queues (activity chart, chat queue, team workload) — tabbed
 *
 * Design tokens: Emerald success, Orange accent, radius-sm 6px (canonical S0 set).
 * All text via t() — en/hi/bn parity.
 * Mocked sections carry a "sample data" badge (STATIC-DATA-DEBT-7).
 * Failed/unavailable metrics render a dash, never a fabricated number.
 * A11y: KPI cards have role="group" with accessible name; urgent state uses icon + text (not colour only).
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  FileText,
  Receipt,
  FileSpreadsheet,
  Phone,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Activity,
  AlertTriangle,
  ChevronRight,
  FlaskConical,
} from 'lucide-react'
import { MetricCard } from '@/components/shared/MetricCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatRelativeTime, cn } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { NoticesDueWidget } from '@/components/widgets/NoticesDueWidget'
import {
  getAdminAuditEvents,
  getAdminChatQueueSnapshot,
  getAdminDashboardActivity,
  getAdminDashboardStats,
  getAdminTeamWorkload,
} from '@/lib/dashboardApi'
import { t } from '@/i18n'
import { getAggregateHealth } from '@/lib/healthApi'
import { getFilingQueue } from '@/lib/gstApi'
import { getVerificationKpi } from '@/lib/itrApi'
import { getLoanKpi } from '@/lib/loanApi'

// Default AY shown by the ITR workspace — keep in sync with ItrPage CURRENT_AY
// so the dashboard ITR card matches the queue the user lands on.
const ITR_DASHBOARD_AY = 'AY2026-27'

// PR #8: counts now fetched live via getAdminDashboardStats() which fans out
// 5 parallel calls to per-service /admin/dashboard-stats endpoints. The
// activity / team-workload / chat-queue / audit-events sections remain
// mocked — see docs/dev/static-data-debt.md (STATIC-DATA-DEBT-7).
const PENDING_DOCS_THRESHOLD = 50

// ---------------------------------------------------------------------------
// Sample-data badge (for mocked sections per STATIC-DATA-DEBT-7)
// ---------------------------------------------------------------------------
function SampleDataBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)] border border-[var(--semantic-warning-fg)]/25 whitespace-nowrap">
      <FlaskConical className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t('dashboard.sampleDataBadge')}
    </span>
  )
}

/** Equal-height queue summary card — label/value rows + bottom CTA. */
function QueueSummaryCard({
  title,
  badge,
  rows,
  ctaLabel,
  onCta,
}: {
  title: string
  badge: ReactNode
  rows: { label: string; value: ReactNode; valueClassName?: string }[]
  ctaLabel: string
  onCta: () => void
}) {
  return (
    <Card className="flex flex-col h-full">
      {/* Header — title clamped to a fixed 2-line box so all three cards have
          equal-height headers and their rows line up horizontally. */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 min-h-[2.75rem] min-w-0">
          {title}
        </h3>
        <div className="shrink-0">{badge}</div>
      </div>
      {/* Fixed-height rows keep values aligned even when a label wraps to 2 lines. */}
      <div className="flex-1 space-y-1">
        {rows.map(row => (
          <div key={row.label} className="flex justify-between items-center gap-3 min-h-[2.5rem]">
            <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
            <span className={cn('text-sm font-semibold tabular-nums shrink-0', row.valueClassName ?? 'text-[var(--text-primary)]')}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <Button variant="primary" size="sm" fullWidth className="mt-4 whitespace-nowrap" onClick={onCta}>
        {ctaLabel}
      </Button>
    </Card>
  )
}

/**
 * Renders a value cell for a queue card: spinner ellipsis while loading,
 * em-dash on error (never a fabricated number), the real count otherwise.
 */
function queueValue(value: number, isLoading: boolean, isError: boolean): ReactNode {
  if (isLoading) return '…'
  if (isError) return '—'
  return value
}

// ---------------------------------------------------------------------------
// GST queue card — live counts from the same source as GstFilingQueuePage
// (GET /gst/admin/filing-queue). Draft / Pending Approval / Overdue match the
// filing-queue page exactly.
// ---------------------------------------------------------------------------
function GstQueueCard() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gst', 'filing-queue', { status: undefined }],
    queryFn: () => getFilingQueue({ status: undefined }),
    refetchInterval: 60_000,
  })

  const items = data ?? []
  const draft = items.filter(i => i.status === 'DRAFT').length
  const pendingApproval = items.filter(i => i.status === 'PENDING_APPROVAL').length
  const overdue = items.filter(i => i.filingDeadline && new Date(i.filingDeadline) < new Date()).length

  return (
    <QueueSummaryCard
      title={t('dashboard.gstQueue.title')}
      badge={<Badge variant="gst">GST</Badge>}
      rows={[
        { label: t('dashboard.gstQueue.draft'), value: queueValue(draft, isLoading, isError) },
        {
          label: t('dashboard.gstQueue.pendingApproval'),
          value: queueValue(pendingApproval, isLoading, isError),
          valueClassName: pendingApproval > 0 ? 'text-warning-600' : undefined,
        },
        {
          label: t('dashboard.gstQueue.overdue'),
          value: queueValue(overdue, isLoading, isError),
          valueClassName: overdue > 0 ? 'text-error-600' : undefined,
        },
      ]}
      ctaLabel={t('dashboard.gstQueue.cta')}
      onCta={() => void navigate('/gst')}
    />
  )
}

// ---------------------------------------------------------------------------
// ITR queue card — live KPIs from the same source as ItrPage
// (GET /itr/filings/kpi). Mirrors the ITR verification KPI strip.
// ---------------------------------------------------------------------------
function ItrQueueCard() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['itr-kpi', ITR_DASHBOARD_AY],
    queryFn: () => getVerificationKpi(ITR_DASHBOARD_AY),
    staleTime: 60_000,
  })

  return (
    <QueueSummaryCard
      title={t('dashboard.itrQueue.title')}
      badge={<Badge variant="itr">ITR</Badge>}
      rows={[
        {
          label: t('dashboard.itrQueue.pendingVerification'),
          value: queueValue(data?.awaitingReview ?? 0, isLoading, isError),
        },
        {
          label: t('itr.admin.kpi.slaBreached'),
          value: queueValue(data?.slaBreached ?? 0, isLoading, isError),
          valueClassName: (data?.slaBreached ?? 0) > 0 ? 'text-error-600' : undefined,
        },
        {
          label: t('itr.admin.kpi.totalFilings'),
          value: queueValue(data?.totalFilingsAy ?? 0, isLoading, isError),
        },
      ]}
      ctaLabel={t('dashboard.itrQueue.cta')}
      onCta={() => void navigate('/itr')}
    />
  )
}

// ---------------------------------------------------------------------------
// Loan queue card — live KPIs from the same source as LoansListPage
// (GET /loans/kpi). Total Active reuses the cross-service dashboard stat.
// ---------------------------------------------------------------------------
function LoanQueueCard({ activeCount }: { activeCount: ReactNode }) {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['loanKpi'],
    queryFn: getLoanKpi,
    retry: 1,
  })

  return (
    <QueueSummaryCard
      title={t('dashboard.loanQueue.title')}
      badge={<Badge variant="loan">Loans</Badge>}
      rows={[
        {
          label: t('dashboard.loanQueue.underReview'),
          value: queueValue(data?.underReview ?? 0, isLoading, isError),
          valueClassName: (data?.underReview ?? 0) > 0 ? 'text-warning-600' : undefined,
        },
        {
          label: t('dashboard.loanQueue.decisionPending'),
          value: queueValue(data?.submitted ?? 0, isLoading, isError),
        },
        { label: t('dashboard.loanQueue.totalActive'), value: activeCount },
      ]}
      ctaLabel={t('dashboard.loanQueue.cta')}
      onCta={() => void navigate('/loans')}
    />
  )
}

// ---------------------------------------------------------------------------
// System Health Widget — GAP-052: real data, no hardcoded values
// ---------------------------------------------------------------------------
function SystemHealthWidget() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: getAggregateHealth,
    staleTime: 60_000,
    retry: false,
  })

  const services = data?.services ?? []
  const healthy = services.filter(s => s.status === 'healthy').length
  const allUnknown = services.length > 0 && services.every(s => s.status === 'unknown')

  const overallStatus = data?.overall ?? 'unknown'
  const overallColor =
    overallStatus === 'healthy' ? 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]'
    : overallStatus === 'down' ? 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]'
    : overallStatus === 'degraded' ? 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]'
    : 'bg-[var(--surface-sunken)] text-[var(--text-disabled)]'

  return (
    <section aria-labelledby="system-health-heading">
      <Card>
        <CardHeader
          title={t('dashboard.systemHealth.title')}
          subtitle={t('dashboard.systemHealth.subtitle')}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void navigate('/admin/system-health')}>
              {t('dashboard.systemHealth.cta')}
            </Button>
          }
        />
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]" />)}
          </div>
        ) : allUnknown ? (
          <div className="py-4 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t('dashboard.systemHealth.proxyMissing')}</p>
            <button
              onClick={() => void navigate('/admin/system-health')}
              className="mt-1 text-xs text-[var(--color-brand-500)] hover:underline"
            >
              {t('dashboard.systemHealth.cta')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2 p-3 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]">
              <div className={cn('self-start shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', overallColor)}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {t(`health.status.${overallStatus}`)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--text-secondary)] truncate">{t('dashboard.systemHealth.overall')}</p>
                <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{healthy}/{services.length}</p>
              </div>
            </div>
            {services.slice(0, 3).map(svc => {
              const svcColor =
                svc.status === 'healthy' ? 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]'
                : svc.status === 'down' ? 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]'
                : svc.status === 'degraded' ? 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]'
                : 'bg-[var(--surface-sunken)] text-[var(--text-disabled)]'
              const label = svc.name.replace(/-service$/, '').replace(/-/g, ' ')
              return (
                <div key={svc.name} className="flex flex-col gap-2 p-3 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]">
                  <div className={cn('self-start shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', svcColor)}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {t(`health.status.${svc.status}`)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-secondary)] capitalize truncate">{label}</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {svc.responseMs != null ? `${svc.responseMs}ms` : '—'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tier-section heading
// ---------------------------------------------------------------------------
function TierHeading({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2
        className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-widest"
        aria-label={label}
      >
        {label}
      </h2>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tier 3 tab bar for trends/queues
// ---------------------------------------------------------------------------
type Tier3Tab = 'activity' | 'chatQueue' | 'teamWorkload'

function Tier3TabBar({
  active,
  onChange,
}: {
  active: Tier3Tab
  onChange: (t: Tier3Tab) => void
}) {
  const tabs: Array<{ id: Tier3Tab; label: string }> = [
    { id: 'activity', label: t('dashboard.activity.heading') },
    { id: 'chatQueue', label: t('dashboard.chatQueue.title') },
    { id: 'teamWorkload', label: t('dashboard.teamWorkload.title') },
  ]

  // ARIA Tabs pattern (WAI-ARIA 1.2): ArrowLeft/ArrowRight navigate tabs with
  // wrap-around; Home/End jump to first/last; focus follows selection (automatic
  // activation). Roving tabIndex: active tab = 0, inactive tabs = -1.
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1
    }
    if (nextIndex !== null) {
      e.preventDefault()
      onChange(tabs[nextIndex].id)
      // Move DOM focus to the newly activated tab button
      const tabEl = document.getElementById(`tier3-tab-${tabs[nextIndex].id}`)
      tabEl?.focus()
    }
  }

  return (
    <div role="tablist" aria-label={t('dashboard.tier3.heading')} className="flex gap-1 border-b border-[var(--border-subtle)] mb-4">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`tier3-panel-${tab.id}`}
          id={`tier3-tab-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === tab.id
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity chart panel
// ---------------------------------------------------------------------------
function ActivityPanel({
  period,
  onPeriodChange,
  activityData,
  isLoading,
}: {
  period: '7D' | '30D' | '90D'
  onPeriodChange: (p: '7D' | '30D' | '90D') => void
  activityData: { date: string; documents: number; returns: number; itrs: number }[]
  isLoading: boolean
}) {
  return (
    <div id="tier3-panel-activity" role="tabpanel" aria-labelledby="tier3-tab-activity">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[var(--text-secondary)]">{t('dashboard.activity.subtitle')}</p>
        <div className="flex gap-1" role="group" aria-label={t('dashboard.period.ariaLabel')}>
          {(['7D', '30D', '90D'] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onPeriodChange(p)}
              aria-pressed={period === p}
            >
              {t(`dashboard.period.${p}`)}
            </Button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Skeleton variant="chart" />
      ) : (
        <div className="h-64" aria-label={t('dashboard.activity.ariaLabel')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-tertiary)' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12px',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-primary)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="documents"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                dot={false}
                name={t('dashboard.activity.series.documents')}
              />
              <Line
                type="monotone"
                dataKey="returns"
                stroke="var(--color-gst)"
                strokeWidth={2}
                dot={false}
                name={t('dashboard.activity.series.returns')}
              />
              <Line
                type="monotone"
                dataKey="itrs"
                stroke="var(--color-itr)"
                strokeWidth={2}
                dot={false}
                name={t('dashboard.activity.series.itrs')}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat queue panel
// ---------------------------------------------------------------------------
function ChatQueuePanel({
  chatQueue,
  isLoading,
}: {
  chatQueue: { threadId: string; subject?: string | null; category: string; waitMins: number }[]
  isLoading: boolean
}) {
  const navigate = useNavigate()
  return (
    <div id="tier3-panel-chatQueue" role="tabpanel" aria-labelledby="tier3-tab-chatQueue">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[var(--text-secondary)]">{t('dashboard.chatQueue.subtitle')}</p>
        <Button variant="ghost" size="sm" onClick={() => void navigate('/chat')}>
          {t('dashboard.chatQueue.cta')}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton variant="list" />
      ) : chatQueue.length === 0 ? (
        <EmptyState variant="chat.inbox" title={t('dashboard.chatQueue.empty')} size="sm" />
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {chatQueue.map((item) => (
            <div key={item.threadId} className="py-3 flex items-center justify-between hover:bg-[var(--surface-raised)] rounded-lg px-2 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-brand-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {item.subject || `Thread ${item.threadId.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">{item.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={cn(
                  'text-xs font-medium',
                  item.waitMins > 15 ? 'text-warning-600' : 'text-[var(--text-secondary)]'
                )}>
                  {t('dashboard.chatQueue.waitMins', { mins: item.waitMins })}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void navigate(`/chat?thread=${item.threadId}`)}
                >
                  {t('dashboard.chatQueue.open')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team workload panel
// ---------------------------------------------------------------------------
function TeamWorkloadPanel({
  teamWorkload,
  isLoading,
}: {
  teamWorkload: { userId: string; name: string; role: string; assigned: number; completed: number; slaBreaches: number }[]
  isLoading: boolean
}) {
  const navigate = useNavigate()
  return (
    <div id="tier3-panel-teamWorkload" role="tabpanel" aria-labelledby="tier3-tab-teamWorkload">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[var(--text-secondary)]">{t('dashboard.teamWorkload.subtitle')}</p>
        <Button variant="ghost" size="sm" onClick={() => void navigate('/team')}>
          {t('dashboard.teamWorkload.cta')}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : teamWorkload.length === 0 ? (
        <EmptyState variant="team" title={t('dashboard.teamWorkload.empty')} size="sm" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={t('dashboard.teamWorkload.title')}>
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {[
                  t('dashboard.teamWorkload.col.staff'),
                  t('dashboard.teamWorkload.col.assigned'),
                  t('dashboard.teamWorkload.col.done'),
                  t('dashboard.teamWorkload.col.sla'),
                ].map(col => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamWorkload.map((member) => (
                <tr
                  key={member.userId}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-raised)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{member.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{member.role}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{member.assigned}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{member.completed}</td>
                  <td className="px-4 py-3">
                    {member.slaBreaches > 0 ? (
                      <Badge variant="error" dot>
                        {member.slaBreaches > 1
                          ? t('dashboard.teamWorkload.sla.breachPlural', { count: member.slaBreaches })
                          : t('dashboard.teamWorkload.sla.breach', { count: member.slaBreaches })}
                      </Badge>
                    ) : (
                      <Badge variant="success" dot>{t('dashboard.teamWorkload.sla.ok')}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('7D')
  const [tier3Tab, setTier3Tab] = useState<Tier3Tab>('activity')
  const { hasPermission } = usePermission()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: getAdminDashboardStats,
    refetchInterval: 30_000,
  })

  const { data: activityData = [], isLoading: activityLoading } = useQuery({
    queryKey: ['admin-dashboard-activity', period],
    queryFn: () => getAdminDashboardActivity(period),
    refetchInterval: 60_000,
  })

  const { data: chatQueue = [], isLoading: chatLoading } = useQuery({
    queryKey: ['admin-dashboard-chat-queue'],
    queryFn: () => getAdminChatQueueSnapshot(10),
    refetchInterval: 30_000,
  })

  const { data: teamWorkload = [], isLoading: teamLoading } = useQuery({
    queryKey: ['admin-dashboard-team-workload'],
    queryFn: getAdminTeamWorkload,
    refetchInterval: 60_000,
  })

  const { data: auditEvents = [], isLoading: auditLoading } = useQuery({
    queryKey: ['admin-dashboard-audit-events'],
    queryFn: () => getAdminAuditEvents(20),
    refetchInterval: 30_000,
  })

  const statsErrors = data?.errors ?? {}
  const hasStatsErrors = Object.keys(statsErrors).length > 0

  // Per-service failures → undefined in API; show dash, never fabricate a number.
  const stats = {
    pendingDocuments: statsErrors.documents ? undefined : data?.pendingDocuments,
    gstReturnsDueToday: statsErrors.gst ? undefined : data?.gstReturnsDueToday,
    itrVerificationsPending: statsErrors.itr ? undefined : data?.itrVerificationsPending,
    openCallbacks: statsErrors.callbacks ? undefined : data?.openCallbacks,
    loanApplicationsActive: statsErrors.loans ? undefined : data?.loanApplicationsActive,
    pendingDocumentsOverThreshold: !statsErrors.documents && (data?.pendingDocuments ?? 0) > PENDING_DOCS_THRESHOLD,
    gstReturnsDueTodayUrgent: !statsErrors.gst && (data?.gstReturnsDueToday ?? 0) > 0,
  }

  const displayStat = (v: number | undefined) => (v === undefined ? '—' : v)

  // Urgent = any of the tier-1 metrics is actionable
  const hasUrgentItems = stats.gstReturnsDueTodayUrgent || stats.pendingDocumentsOverThreshold

  return (
    <div className="space-y-8">
      {/* ── Page header ── */}
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
            ariaLabel={t('dashboard.refreshAriaLabel')}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            {t('dashboard.refresh')}
          </Button>
        }
      />

      {hasStatsErrors && (
        <AlertBanner
          type="warning"
          title={t('dashboard.statsPartialError')}
          description={Object.keys(statsErrors).join(', ')}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void refetch()} loading={isFetching}>
              {t('dashboard.refresh')}
            </Button>
          }
        />
      )}

      {/* ── GST urgency alert banner (conditional) ── */}
      {stats.gstReturnsDueTodayUrgent && (
        <AlertBanner
          type="error"
          title={t('dashboard.gstDueAlert.title')}
          description={t('dashboard.gstDueAlert.description', { count: stats.gstReturnsDueToday ?? 0 })}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void navigate('/gst')}>
              {t('dashboard.gstDueAlert.cta')}
            </Button>
          }
        />
      )}

      {/* ════════════════════════════════════════════════════════
          TIER 1 — "Needs attention now" urgent band
          Promotes only metrics that imply an action.
          Urgent state: icon + semantic colour + word (not colour-only — a11y).
          ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="tier1-heading">
        <TierHeading label={t('dashboard.tier1.heading')}>
          <span className="sr-only" id="tier1-heading">{t('dashboard.tier1.heading')}</span>
        </TierHeading>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">

          {/* Pending Documents — urgent if over threshold */}
          <div
            role="group"
            className="h-full"
            aria-label={`${t('dashboard.kpi.pendingDocs')}, ${displayStat(stats.pendingDocuments)}, ${stats.pendingDocumentsOverThreshold ? t('dashboard.kpi.pendingDocs.urgent', { threshold: PENDING_DOCS_THRESHOLD }) : t('dashboard.kpi.pendingDocs.normal')}`}
          >
            <MetricCard
              className="h-full"
              title={t('dashboard.kpi.pendingDocs')}
              value={displayStat(stats.pendingDocuments)}
              color={stats.pendingDocumentsOverThreshold ? 'warning' : 'brand'}
              icon={<FileText className="h-6 w-6" />}
              trend={stats.pendingDocumentsOverThreshold ? 'up' : 'neutral'}
              trendValue={stats.pendingDocumentsOverThreshold
                ? t('dashboard.kpi.pendingDocs.urgent', { threshold: PENDING_DOCS_THRESHOLD })
                : t('dashboard.kpi.pendingDocs.normal')}
              loading={isLoading}
              onClick={() => void navigate('/documents')}
            />
          </div>

          {/* GST Returns Due Today — urgent if > 0 */}
          <div
            role="group"
            className="h-full"
            aria-label={`${t('dashboard.kpi.gstDueToday')}, ${displayStat(stats.gstReturnsDueToday)}, ${stats.gstReturnsDueTodayUrgent ? t('dashboard.kpi.gstDueToday.urgent') : t('dashboard.kpi.gstDueToday.ok')}`}
          >
            <MetricCard
              className="h-full"
              title={t('dashboard.kpi.gstDueToday')}
              value={displayStat(stats.gstReturnsDueToday)}
              color={stats.gstReturnsDueTodayUrgent ? 'error' : 'success'}
              icon={
                stats.gstReturnsDueTodayUrgent
                  ? <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                  : <Receipt className="h-6 w-6" aria-hidden="true" />
              }
              trend={stats.gstReturnsDueTodayUrgent ? 'down' : 'up'}
              trendValue={stats.gstReturnsDueTodayUrgent
                ? t('dashboard.kpi.gstDueToday.urgent')
                : t('dashboard.kpi.gstDueToday.ok')}
              loading={isLoading}
              onClick={() => void navigate('/gst')}
            />
          </div>

          {/* Open Callbacks */}
          <div
            role="group"
            className="h-full"
            aria-label={`${t('dashboard.kpi.openCallbacks')}, ${displayStat(stats.openCallbacks)}`}
          >
            <MetricCard
              className="h-full"
              title={t('dashboard.kpi.openCallbacks')}
              value={displayStat(stats.openCallbacks)}
              color="warning"
              icon={<Phone className="h-6 w-6" />}
              loading={isLoading}
              onClick={() => void navigate('/callbacks')}
            />
          </div>
        </div>

        {/* Urgent CTA row — only when there are actionable items */}
        {!isLoading && hasUrgentItems && (
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.gstReturnsDueTodayUrgent && (
              <Button
                variant="secondary"
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => void navigate('/gst')}
              >
                {t('dashboard.gstDueAlert.cta')}
              </Button>
            )}
            {stats.pendingDocumentsOverThreshold && (
              <Button
                variant="secondary"
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => void navigate('/documents')}
              >
                {t('dashboard.kpi.pendingDocs')} →
              </Button>
            )}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════
          TIER 2 — Operational KPI compact strip
          Non-urgent, calmer presentation. Not equal-weight hero cards.
          ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="tier2-heading">
        <TierHeading label={t('dashboard.tier2.heading')}>
          <span className="sr-only" id="tier2-heading">{t('dashboard.tier2.heading')}</span>
        </TierHeading>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">

          <div role="group" className="h-full" aria-label={`${t('dashboard.kpi.itrPending')}, ${displayStat(stats.itrVerificationsPending)}`}>
            <MetricCard
              className="h-full"
              title={t('dashboard.kpi.itrPending')}
              value={displayStat(stats.itrVerificationsPending)}
              color="itr"
              icon={<FileSpreadsheet className="h-5 w-5" />}
              loading={isLoading}
              onClick={() => void navigate('/itr')}
            />
          </div>

          <div role="group" className="h-full" aria-label={`${t('dashboard.kpi.activeLoans')}, ${displayStat(stats.loanApplicationsActive)}`}>
            <MetricCard
              className="h-full"
              title={t('dashboard.kpi.activeLoans')}
              value={displayStat(stats.loanApplicationsActive)}
              color="loan"
              icon={<CreditCard className="h-5 w-5" />}
              loading={isLoading}
              onClick={() => void navigate('/loans')}
            />
          </div>

          {/* Notices Due Widget fills remaining 2 cells */}
          <div className="col-span-1 sm:col-span-2 xl:col-span-2 h-full min-h-0">
            <NoticesDueWidget />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Row 3: Queue Status Mini-Widgets (GST/ITR/Loan)
          Live data — each card queries the same source as its list page
          so the counts match when the user opens the queue.
          ════════════════════════════════════════════════════════ */}
      <section aria-label="Queue status">
        {/* 3-up only at lg+ where each card is wide enough for a single-line CTA;
            below that the cards stack full-width so labels/buttons never wrap. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <GstQueueCard />
          <ItrQueueCard />
          <LoanQueueCard activeCount={displayStat(stats.loanApplicationsActive)} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TIER 3 — Trends & queues (tabbed — progressive disclosure)
          Visible to dashboard.full permission holders.
          ════════════════════════════════════════════════════════ */}
      {hasPermission('dashboard.full') && (
        <section aria-labelledby="tier3-heading">
          <TierHeading label={t('dashboard.tier3.heading')}>
            <span className="sr-only" id="tier3-heading">{t('dashboard.tier3.heading')}</span>
            <SampleDataBadge />
          </TierHeading>
          <Card className="mt-3">
            <Tier3TabBar active={tier3Tab} onChange={setTier3Tab} />

            {tier3Tab === 'activity' && (
              <ActivityPanel
                period={period}
                onPeriodChange={setPeriod}
                activityData={activityData}
                isLoading={activityLoading}
              />
            )}
            {tier3Tab === 'chatQueue' && (
              <ChatQueuePanel chatQueue={chatQueue} isLoading={chatLoading} />
            )}
            {tier3Tab === 'teamWorkload' && (
              <TeamWorkloadPanel teamWorkload={teamWorkload} isLoading={teamLoading} />
            )}
          </Card>
        </section>
      )}

      {/* ── System Health (System Admin only) — GAP-052 fixed: no longer hardcoded ── */}
      {hasPermission('dashboard.system_health') && (
        <SystemHealthWidget />
      )}

      {/* ── Recent Audit Events ── */}
      <section aria-labelledby="audit-heading">
        <Card padding="none">
          <div className="p-5 border-b border-[var(--border-subtle)]">
            <CardHeader
              title={t('dashboard.recentActivity.title')}
              subtitle={t('dashboard.recentActivity.subtitle')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => void navigate('/admin/audit-log')}>
                  {t('dashboard.recentActivity.cta')}
                </Button>
              }
            />
          </div>
          <div
            role="feed"
            aria-label={t('dashboard.recentActivity.ariaLabel')}
            aria-busy={auditLoading}
          >
            {auditLoading ? (
              <div className="p-4">
                <Skeleton variant="list" />
              </div>
            ) : auditEvents.length === 0 ? (
              <EmptyState
                variant="generic"
                title={t('dashboard.recentActivity.empty')}
                size="sm"
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {auditEvents.map((event) => (
                  <div key={event.id} className="px-5 py-3 flex items-center gap-3">
                    <Activity className="h-4 w-4 text-[var(--text-disabled)] shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">
                        {event.action} · {event.entityType}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {event.service} · {event.actorType.toLowerCase()} · {formatRelativeTime(new Date(event.eventTime))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  )
}
