/**
 * ItrPage — 4-tab ITR admin workspace (Phase 6D rewrite)
 * Route: /itr
 * Tabs: Verification Queue · CA Computation Panel · Filing Queue · Notice Tracker
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DueDateChip } from '@/components/ui/DueDateChip'
import { Card } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { MetricCard } from '@/components/shared/MetricCard'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listFilings,
  listItrNotices,
  getVerificationKpi,
  markFiled,
  type Filing,
  type FilingStatus,
  type ItrNotice,
} from '@/lib/itrApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_AY = 'AY2026-27'

function filingStatusBadge(status: FilingStatus) {
  const config: Record<FilingStatus, { variant: 'neutral' | 'warning' | 'info' | 'success' | 'brand' | 'error'; label: string }> = {
    DRAFT: { variant: 'neutral', label: t('itr.admin.status.draft') },
    UNDER_CA_REVIEW: { variant: 'warning', label: t('itr.admin.status.underCaReview') },
    USER_APPROVED: { variant: 'info', label: t('itr.admin.status.userApproved') },
    FILED: { variant: 'success', label: t('itr.admin.status.filed') },
    E_VERIFIED: { variant: 'brand', label: t('itr.admin.status.eVerified') },
    REFUND_ISSUED: { variant: 'success', label: t('itr.admin.status.refundIssued') },
    NOTICE_RECEIVED: { variant: 'error', label: t('itr.admin.status.noticeReceived') },
  }
  const cfg = config[status] ?? { variant: 'neutral' as const, label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function slaPillClass(slaExpiresAt: string | null | undefined): string {
  if (!slaExpiresAt) return 'bg-neutral-100 text-neutral-500'
  const ms = new Date(slaExpiresAt).getTime() - Date.now()
  const hours = ms / (1000 * 60 * 60)
  if (hours < 0) return 'bg-error-100 text-error-700'
  if (hours < 24) return 'bg-warning-100 text-warning-800'
  if (hours < 48) return 'bg-amber-100 text-amber-700'
  return 'bg-success-50 text-success-700'
}

function formatSlaLabel(slaExpiresAt: string | null | undefined): string {
  if (!slaExpiresAt) return '—'
  const ms = new Date(slaExpiresAt).getTime() - Date.now()
  const hours = ms / (1000 * 60 * 60)
  if (hours < 0) return t('itr.admin.sla.breached')
  if (hours < 24) return `< 24h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ---------------------------------------------------------------------------
// Mark Filed Modal
// ---------------------------------------------------------------------------

interface MarkFiledModalProps {
  filingId: string
  userName: string
  onClose: () => void
  onDone: () => void
}

function MarkFiledModal({ filingId, userName, onClose, onDone }: MarkFiledModalProps) {
  const [ackNo, setAckNo] = useState('')
  const mutation = useMutation({
    mutationFn: () => markFiled(filingId, ackNo),
    onSuccess: () => {
      toast.success(t('itr.admin.filing.markFiled.success'))
      onDone()
    },
    onError: () => toast.error(t('itr.admin.filing.markFiled.error')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">{t('itr.admin.filing.markFiledModal.heading')}</h2>
        <p className="text-sm text-neutral-500">{userName}</p>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            {t('itr.admin.filing.column.ackNumber')} *
          </label>
          <input
            type="text"
            value={ackNo}
            onChange={e => setAckNo(e.target.value)}
            placeholder={t('itr.admin.filing.markFiledModal.ackPlaceholder')}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-brand-500 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            fullWidth
            disabled={!ackNo.trim() || mutation.isPending}
            onClick={() => void mutation.mutate()}
          >
            {mutation.isPending ? '…' : t('itr.admin.filing.markFiledModal.submit')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('itr.admin.filing.markFiledModal.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 1: Verification Queue
// ---------------------------------------------------------------------------

function VerificationQueueTab({ ay }: { ay: string }) {
  const navigate = useNavigate()

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['itr-kpi', ay],
    queryFn: () => getVerificationKpi(ay),
    staleTime: 60_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['itr-filings-verification', ay],
    queryFn: () => listFilings({ status: 'UNDER_CA_REVIEW', assessmentYear: ay }),
    staleTime: 30_000,
  })

  const filings = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title={t('itr.admin.kpi.awaitingReview')}
          value={kpiLoading ? '…' : String(kpi?.awaitingReview ?? 0)}
          icon={<Clock className="h-5 w-5 text-warning-500" />}
        />
        <MetricCard
          title={t('itr.admin.kpi.slaBreached')}
          value={kpiLoading ? '…' : String(kpi?.slaBreached ?? 0)}
          icon={<AlertTriangle className="h-5 w-5 text-error-500" />}
        />
        <MetricCard
          title={t('itr.admin.kpi.avgTimeToReview')}
          value={kpiLoading ? '…' : `${kpi?.avgTimeToReviewDays?.toFixed(1) ?? '—'}d`}
          icon={<CheckCircle className="h-5 w-5 text-success-500" />}
        />
        <MetricCard
          title={t('itr.admin.kpi.totalFilings')}
          value={kpiLoading ? '…' : String(kpi?.totalFilingsAy ?? 0)}
          icon={<FileSpreadsheet className="h-5 w-5 text-brand-500" />}
        />
      </div>

      {isError && (
        <AlertBanner
          type="error"
          title={t('itr.admin.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('itr.admin.error.retry')}
            </button>
          }
        />
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-xl" />)}
        </div>
      ) : filings.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle className="h-10 w-10 text-success-300" />
            <p className="text-base font-semibold text-neutral-700">{t('itr.admin.empty.verification')}</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {[
                  t('itr.admin.verification.column.user'),
                  t('itr.admin.verification.column.pan'),
                  t('itr.admin.verification.column.form'),
                  t('itr.admin.verification.column.submitted'),
                  t('itr.admin.verification.column.sla'),
                  t('itr.admin.verification.column.action'),
                ].map(col => (
                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filings.map(filing => (
                <tr
                  key={filing.id}
                  className="hover:bg-neutral-50 cursor-pointer"
                  onClick={() => void navigate(`/itr/${filing.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {filing.assesseeName ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                    ···{filing.panLast4}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{filing.itrFormType}</td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
                    {filing.submittedAt
                      ? new Date(filing.submittedAt).toLocaleDateString('en-IN')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      slaPillClass(filing.slaExpiresAt)
                    )}>
                      {formatSlaLabel(filing.slaExpiresAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={e => { e.stopPropagation(); void navigate(`/itr/${filing.id}/computation`) }}
                    >
                      {t('itr.admin.verification.action.open')}
                    </Button>
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
// Tab 2: CA Computation Panel (embedded / redirect to full page)
// ---------------------------------------------------------------------------

function ComputationPanelTab({ ay }: { ay: string }) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['itr-filings-top3', ay],
    queryFn: () => listFilings({ status: 'UNDER_CA_REVIEW', assessmentYear: ay, pageSize: 3 }),
    staleTime: 30_000,
  })

  const urgent = data?.items ?? []

  return (
    <div className="flex flex-col items-center py-12 gap-4 max-w-lg mx-auto text-center">
      <FileSpreadsheet className="h-12 w-12 text-neutral-300" />
      <p className="text-base font-semibold text-neutral-700">
        {t('itr.admin.computationPanel.selectFiling')}
      </p>
      <p className="text-sm text-neutral-400">
        {t('itr.admin.computationPanel.selectFilingBody')}
      </p>
      {!isLoading && urgent.length > 0 && (
        <div className="w-full space-y-2">
          <p className="text-xs text-neutral-500 font-medium">{t('itr.admin.computationPanel.urgent')}</p>
          {urgent.map(f => (
            <button
              key={f.id}
              onClick={() => void navigate(`/itr/${f.id}/computation`)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-left"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{f.assesseeName ?? '—'}</p>
                <p className="text-xs text-neutral-400">{f.itrFormType} · AY {ay}</p>
              </div>
              {f.slaExpiresAt && (
                <DueDateChip dueDate={f.slaExpiresAt} size="sm" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3: Filing Queue
// ---------------------------------------------------------------------------

function FilingQueueTab({ ay }: { ay: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [markFiledModal, setMarkFiledModal] = useState<Filing | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['itr-filings-queue', ay],
    queryFn: () => listFilings({ status: 'USER_APPROVED', assessmentYear: ay }),
    staleTime: 30_000,
  })

  const filings = data?.items ?? []

  return (
    <div className="space-y-4">
      {isError && (
        <AlertBanner
          type="error"
          title={t('itr.admin.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('itr.admin.error.retry')}
            </button>
          }
        />
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-xl" />)}
        </div>
      ) : filings.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 gap-3">
            <Inbox className="h-10 w-10 text-neutral-300" />
            <p className="text-base font-semibold text-neutral-700">{t('itr.admin.empty.filing')}</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {[
                  t('itr.admin.verification.column.user'),
                  t('itr.admin.verification.column.form'),
                  t('itr.admin.filing.column.taxOrRefund'),
                  t('itr.admin.filing.column.approvedOn'),
                  t('itr.admin.filing.column.filingStatus'),
                  t('itr.admin.filing.column.action'),
                ].map(col => (
                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filings.map(filing => (
                <tr
                  key={filing.id}
                  className="hover:bg-neutral-50 cursor-pointer"
                  onClick={() => void navigate(`/itr/${filing.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">{filing.assesseeName ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{filing.itrFormType}</td>
                  <td className="px-4 py-3">
                    {filing.payableOrRefund != null ? (
                      <AmountDisplay amount={filing.payableOrRefund} size="sm" colorCode />
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
                    {filing.approvedAt ? new Date(filing.approvedAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {filingStatusBadge(filing.status)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={e => { e.stopPropagation(); setMarkFiledModal(filing) }}
                      >
                        {t('itr.admin.filing.action.markFiled')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); void navigate(`/itr/${filing.id}`) }}
                      >
                        {t('itr.admin.filing.action.view')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {markFiledModal && (
        <MarkFiledModal
          filingId={markFiledModal.id}
          userName={markFiledModal.assesseeName ?? markFiledModal.id}
          onClose={() => setMarkFiledModal(null)}
          onDone={() => {
            setMarkFiledModal(null)
            void queryClient.invalidateQueries({ queryKey: ['itr-filings-queue'] })
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4: Notice Tracker
// ---------------------------------------------------------------------------

function NoticeTrackerTab({ ay }: { ay: string }) {
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['itr-notices', ay],
    queryFn: () => listItrNotices({ assessmentYear: ay }),
    staleTime: 30_000,
  })

  const notices = data?.items ?? []

  function severityBadge(severity: ItrNotice['severity']) {
    if (!severity) return null
    const config = {
      HIGH: { variant: 'error' as const, label: t('itr.admin.notice.severity.high') },
      MEDIUM: { variant: 'warning' as const, label: t('itr.admin.notice.severity.medium') },
      LOW: { variant: 'neutral' as const, label: t('itr.admin.notice.severity.low') },
    }
    const cfg = config[severity]
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>
  }

  return (
    <div className="space-y-4">
      {isError && (
        <AlertBanner
          type="error"
          title={t('itr.admin.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('itr.admin.error.retry')}
            </button>
          }
        />
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[var(--surface-sunken)] rounded-xl" />)}
        </div>
      ) : isError ? null : notices.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 gap-3">
            <Inbox className="h-10 w-10 text-neutral-300" />
            <p className="text-base font-semibold text-neutral-700">
              {t('itr.admin.empty.notice', { ay })}
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {[
                  t('itr.admin.verification.column.user'),
                  t('itr.admin.notice.column.section'),
                  t('itr.admin.notice.column.demand'),
                  t('itr.admin.notice.column.severity'),
                  t('admin.gst.notice.col.received'),
                  t('admin.gst.notice.col.due'),
                  t('admin.gst.notice.col.status'),
                  t('itr.admin.verification.column.action'),
                ].map(col => (
                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {notices.map(notice => (
                <tr key={notice.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-800">{notice.assesseeId}</td>
                  <td className="px-4 py-3 text-neutral-600">{notice.noticeSection ?? notice.noticeType}</td>
                  <td className="px-4 py-3">
                    {notice.demandAmount != null
                      ? <AmountDisplay amount={notice.demandAmount} size="sm" />
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{severityBadge(notice.severity)}</td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
                    {new Date(notice.issuedDate).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    {notice.dueDate
                      ? <DueDateChip dueDate={notice.dueDate} size="sm" />
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={notice.status === 'RECEIVED' ? 'info' : notice.status === 'UNDER_REVIEW' ? 'warning' : notice.status === 'RESPONDED' ? 'brand' : 'success'}>
                      {notice.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void navigate(`/itr/${notice.filingId ?? 'notices'}/${notice.id}`)}
                    >
                      {t('itr.admin.notice.action.open')}
                    </Button>
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
// Page shell
// ---------------------------------------------------------------------------

type TabKey = 'verificationQueue' | 'computationPanel' | 'filingQueue' | 'noticeTracker'

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'verificationQueue', labelKey: 'itr.admin.tabs.verificationQueue' },
  { key: 'computationPanel', labelKey: 'itr.admin.tabs.computationPanel' },
  { key: 'filingQueue', labelKey: 'itr.admin.tabs.filingQueue' },
  { key: 'noticeTracker', labelKey: 'itr.admin.tabs.noticeTracker' },
]

export default function ItrPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('verificationQueue')
  const [ay, setAy] = useState(CURRENT_AY)

  const AY_OPTIONS = ['AY2026-27', 'AY2025-26', 'AY2024-25']

  return (
    <main aria-labelledby="itr-page-title" className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 id="itr-page-title" className="text-xl font-bold text-neutral-900">
          {t('itr.admin.page.title')}
        </h1>
        <div className="flex items-center gap-2">
          <label htmlFor="ay-select" className="text-sm text-neutral-500">
            {t('itr.admin.ayFilter.label')}
          </label>
          <select
            id="ay-select"
            value={ay}
            onChange={e => setAy(e.target.value)}
            aria-label={t('itr.admin.ayFilter.label')}
            className="text-sm rounded-lg border border-neutral-300 px-3 py-1.5 focus:outline-none focus:border-brand-500"
          >
            {AY_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="sticky top-16 z-10 flex border-b border-neutral-200 bg-white -mx-4 px-4 overflow-x-auto"
        role="tablist"
        aria-label={t('itr.admin.page.title')}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'verificationQueue' && <VerificationQueueTab ay={ay} />}
        {activeTab === 'computationPanel' && <ComputationPanelTab ay={ay} />}
        {activeTab === 'filingQueue' && <FilingQueueTab ay={ay} />}
        {activeTab === 'noticeTracker' && <NoticeTrackerTab ay={ay} />}
      </div>
    </main>
  )
}
