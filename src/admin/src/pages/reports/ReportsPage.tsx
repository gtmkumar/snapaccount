/**
 * ReportsPage — Phase 6F Track F3 (DG-DASH-07 enhanced)
 * Generate, preview, download, share-with-CA/bank for 6 report types.
 *
 * DG-DASH-07 additions:
 * - Comparative checkbox (P&L, BS, CashFlow types only)
 * - Currency display chip group (₹ exact / Lakhs / Crores)
 * - KpiStrip after generation (last generated, size, pages, status)
 * - Right-pane PdfViewer (PdfViewerWebPackagePane) for completed jobs
 * - Two-tab Share modal: Share-with-CA / Share-with-Bank, expiry chips, DisclaimerCard
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import {
  BarChart3, Download, Share2, RefreshCw, Play,
  FileText, TrendingUp, Scale, Droplets, Calculator, BookOpen,
  Clock, Database, X, ChevronRight,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { Badge } from '@/components/ui/Badge'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { MetricCard } from '@/components/shared/MetricCard'
import { Dialog } from '@/components/ui/Dialog'
import { PdfViewerWebPackagePane } from '@/components/ui/PdfViewerWebPackagePane'
import {
  listReportJobs, generateReport, getReportDownloadUrl, generateShareLink,
  enqueueTallyExport, listTallyExportJobs,
  type ReportType, type ReportJobSummary, type ReportCurrencyDisplay,
} from '@/lib/reportApi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Report types that support a comparative (prior-period) column */
const COMPARATIVE_TYPES: ReportType[] = ['ProfitAndLoss', 'BalanceSheet', 'CashFlow']

