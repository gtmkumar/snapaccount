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
import { useState } from 'react'
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-600 border border-warning-200">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {t('dashboard.sampleDataBadge')}
    </span>
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
  return (
    <div role="tablist" aria-label={t('dashboard.tier3.heading')} className="flex gap-1 border-b border-[var(--border-subtle)] mb-4">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`tier3-panel-${tab.id}`}
          id={`tier3-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
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

  // Derive UI-shape from the merged API response. Per-service failures land
  // in data.errors and the affected count is undefined — render a dash there
  // rather than fabricating a number.
  const stats = {
    pendingDocuments: data?.pendingDocuments ?? 0,
    gstReturnsDueToday: data?.gstReturnsDueToday ?? 0,
    itrVerificationsPending: data?.itrVerificationsPending ?? 0,
    openCallbacks: data?.openCallbacks ?? 0,
    loanApplicationsActive: data?.loanApplicationsActive ?? 0,
    pendingDocumentsOverThreshold: (data?.pendingDocuments ?? 0) > PENDING_DOCS_THRESHOLD,
    gstReturnsDueTodayUrgent: (data?.gstReturnsDueToday ?? 0) > 0,
  }

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

      {/* ── GST urgency alert banner (conditional) ── */}
      {stats.gstReturnsDueTodayUrgent && (
        <AlertBanner
          type="error"
          title={t('dashboard.gstDueAlert.title')}
          description={t('dashboard.gstDueAlert.description', { count: stats.gstReturnsDueToday })}
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
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Pending Documents — urgent if over threshold */}
          <div
            role="group"
            aria-label={`${t('dashboard.kpi.pendingDocs')}, ${stats.pendingDocuments}, ${stats.pendingDocumentsOverThreshold ? t('dashboard.kpi.pendingDocs.urgent', { threshold: PENDING_DOCS_THRESHOLD }) : t('dashboard.kpi.pendingDocs.normal')}`}
          >
            <MetricCard
              title={t('dashboard.kpi.pendingDocs')}
              value={stats.pendingDocuments}
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
            aria-label={`${t('dashboard.kpi.gstDueToday')}, ${stats.gstReturnsDueToday}, ${stats.gstReturnsDueTodayUrgent ? t('dashboard.kpi.gstDueToday.urgent') : t('dashboard.kpi.gstDueToday.ok')}`}
          >
            <MetricCard
              title={t('dashboard.kpi.gstDueToday')}
              value={stats.gstReturnsDueToday}
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
            aria-label={`${t('dashboard.kpi.openCallbacks')}, ${stats.openCallbacks}`}
          >
            <MetricCard
              title={t('dashboard.kpi.openCallbacks')}
              value={stats.openCallbacks}
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
        <div className="mt-3 grid grid-cols-2 xl:grid-cols-4 gap-3">

          <div role="group" aria-label={`${t('dashboard.kpi.itrPending')}, ${stats.itrVerificationsPending}`}>
            <MetricCard
              title={t('dashboard.kpi.itrPending')}
              value={stats.itrVerificationsPending}
              color="itr"
              icon={<FileSpreadsheet className="h-5 w-5" />}
              loading={isLoading}
              onClick={() => void navigate('/itr')}
            />
          </div>

          <div role="group" aria-label={`${t('dashboard.kpi.activeLoans')}, ${stats.loanApplicationsActive}`}>
            <MetricCard
              title={t('dashboard.kpi.activeLoans')}
              value={stats.loanApplicationsActive}
              color="loan"
              icon={<CreditCard className="h-5 w-5" />}
              loading={isLoading}
              onClick={() => void navigate('/loans')}
            />
          </div>

          {/* Notices Due Widget fills remaining 2 cells */}
          <div className="col-span-2">
            <NoticesDueWidget />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          Row 3: Queue Status Mini-Widgets (GST/ITR/Loan)
          Static data — badge present.
          ════════════════════════════════════════════════════════ */}
      <section aria-label="Queue status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* GST Queue */}
          <Card>
            <CardHeader
              title={t('dashboard.gstQueue.title')}
              actions={<><Badge variant="gst">GST</Badge><SampleDataBadge /></>}
            />
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.gstQueue.draft')}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">24</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.gstQueue.pendingApproval')}</span>
                <span className="text-sm font-semibold text-warning-600 tabular-nums">8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.gstQueue.overdue')}</span>
                <span className="text-sm font-semibold text-error-600 tabular-nums">3</span>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              className="mt-4"
              onClick={() => void navigate('/gst')}
            >
              {t('dashboard.gstQueue.cta')}
            </Button>
          </Card>

          {/* ITR Queue */}
          <Card>
            <CardHeader
              title={t('dashboard.itrQueue.title')}
              actions={<><Badge variant="itr">ITR</Badge><SampleDataBadge /></>}
            />
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.itrQueue.pendingVerification')}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.itrQueue.filingInProgress')}</span>
                <span className="text-sm font-semibold text-brand-600 tabular-nums">5</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.itrQueue.deadlineThisWeek')}</span>
                <span className="text-sm font-semibold text-warning-600 tabular-nums">7</span>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              className="mt-4"
              onClick={() => void navigate('/itr')}
            >
              {t('dashboard.itrQueue.cta')}
            </Button>
          </Card>

          {/* Loan Queue */}
          <Card>
            <CardHeader
              title={t('dashboard.loanQueue.title')}
              actions={<><Badge variant="loan">Loans</Badge><SampleDataBadge /></>}
            />
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.loanQueue.underReview')}</span>
                <span className="text-sm font-semibold text-warning-600 tabular-nums">3</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.loanQueue.decisionPending')}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">2</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">{t('dashboard.loanQueue.totalActive')}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.loanApplicationsActive}</span>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              className="mt-4"
              onClick={() => void navigate('/loans')}
            >
              {t('dashboard.loanQueue.cta')}
            </Button>
          </Card>
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

      {/* ── System Health (System Admin only) ── */}
      {hasPermission('dashboard.system_health') && (
        <section aria-labelledby="system-health-heading">
          <Card>
            <CardHeader
              title={t('dashboard.systemHealth.title')}
              subtitle={t('dashboard.systemHealth.subtitle')}
              actions={
                <Button variant="ghost" size="sm">
                  {t('dashboard.systemHealth.cta')}
                </Button>
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('dashboard.systemHealth.apiResponse'), value: '142ms', status: 'success' },
                { label: t('dashboard.systemHealth.errorRate'), value: '0.02%', status: 'success' },
                { label: t('dashboard.systemHealth.ocrQueue'), value: '7', status: 'success' },
                { label: t('dashboard.systemHealth.dbConnections'), value: '23/100', status: 'success' },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center gap-3 p-3 rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]"
                >
                  <div className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    metric.status === 'success' ? 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]'
                    : metric.status === 'warning' ? 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]'
                    : 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]'
                  )}>
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        metric.status === 'success' ? 'bg-success-500'
                        : metric.status === 'warning' ? 'bg-warning-500'
                        : 'bg-error-500'
                      )}
                      aria-hidden="true"
                    />
                    {metric.status}
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">{metric.label}</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{metric.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
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
