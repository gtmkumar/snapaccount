/**
 * ComplianceReportPage — Screen 103
 * Platform compliance status: DPDP Act 2023, data retention, security, RBI/banking, GST/IT.
 * DG-DASH-06
 */
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CheckCircle2, XCircle, AlertTriangle, Shield, RefreshCw,
  FileText, Clock, Database, Lock, AlertCircle,
} from 'lucide-react'
import { t } from '@/i18n'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getComplianceReport, type ComplianceCheck, type ComplianceIssue } from '@/lib/analyticsApi'

// ---------------------------------------------------------------------------
// Circular progress ring
// ---------------------------------------------------------------------------
function ScoreRing({ score }: { score: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128">
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth="8"
        />
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 64 64)"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}%</span>
        <span className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.compliant')}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklist item
// ---------------------------------------------------------------------------
function CheckItem({ check }: { check: ComplianceCheck }) {
  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border',
      check.passed
        ? 'border-success-200 bg-success-50 dark:border-success-900 dark:bg-success-950'
        : 'border-error-200 bg-error-50 dark:border-error-900 dark:bg-error-950',
    )}>
      {check.passed ? (
        <CheckCircle2 className="h-5 w-5 text-success-600 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-5 w-5 text-error-600 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', check.passed ? 'text-success-800 dark:text-success-200' : 'text-error-800 dark:text-error-200')}>
          {check.label}
        </p>
        {check.detail && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{check.detail}</p>
        )}
        {check.lastChecked && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {t('analytics.compliance.lastChecked')}: {check.lastChecked}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Issue row
// ---------------------------------------------------------------------------
const PRIORITY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'info',
}

function IssueRow({ issue }: { issue: ComplianceIssue }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <AlertTriangle className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{issue.title}</p>
          <Badge variant={PRIORITY_VARIANT[issue.priority] ?? 'info'} size="sm">
            {issue.priority}
          </Badge>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{issue.description}</p>
        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
          {issue.assignedTo && (
            <span>{t('analytics.compliance.assignedTo')}: {issue.assignedTo}</span>
          )}
          {issue.dueDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t('analytics.compliance.dueDate')}: {issue.dueDate}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ComplianceReportPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['analytics', 'compliance'],
    queryFn: () => getComplianceReport(),
    staleTime: 600_000,
  })

  const generatePdfMutation = useMutation({
    mutationFn: async () => {
      // Mock-first: real endpoint not yet implemented — show toast and exit
      await new Promise(res => setTimeout(res, 800))
      return { url: null }
    },
    onSuccess: () => {
      toast.info(t('analytics.compliance.pdfNotAvailable'))
    },
    onError: () => toast.error(t('analytics.compliance.pdfError')),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title={t('analytics.compliance.title')}
          subtitle={t('analytics.compliance.subtitle')}
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
          {/* Score card */}
          <Card>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreRing score={data.overallScore} />
              <div className="flex-1 space-y-2">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {t('analytics.compliance.overallScore')}
                </h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {data.lastAuditDate && (
                    <div>
                      <span className="text-[var(--text-secondary)]">{t('analytics.compliance.lastAudit')}: </span>
                      <span className="font-medium text-[var(--text-primary)]">{data.lastAuditDate}</span>
                    </div>
                  )}
                  {data.nextReviewDate && (
                    <div>
                      <span className="text-[var(--text-secondary)]">{t('analytics.compliance.nextReview')}: </span>
                      <span className="font-medium text-[var(--text-primary)]">{data.nextReviewDate}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => generatePdfMutation.mutate()}
                  loading={generatePdfMutation.isPending}
                  leftIcon={<FileText className="h-4 w-4" />}
                >
                  {t('analytics.compliance.generatePdf')}
                </Button>
              </div>
            </div>
          </Card>

          {/* DPDP Act 2023 */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--brand-500)]" />
            {t('analytics.compliance.dpdpTitle')}
          </h2>
          <div className="space-y-2">
            {data.dpdpChecks.map(check => (
              <CheckItem key={check.id} check={check} />
            ))}
          </div>

          {/* Data export / deletion requests */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Card>
              <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                {t('analytics.compliance.dataExportRequests')}
              </p>
              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-xl font-bold text-warning-600">{data.dataExportRequests.pending}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('analytics.compliance.pending')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-success-600">{data.dataExportRequests.completedThisMonth}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('analytics.compliance.completedThisMonth')}</p>
                </div>
              </div>
            </Card>
            <Card>
              <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                {t('analytics.compliance.accountDeletionRequests')}
              </p>
              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-xl font-bold text-warning-600">{data.accountDeletionRequests.pending}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('analytics.compliance.pending')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-success-600">{data.accountDeletionRequests.completedThisMonth}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('analytics.compliance.completedThisMonth')}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Data Retention */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6 flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--brand-500)]" />
            {t('analytics.compliance.retentionTitle')}
          </h2>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.policyStatus')}</p>
                <Badge variant="success">{data.dataRetention.policyStatus}</Badge>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.docsWithinPolicy')}</p>
                <p className="text-lg font-bold text-success-600">{data.dataRetention.documentsWithinPolicyPct}%</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.financialWithinPolicy')}</p>
                <p className="text-lg font-bold text-success-600">{data.dataRetention.financialRecordsWithinPolicyPct}%</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.oldestRecord')}</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{data.dataRetention.oldestRecordDate ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.autoArchival')}</p>
                <Badge variant={data.dataRetention.autoArchivalActive ? 'success' : 'error'}>
                  {data.dataRetention.autoArchivalActive ? t('analytics.compliance.active') : t('analytics.compliance.inactive')}
                </Badge>
              </div>
              {data.dataRetention.nextArchivalRun && (
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.nextArchival')}</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{data.dataRetention.nextArchivalRun}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Security */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6 flex items-center gap-2">
            <Lock className="h-4 w-4 text-[var(--brand-500)]" />
            {t('analytics.compliance.securityTitle')}
          </h2>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.failedLogins')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{data.security.failedLoginAttempts30d}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.suspiciousFlags')}</p>
                <p className={cn('text-lg font-bold', data.security.suspiciousActivityFlags > 0 ? 'text-warning-600' : 'text-success-600')}>
                  {data.security.suspiciousActivityFlags}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.adminWithoutMfa')}</p>
                <p className={cn('text-lg font-bold', data.security.adminAccountsWithoutMfa > 0 ? 'text-error-600' : 'text-success-600')}>
                  {data.security.adminAccountsWithoutMfa}
                  {data.security.adminAccountsWithoutMfa > 0 && (
                    <AlertCircle className="inline h-4 w-4 ml-1" />
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.lastPenTest')}</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{data.security.lastPenTestDate ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.sslExpiry')}</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{data.security.sslExpiryDate ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.rateLimiting')}</p>
                <Badge variant={data.security.rateLimitingActive ? 'success' : 'error'}>
                  {data.security.rateLimitingActive ? t('analytics.compliance.active') : t('analytics.compliance.inactive')}
                </Badge>
              </div>
            </div>
          </Card>

          {/* RBI / Banking */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.compliance.bankingTitle')}
          </h2>
          <Card>
            <div className="space-y-2">
              {[
                { label: t('analytics.compliance.banking.consentRecords'), passed: data.banking.consentRecordsComplete },
                { label: t('analytics.compliance.banking.revocationsWithinSla'), passed: data.banking.revocationsWithinSla },
                { label: t('analytics.compliance.banking.dataSharingAudit'), passed: data.banking.dataSharingAuditTrail },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-error-600 shrink-0" />
                  )}
                  <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* GST / IT */}
          <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
            {t('analytics.compliance.gstItTitle')}
          </h2>
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.eInvoicingEnabled')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {data.gstIt.eInvoicingEnabled}/{data.gstIt.eInvoicingEligible}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.lateFilingRate')}</p>
                <p className={cn('text-lg font-bold', data.gstIt.lateFilingRatePct < 5 ? 'text-success-600' : 'text-error-600')}>
                  {data.gstIt.lateFilingRatePct}%
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)]">{t('analytics.compliance.lateFilingTarget')}</p>
                <p className="text-lg font-bold text-[var(--text-tertiary)]">&lt;5%</p>
              </div>
            </div>
          </Card>

          {/* Issues list */}
          {data.issues.length > 0 && (
            <>
              <h2 className="text-base font-semibold text-[var(--text-primary)] mt-6">
                {t('analytics.compliance.issuesList')}
              </h2>
              <div className="space-y-2">
                {data.issues.map(issue => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            </>
          )}
        </ErrorBoundary>
      )}
    </div>
  )
}