const REPORT_TYPES: Array<{
  type: ReportType
  labelKey: string
  descKey: string
  icon: typeof BarChart3
  color: string
}> = [
  { type: 'TrialBalance', labelKey: 'TrialBalance', descKey: 'tb', icon: Scale, color: 'text-indigo-600 dark:text-indigo-400' },
  { type: 'ProfitAndLoss', labelKey: 'ProfitAndLoss', descKey: 'pl', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400' },
  { type: 'BalanceSheet', labelKey: 'BalanceSheet', descKey: 'bs', icon: Scale, color: 'text-sky-600 dark:text-sky-400' },
  { type: 'CashFlow', labelKey: 'CashFlow', descKey: 'cf', icon: Droplets, color: 'text-teal-600 dark:text-teal-400' },
  { type: 'TaxLiability', labelKey: 'TaxLiability', descKey: 'tax', icon: Calculator, color: 'text-amber-600 dark:text-amber-400' },
  { type: 'LedgerByAccount', labelKey: 'LedgerByAccount', descKey: 'ledger', icon: BookOpen, color: 'text-violet-600 dark:text-violet-400' },
]

const REPORT_LABELS: Record<ReportType | string, string> = {
  TrialBalance: 'Trial Balance',
  ProfitAndLoss: 'Profit & Loss',
  BalanceSheet: 'Balance Sheet',
  CashFlow: 'Cash Flow',
  TaxLiability: 'Tax Liability',
  LedgerByAccount: 'Ledger',
  LoanPackage: 'Loan Package',
}

const REPORT_DESCS: Record<string, string> = {
  tb: 'Debit/credit summary of all accounts',
  pl: 'Income vs expense for the period',
  bs: 'Assets, liabilities and equity snapshot',
  cf: 'Operating, investing and financing cash flows',
  tax: 'GST and income tax payable summary',
  ledger: 'Detailed transaction log by account',
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  COMPLETE: 'success',
  GENERATING: 'warning',
  QUEUED: 'info',
  FAILED: 'error',
}

const CURRENCY_OPTIONS: Array<{ value: ReportCurrencyDisplay; labelKey: string }> = [
  { value: 'exact', labelKey: 'reports.form.currency.exact' },
  { value: 'lakh', labelKey: 'reports.form.currency.lakh' },
  { value: 'crore', labelKey: 'reports.form.currency.crore' },
]

const EXPIRY_OPTIONS: Array<{ hours: number; labelKey: string }> = [
  { hours: 24, labelKey: 'reports.share.expiry.24h' },
  { hours: 7 * 24, labelKey: 'reports.share.expiry.7d' },
  { hours: 30 * 24, labelKey: 'reports.share.expiry.30d' },
  { hours: 0, labelKey: 'reports.share.expiry.never' },
]

// ---------------------------------------------------------------------------
// KpiStrip (DG-DASH-07)
// ---------------------------------------------------------------------------

interface ReportKpiStripProps {
  job: ReportJobSummary | null
  loading?: boolean
  onOpenPreview: (job: ReportJobSummary) => void
  onShare: (job: ReportJobSummary) => void
}

function ReportKpiStrip({ job, loading, onOpenPreview, onShare }: ReportKpiStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-20" />
        ))}
      </div>
    )
  }
  if (!job) return null

  const statusToColor: Record<string, 'brand' | 'success' | 'warning' | 'error'> = {
    COMPLETE: 'success',
    GENERATING: 'warning',
    QUEUED: 'brand',
    FAILED: 'error',
  }

  const tiles = [
    {
      title: t('reports.kpi.lastGenerated'),
      value: job.createdAt ? format(new Date(job.createdAt), 'dd/MM/yy HH:mm') : '—',
      color: 'brand' as const,
    },
    {
      title: t('reports.kpi.status'),
      value: job.status,
      color: (statusToColor[job.status] ?? 'brand') as 'brand' | 'success' | 'warning' | 'error',
    },
    {
      title: t('reports.kpi.pages'),
      value: '—',
      color: 'brand' as const,
    },
    {
      title: t('reports.kpi.size'),
      value: '—',
      color: 'brand' as const,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(tile => (
          <MetricCard key={tile.title} title={tile.title} value={tile.value} color={tile.color} />
        ))}
      </div>
      {job.status === 'COMPLETE' && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => onOpenPreview(job)}>
            <FileText className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {t('reports.kpi.openPreview')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onShare(job)}>
            <Share2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {t('reports.kpi.shareReport')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReportShareModal (DG-DASH-07)
// Two tabs: Share with CA / Share with Bank
// ---------------------------------------------------------------------------

type ShareTab = 'ca' | 'bank'

interface ReportShareModalProps {
  open: boolean
  onClose: () => void
  job: ReportJobSummary | null
}

function ReportShareModal({ open, onClose, job }: ReportShareModalProps) {
  const [activeTab, setActiveTab] = useState<ShareTab>('ca')
  const [expiryHours, setExpiryHours] = useState<number>(24)
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!job) throw new Error('No job selected')
      return generateShareLink(job.jobId, { expiryHours, message: message || undefined })
    },
    onSuccess: (data) => {
      void navigator.clipboard.writeText(data.url)
      toast.success(t('reports.share.copied'))
      void queryClient.invalidateQueries({ queryKey: ['reports', 'jobs'] })
      onClose()
    },
    onError: () => toast.error(t('reports.shareError')),
  })

  const handleSend = () => {
    shareMutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('reports.share.modal.title')}
      size="lg"
    >
      {/* Tabs */}
      <div className="flex border-b border-[var(--border-subtle)] mb-4">
        <button
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'ca'
              ? 'border-[var(--brand-500)] text-[var(--brand-600)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
          onClick={() => setActiveTab('ca')}
        >
          {t('reports.share.modal.ca.title')}
        </button>
        <button
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'bank'
              ? 'border-[var(--brand-500)] text-[var(--brand-600)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
          onClick={() => setActiveTab('bank')}
        >
          {t('reports.share.modal.bank.title')}
        </button>
      </div>

      <div className="space-y-4">
        {/* Recipient placeholder — full combobox deferred until CA/bank registry API available */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {activeTab === 'ca'
              ? t('reports.share.modal.ca.select')
              : t('reports.share.modal.bank.select')}
          </label>
          <div className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] rounded-lg px-3 py-2.5 border border-[var(--border-subtle)]">
            {activeTab === 'ca' ? t('reports.share.modal.ca.select') : t('reports.share.modal.bank.select')} (combobox — CA/Bank registry API)
          </div>
        </div>

        {/* Expiry chips */}
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            {t('reports.share.expiry.label')}
          </p>
          <div className="flex gap-2 flex-wrap">
            {EXPIRY_OPTIONS.map(opt => {
              // Bank tab: cap at 7 days per compliance
              const disabled = activeTab === 'bank' && opt.hours > 7 * 24 && opt.hours !== 0
              return (
                <button
                  key={opt.hours}
                  disabled={disabled}
                  onClick={() => !disabled && setExpiryHours(opt.hours)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    expiryHours === opt.hours && !disabled
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]'
                      : disabled
                        ? 'border-[var(--border-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                        : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--brand-400)]'
                  )}
                >
                  {t(opt.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Optional message (CA only) */}
        {activeTab === 'ca' && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('reports.share.modal.ca.message')}
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="w-full text-sm rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)] resize-none"
              placeholder={t('reports.share.modal.ca.message')}
            />
          </div>
        )}

        {/* DisclaimerCard (always shown per spec) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {t('reports.preview.disclaimer')}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4 mr-1" />
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSend}
          loading={shareMutation.isPending}
        >
          <ChevronRight className="h-4 w-4 mr-1" />
          {activeTab === 'ca'
            ? t('reports.share.modal.ca.send')
            : t('reports.share.modal.bank.send')}
        </Button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const queryClient = useQueryClient()
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [fy, setFy] = useState('2025-26')
  const [comparative, setComparative] = useState(false)
  const [currencyDisplay, setCurrencyDisplay] = useState<ReportCurrencyDisplay>('exact')
  const [lastGeneratedJob, setLastGeneratedJob] = useState<ReportJobSummary | null>(null)
  const [previewJob, setPreviewJob] = useState<ReportJobSummary | null>(null)
  const [shareJob, setShareJob] = useState<ReportJobSummary | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('ProfitAndLoss')

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['reports', 'jobs'],
    queryFn: () => listReportJobs({ pageSize: 20 }),
    staleTime: 30_000,
  })

  const generateMutation = useMutation({
    mutationFn: (type: ReportType) => generateReport({
      reportType: type,
      format: 'Pdf',
      financialYear: fy,
      periodStart: dateRange.start?.toISOString(),
      periodEnd: dateRange.end?.toISOString(),
      comparative: COMPARATIVE_TYPES.includes(type) ? comparative : undefined,
      currencyDisplay,
    }),
    onSuccess: (data, type) => {
      toast.success(t('reports.generated', { jobId: data.jobId.slice(0, 8) }))
      void queryClient.invalidateQueries({ queryKey: ['reports', 'jobs'] })
      // Build a synthetic job for KpiStrip
      setLastGeneratedJob({
        jobId: data.jobId,
        reportType: type,
        format: 'Pdf',
        status: data.status,
        createdAt: new Date().toISOString(),
      })
    },
    onError: () => toast.error(t('reports.error')),
  })

  const downloadMutation = useMutation({
    mutationFn: (jobId: string) => getReportDownloadUrl(jobId),
    onSuccess: (data) => {
      window.open(data.url, '_blank')
      toast.success(t('reports.downloading'))
    },
  })

  const openPreviewMutation = useMutation({
    mutationFn: (job: ReportJobSummary) => getReportDownloadUrl(job.jobId),
    onSuccess: (data, job) => {
      setPreviewUrl(data.url)
      setPreviewJob(job)
    },
    onError: () => toast.error(t('reports.error')),
  })

  // GAP-032 Tally export
  const { data: tallyJobs, isLoading: tallyJobsLoading } = useQuery({
    queryKey: ['tally-export-jobs'],
    queryFn: () => listTallyExportJobs({ pageSize: 5 }),
    staleTime: 30_000,
  })

  const tallyExportMutation = useMutation({
    mutationFn: () => enqueueTallyExport({
      periodStart: dateRange.start?.toISOString() ?? undefined,
      periodEnd: dateRange.end?.toISOString() ?? undefined,
    }),
    onSuccess: (data) => {
      toast.success(t('reports.tally.queued', { jobId: data.jobId.slice(0, 8) }))
      void queryClient.invalidateQueries({ queryKey: ['tally-export-jobs'] })
    },
    onError: () => toast.error(t('reports.tally.error')),
  })

  const showComparative = COMPARATIVE_TYPES.includes(selectedReportType)

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageHeader
          title={t('reports.title')}
          subtitle={t('reports.subtitle')}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} fyAware />
          <select
            value={fy}
            onChange={e => setFy(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)]"
            aria-label={t('reports.fy')}
          >
            <option value="2024-25">FY 2024-25</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2026-27">FY 2026-27</option>
          </select>
        </div>
      </div>

      {/* DG-DASH-07: Comparative + Currency controls */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        {/* Currency chip group */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {t('reports.form.currency.label')}
          </span>
          <div className="flex gap-1.5">
            {CURRENCY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCurrencyDisplay(opt.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  currencyDisplay === opt.value
                    ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--brand-400)]'
                )}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Comparative checkbox — only shown for P&L, BS, CashFlow */}
        {showComparative && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={comparative}
              onChange={e => setComparative(e.target.checked)}
              className="rounded border-[var(--border-default)] text-[var(--brand-500)] focus:ring-[var(--brand-500)]"
              aria-label={t('reports.form.comparative')}
            />
            {t('reports.form.comparative')}
          </label>
        )}
      </div>

      {/* Report type cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map(rt => {
          const isSelected = selectedReportType === rt.type
          return (
            <Card
              key={rt.type}
              className={cn(
                'group hover:shadow-[var(--shadow-md)] transition-all cursor-pointer',
                isSelected && 'ring-2 ring-[var(--brand-500)]'
              )}
              onClick={() => setSelectedReportType(rt.type)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--surface-sunken)]">
                  <rt.icon className={cn('h-5 w-5', rt.color)} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {REPORT_LABELS[rt.type] ?? rt.type}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {REPORT_DESCS[rt.descKey] ?? ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedReportType(rt.type)
                    generateMutation.mutate(rt.type)
                  }}
                  loading={generateMutation.isPending && selectedReportType === rt.type}
                  className="flex-1"
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {t('reports.generate')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* DG-DASH-07: KpiStrip below generation form */}
      {(lastGeneratedJob ?? (jobs?.items?.[0] ?? null)) && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            {t('reports.kpi.lastGenerated')}
          </h2>
          <ReportKpiStrip
            job={lastGeneratedJob ?? (jobs?.items?.[0] ?? null)}
            loading={generateMutation.isPending}
            onOpenPreview={(job) => openPreviewMutation.mutate(job)}
            onShare={(job) => setShareJob(job)}
          />
        </div>
      )}

      {/* DG-DASH-07: PDF Preview pane (right rail on desktop, below on mobile) */}
      {previewJob && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t('reports.preview.title', { title: REPORT_LABELS[previewJob.reportType] ?? previewJob.reportType })}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPreviewJob(null); setPreviewUrl(null) }}
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {openPreviewMutation.isPending ? (
            <Skeleton variant="card" className="h-48" />
          ) : (
            <PdfViewerWebPackagePane
              pdfUrl={previewUrl}
              generatedAt={previewJob.createdAt}
              downloadFileName={`${previewJob.reportType}-${previewJob.financialYear ?? 'report'}.pdf`}
            />
          )}
        </div>
      )}

      {/* GAP-032 Tally export section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t('reports.tally.title')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {t('reports.tally.subtitle')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => tallyExportMutation.mutate()}
            loading={tallyExportMutation.isPending}
            leftIcon={<Database className="h-4 w-4" />}
          >
            {t('reports.tally.export')}
          </Button>
        </div>

        {tallyJobsLoading ? (
          <div className="h-8 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
        ) : (tallyJobs?.items ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t('reports.tally.empty')}</p>
        ) : (
          <div className="space-y-2">
            {(tallyJobs?.items ?? []).map(job => (
              <TallyExportJobRow key={job.jobId} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* Recent jobs table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {t('reports.recentJobs')}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['reports', 'jobs'] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <ErrorBoundary scope="pane">
          {jobsLoading ? (
            <Skeleton variant="dataTableDense" />
          ) : !jobs?.items.length ? (
            <EmptyState
              variant="reports"
              size="sm"
              primaryCta={{ label: t('reports.generateFirst'), onPress: () => generateMutation.mutate('ProfitAndLoss') }}
            />
          ) : (
            <div className="space-y-2">
              {jobs.items.map(job => (
                <ReportJobRow
                  key={job.jobId}
                  job={job}
                  isSelected={previewJob?.jobId === job.jobId}
                  onDownload={() => downloadMutation.mutate(job.jobId)}
                  onShare={() => setShareJob(job)}
                  onOpenPreview={() => openPreviewMutation.mutate(job)}
                  isDownloading={downloadMutation.isPending}
                />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </div>

      {/* DG-DASH-07: Share modal */}
      <ReportShareModal
        open={shareJob !== null}
        onClose={() => setShareJob(null)}
        job={shareJob}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tally Export Job Row
