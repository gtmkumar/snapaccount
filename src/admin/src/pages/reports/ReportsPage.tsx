/**
 * ReportsPage — Phase 6F Track F3
 * Generate, preview, download, share-with-CA/bank for 6 report types.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import {
  BarChart3, Download, Share2, RefreshCw, Play,
  FileText, TrendingUp, Scale, Droplets, Calculator, BookOpen,
  Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { Badge } from '@/components/ui/Badge'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import {
  listReportJobs, generateReport, getReportDownloadUrl, generateShareLink,
  type ReportType, type ReportJobSummary,
} from '@/lib/reportApi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

const REPORT_TYPES: Array<{
  type: ReportType
  label: string
  description: string
  icon: typeof BarChart3
  color: string
}> = [
  { type: 'TrialBalance', label: 'Trial Balance', description: 'Debit/credit summary of all accounts', icon: Scale, color: 'text-indigo-600 dark:text-indigo-400' },
  { type: 'ProfitAndLoss', label: 'Profit & Loss', description: 'Income vs expense for the period', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400' },
  { type: 'BalanceSheet', label: 'Balance Sheet', description: 'Assets, liabilities and equity snapshot', icon: Scale, color: 'text-sky-600 dark:text-sky-400' },
  { type: 'CashFlow', label: 'Cash Flow', description: 'Operating, investing and financing cash flows', icon: Droplets, color: 'text-teal-600 dark:text-teal-400' },
  { type: 'TaxLiability', label: 'Tax Liability', description: 'GST and income tax payable summary', icon: Calculator, color: 'text-amber-600 dark:text-amber-400' },
  { type: 'LedgerByAccount', label: 'Ledger', description: 'Detailed transaction log by account', icon: BookOpen, color: 'text-violet-600 dark:text-violet-400' },
]

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  COMPLETE: 'success',
  GENERATING: 'warning',
  QUEUED: 'info',
  FAILED: 'error',
}

export default function ReportsPage() {
  const queryClient = useQueryClient()
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [fy, setFy] = useState('2025-26')

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
    }),
    onSuccess: (data) => {
      toast.success(t('reports.generated', { jobId: data.jobId.slice(0, 8) }))
      void queryClient.invalidateQueries({ queryKey: ['reports', 'jobs'] })
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

  const shareMutation = useMutation({
    mutationFn: (jobId: string) => generateShareLink(jobId),
    onSuccess: (data) => {
      void navigator.clipboard.writeText(data.url)
      toast.success(t('reports.shared', { time: format(new Date(data.expiresAt), 'HH:mm') }))
    },
    onError: () => toast.error(t('reports.shareError')),
  })

  return (
    <div className="space-y-6">
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

      {/* Report type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map(rt => (
          <Card key={rt.type} className="group hover:shadow-[var(--shadow-md)] transition-shadow">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--surface-sunken)]">
                <rt.icon className={cn('h-5 w-5', rt.color)} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{rt.label}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{rt.description}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={() => generateMutation.mutate(rt.type)}
                loading={generateMutation.isPending}
                className="flex-1"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {t('reports.generate')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent jobs */}
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
                  onDownload={() => downloadMutation.mutate(job.jobId)}
                  onShare={() => shareMutation.mutate(job.jobId)}
                  isDownloading={downloadMutation.isPending}
                  isSharing={shareMutation.isPending}
                />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ── Report Job Row ────────────────────────────────────────────────────────────

interface ReportJobRowProps {
  job: ReportJobSummary
  onDownload: () => void
  onShare: () => void
  isDownloading: boolean
  isSharing: boolean
}

function ReportJobRow({ job, onDownload, onShare, isDownloading, isSharing }: ReportJobRowProps) {

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors',
      'bg-[var(--surface-raised)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
    )}>
      <FileText className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{job.reportType}</p>
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
        {job.status === 'COMPLETE' && (
          <>
            <Button variant="ghost" size="sm" onClick={onDownload} loading={isDownloading} aria-label={t('reports.download')}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onShare} loading={isSharing} aria-label={t('reports.share')}>
              <Share2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {job.status === 'GENERATING' && (
          <Clock className="h-4 w-4 text-[var(--text-tertiary)] animate-spin" aria-label="Generating" />
        )}
      </div>
    </div>
  )
}
