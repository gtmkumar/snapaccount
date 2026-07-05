/**
 * ItrFilingDetailPage — full audit view of a single ITR filing (Phase 6D)
 * Route: /itr/:filingId
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, CheckCircle, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { DueDateChip } from '@/components/ui/DueDateChip'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getFiling,
  getComputationVersions,
  getRefundStatus,
  listItrNotices,
  type FilingStatus,
  type ComputationVersion,
} from '@/lib/itrApi'

// ---------------------------------------------------------------------------
// Horizontal status timeline
// ---------------------------------------------------------------------------

const FILING_LIFECYCLE: { key: FilingStatus; label: string }[] = [
  { key: 'DRAFT', label: t('itr.filingDetail.timeline.draft') },
  { key: 'UNDER_CA_REVIEW', label: t('itr.filingDetail.timeline.underCaReview') },
  { key: 'USER_APPROVED', label: t('itr.filingDetail.timeline.userApproved') },
  { key: 'FILED', label: t('itr.filingDetail.timeline.filed') },
  { key: 'E_VERIFIED', label: t('itr.filingDetail.timeline.eVerified') },
  { key: 'REFUND_ISSUED', label: t('itr.filingDetail.timeline.refundDispatched') },
]

const statusOrder: Record<FilingStatus, number> = {
  DRAFT: 0,
  UNDER_CA_REVIEW: 1,
  USER_APPROVED: 2,
  FILED: 3,
  E_VERIFIED: 4,
  REFUND_ISSUED: 5,
  NOTICE_RECEIVED: 3, // placed alongside FILED
  CA_APPROVED: 2,     // CA approved → alongside USER_APPROVED stage
  CA_REJECTED: 1,     // bounced back at CA review stage
  CANCELLED: 0,       // terminal/none
}

function HorizontalStatusTimeline({ current }: { current: FilingStatus }) {
  const currentIdx = statusOrder[current] ?? 0

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {FILING_LIFECYCLE.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const isLast = idx === FILING_LIFECYCLE.length - 1

        return (
          <div key={step.key} className="flex items-center gap-0 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all',
                  done ? 'bg-brand-500 border-brand-500 text-white' :
                  active ? 'border-brand-500 bg-white text-brand-500 ring-2 ring-brand-200' :
                  'border-neutral-300 bg-white text-neutral-300'
                )}
                aria-label={step.label}
              >
                {done ? (
                  <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : active ? (
                  <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-neutral-300" aria-hidden="true" />
                )}
              </div>
              <span className={cn(
                'text-xs whitespace-nowrap',
                active ? 'font-semibold text-brand-700' :
                done ? 'text-neutral-600' : 'text-neutral-400'
              )}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={cn(
                'h-px w-10 mb-4 mx-1 shrink-0',
                idx < currentIdx ? 'bg-brand-400' : 'bg-neutral-200'
              )} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Computation version card with expandable diff
// ---------------------------------------------------------------------------

function ComputationVersionCard({ version }: { version: ComputationVersion }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 text-left"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-semibold text-neutral-800">
            {t('itr.filingDetail.computation.version', { n: version.version })}
            {version.label && <span className="ml-2 text-neutral-500 font-normal">— {version.label}</span>}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {version.actorName} · {new Date(version.createdAt).toLocaleDateString('en-IN')}
          </p>
        </div>
        <AmountDisplay amount={version.result.payableOrRefund} size="sm" colorCode />
      </button>

      {expanded && (
        <div className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              { label: 'Gross income', value: version.result.grossTotalIncome },
              { label: 'Deductions', value: version.result.deductions },
              { label: 'Taxable income', value: version.result.taxableIncome },
              { label: 'Net tax', value: version.result.grossTaxLiability },
              { label: 'TDS/Adv tax', value: version.result.totalCredits },
              { label: 'Payable / Refund', value: version.result.payableOrRefund },
            ].map(row => (
              <div key={row.label} className="flex justify-between border-b border-neutral-100 pb-1">
                <span className="text-neutral-500">{row.label}</span>
                <AmountDisplay amount={row.value} size="sm" colorCode />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ItrFilingDetailPage() {
  const { filingId } = useParams<{ filingId: string }>()
  const navigate = useNavigate()

  const { data: filing, isLoading, isError } = useQuery({
    queryKey: ['itr-filing', filingId],
    queryFn: () => getFiling(filingId!),
    enabled: !!filingId,
    staleTime: 30_000,
  })

  const { data: versions } = useQuery({
    queryKey: ['itr-computation-versions', filingId],
    queryFn: () => getComputationVersions(filingId!),
    enabled: !!filingId,
    staleTime: 60_000,
  })

  const { data: refundStatus } = useQuery({
    queryKey: ['itr-refund', filingId],
    queryFn: () => getRefundStatus(filingId!),
    enabled: !!filingId && ['FILED', 'E_VERIFIED', 'REFUND_ISSUED'].includes(filing?.status ?? ''),
    staleTime: 60_000,
  })

  const { data: notices } = useQuery({
    queryKey: ['itr-filing-notices', filingId],
    queryFn: () => listItrNotices({ filingId }),
    enabled: !!filingId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-1/3" />
        <div className="h-20 bg-neutral-100 rounded" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-64 bg-neutral-100 rounded" />
          <div className="h-64 bg-neutral-100 rounded" />
          <div className="h-64 bg-neutral-100 rounded" />
        </div>
      </div>
    )
  }

  if (isError || !filing) {
    return (
      <AlertBanner
        type="error"
        title={t('itr.filingDetail.notFound.heading')}
        actions={
          <button onClick={() => void navigate('/itr')} className="text-xs font-medium text-error-700 underline">
            {t('itr.admin.error.backToList')}
          </button>
        }
      />
    )
  }

  const isLocked = ['FILED', 'E_VERIFIED', 'REFUND_ISSUED'].includes(filing.status)
  const noticesList = notices?.items ?? []
  const versionsList = versions ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/itr')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('itr.admin.tabs.verificationQueue')}
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-neutral-900 truncate">
              {t('itr.filingDetail.title', {
                userName: filing.assesseeName ?? '—',
                form: filing.itrFormType,
                ay: filing.assessmentYear,
              })}
            </h1>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              PAN ···{filing.panLast4}
              {filing.assignedCaName && ` · CA: ${filing.assignedCaName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isLocked && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void navigate(`/itr/${filingId}/computation`)}
            >
              {t('itr.filingDetail.action.openComputation')}
            </Button>
          )}
          <Button variant="secondary" size="sm">
            {t('itr.filingDetail.action.reassign')}
          </Button>
        </div>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <AlertBanner type="info" title={t('itr.filingDetail.lockedBanner')} />
      )}

      {/* Horizontal status timeline */}
      <Card>
        <HorizontalStatusTimeline current={filing.status} />
      </Card>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Col 1: Profile */}
        <Card>
          <CardHeader title={t('itr.filingDetail.col.profile')} />
          <dl className="text-sm space-y-2.5">
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('itr.filingDetail.profile.pan')}</dt>
              <dd className="font-mono text-neutral-800">···{filing.panLast4}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('itr.admin.verification.column.form')}</dt>
              <dd className="text-neutral-800">{filing.itrFormType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('itr.computationPanel.right.regimeToggle')}</dt>
              <dd>
                {filing.regime ? (
                  <Badge variant={filing.regime === 'NEW' ? 'brand' : 'neutral'}>
                    {filing.regime === 'NEW' ? t('itr.computationPanel.regime.new') : t('itr.computationPanel.regime.old')}
                  </Badge>
                ) : '—'}
              </dd>
            </div>
            {filing.totalIncome != null && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('itr.computationPanel.right.row.grossIncome')}</dt>
                <dd><AmountDisplay amount={filing.totalIncome} size="sm" /></dd>
              </div>
            )}
            {filing.payableOrRefund != null && (
              <div className="flex justify-between items-center">
                <dt className="text-neutral-500">
                  {filing.payableOrRefund >= 0
                    ? t('itr.computationPanel.right.row.outcomePayable')
                    : t('itr.computationPanel.right.row.outcomeRefund')}
                </dt>
                <dd><AmountDisplay amount={filing.payableOrRefund} size="sm" colorCode /></dd>
              </div>
            )}
            {filing.acknowledgementNumber && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('itr.filingDetail.timeline.filed')}</dt>
                <dd className="font-mono text-xs text-neutral-700">{filing.acknowledgementNumber}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Col 2: Documents */}
        <Card>
          <CardHeader title={t('itr.filingDetail.col.documents')} />
          <div className="space-y-2">
            {[
              { name: 'Form 16', icon: FileText, available: true },
              { name: 'Bank statement', icon: FileText, available: false },
              { name: 'Investment proofs', icon: FileText, available: false },
              { name: 'ITR-V', icon: FileText, available: !!filing.itrVUri },
            ].map(doc => (
              <div key={doc.name} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <doc.icon className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                  <span className="text-sm text-neutral-700">{doc.name}</span>
                </div>
                {doc.available ? (
                  <button className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    View
                  </button>
                ) : (
                  <span className="text-xs text-neutral-300">—</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Col 3: Computation history */}
        <Card>
          <CardHeader title={t('itr.filingDetail.col.computationHistory')} />
          {versionsList.length === 0 ? (
            <p className="text-sm text-neutral-400 py-2">{t('itr.filingDetail.computation.noVersions')}</p>
          ) : (
            <div className="space-y-2">
              {versionsList.map(v => (
                <ComputationVersionCard key={v.id} version={v} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* E-verification section */}
      <Card>
        <CardHeader title={t('itr.filingDetail.section.eVerification')} />
        {filing.eVerifiedAt ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success-600" aria-hidden="true" />
            <span className="text-sm text-neutral-700">
              E-verified on {new Date(filing.eVerifiedAt).toLocaleDateString('en-IN')}
            </span>
          </div>
        ) : ['FILED', 'E_VERIFIED'].includes(filing.status) ? (
          <AlertBanner
            type="warning"
            title={t('itr.filingDetail.eVerification.pending')}
          />
        ) : (
          <p className="text-sm text-neutral-400">{t('itr.filingDetail.eVerification.notFiled')}</p>
        )}
      </Card>

      {/* Notices section */}
      {noticesList.length > 0 && (
        <Card>
          <CardHeader title={t('itr.filingDetail.section.notices')} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  {[
                    t('itr.admin.notice.column.section'),
                    t('admin.gst.notice.col.received'),
                    t('admin.gst.notice.col.due'),
                    t('admin.gst.notice.col.status'),
                    t('itr.admin.verification.column.action'),
                  ].map(col => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {noticesList.map(notice => (
                  <tr key={notice.id}>
                    <td className="px-3 py-2 text-neutral-700">{notice.noticeSection ?? notice.noticeType}</td>
                    <td className="px-3 py-2 text-neutral-500 text-xs">
                      {new Date(notice.issuedDate).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-3 py-2">
                      {notice.dueDate ? <DueDateChip dueDate={notice.dueDate} size="sm" /> : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={notice.status === 'RECEIVED' ? 'info' : 'warning'}>
                        {notice.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <button className="text-xs text-brand-600 hover:underline">
                        {t('itr.admin.notice.action.open')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Refund tracker */}
      {refundStatus && (
        <Card>
          <CardHeader title={t('itr.filingDetail.section.refund')} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {refundStatus.refundStatus === 'CREDITED' ? (
                <CheckCircle className="h-4 w-4 text-success-600" />
              ) : refundStatus.refundStatus === 'FAILED' ? (
                <AlertCircle className="h-4 w-4 text-error-600" />
              ) : (
                <Clock className="h-4 w-4 text-warning-600" />
              )}
              <span className="text-sm text-neutral-700">
                {refundStatus.refundStatus.replace(/_/g, ' ')}
              </span>
              {refundStatus.statusMessage && (
                <span className="text-xs text-neutral-400">— {refundStatus.statusMessage}</span>
              )}
            </div>
            {refundStatus.refundAmount != null && (
              <AmountDisplay amount={refundStatus.refundAmount} size="md" colorCode />
            )}
          </div>
        </Card>
      )}

      {/* CA Notes */}
      {filing.caNotes && (
        <Card>
          <CardHeader title={t('itr.filingDetail.section.caNotes')} />
          <p className="text-sm text-neutral-700 whitespace-pre-wrap">{filing.caNotes}</p>
        </Card>
      )}
    </div>
  )
}