// ---------------------------------------------------------------------------

function TallyExportJobRow({ job }: { job: ReportJobSummary }) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
      'bg-[var(--surface-raised)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
    )}>
      <Database className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {t('reports.tally.xmlExport')} {job.financialYear ? `FY ${job.financialYear}` : ''}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {job.createdAt ? format(new Date(job.createdAt), 'dd/MM/yyyy HH:mm') : ''}
        </p>
      </div>
      <Badge variant={STATUS_VARIANT[job.status] ?? 'info'} size="sm">
        {job.status}
      </Badge>
      {job.status === 'COMPLETE' && (
        <Clock className="h-4 w-4 text-neutral-400" aria-label="Download available via Reports" />
      )}
      {job.status === 'GENERATING' && (
        <Clock className="h-4 w-4 text-[var(--text-tertiary)] animate-spin" aria-label="Generating" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report Job Row
// ---------------------------------------------------------------------------

interface ReportJobRowProps {
  job: ReportJobSummary
  isSelected: boolean
  onDownload: () => void
  onShare: () => void
  onOpenPreview: () => void
  isDownloading: boolean
}

function ReportJobRow({ job, isSelected, onDownload, onShare, onOpenPreview, isDownloading }: ReportJobRowProps) {
  const isComplete = job.status === 'COMPLETE'
  const isGenerating = job.status === 'GENERATING'

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
      'bg-[var(--surface-raised)] hover:border-[var(--border-default)]',
      isSelected
        ? 'border-[var(--brand-400)] bg-[var(--brand-50)]/30'
        : 'border-[var(--border-subtle)]'
    )}>
      <FileText className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {REPORT_LABELS[job.reportType] ?? job.reportType}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[var(--text-tertiary)]">
            {job.createdAt ? format(new Date(job.createdAt), 'dd/MM/yyyy HH:mm') : ''}
          </span>
          {job.financialYear && (
            <span className="text-xs text-[var(--text-tertiary)]">FY {job.financialYear}</span>
          )}
        </div>
      </div>

      <Badge variant={STATUS_VARIANT[job.status] ?? 'info'} size="sm">
        {job.status}
      </Badge>

      <div className="flex gap-1.5 shrink-0">
        {isComplete && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenPreview}
              aria-label={t('reports.kpi.openPreview')}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDownload}
              loading={isDownloading}
              aria-label={t('reports.download')}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              aria-label={t('reports.share')}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {isGenerating && (
          <Clock className="h-4 w-4 text-[var(--text-tertiary)] animate-spin" aria-label="Generating" />
        )}
      </div>
    </div>
  )
}
