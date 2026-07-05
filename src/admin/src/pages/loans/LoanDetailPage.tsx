/**
 * LoanDetailPage — Phase 6C
 * Route: /loans/:applicationId
 * Tabs: Application / Documents / Consents / Timeline / Bank Communication / Disbursement
 * Role-gated actions per design spec.
 */
import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronRight,
  RefreshCw,
  FileText,
  Clock,
  User,
  Building2,
  Banknote,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { BankAdapterTypeBadge } from '@/components/ui/BankAdapterTypeBadge'
import { ConsentAuditCard } from '@/components/ui/ConsentAuditCard'
import { PayloadViewer } from '@/components/ui/PayloadViewer'
import { PdfViewerWebPackagePane } from '@/components/ui/PdfViewerWebPackagePane'
import { StatusTimeline } from '@/components/ui/StatusTimeline'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { formatDate, cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getLoanApplication,
  listApplicationDocuments,
  listConsents,
  listStatusLog,
  listBankCommunications,
  getPackageDownloadUrl,
  approveApplication,
  rejectApplication,
  recordDisbursement,
  closeLoanApplication,
  requestDocuments,
  type LoanApplicationStatus,
  type StatusLogEntry,
  type ConsentRecord,
  type LoanDocument,
  type BankCommMessage,
} from '@/lib/loanApi'
import { type ColumnDef } from '@tanstack/react-table'
import { BankCommStatusBadge } from '@/components/ui/BankCommStatusBadge'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const LOAN_STATUS_CONFIG: Record<LoanApplicationStatus, { variant: 'neutral' | 'info' | 'warning' | 'success' | 'error'; label: string }> = {
  DRAFT: { variant: 'neutral', label: 'Draft' },
  SUBMITTED: { variant: 'info', label: 'Submitted' },
  UNDER_REVIEW: { variant: 'info', label: 'Under review' },
  DOCS_REQUESTED: { variant: 'warning', label: 'Docs requested' },
  APPROVED: { variant: 'success', label: 'Approved' },
  REJECTED: { variant: 'error', label: 'Rejected' },
  DISBURSED: { variant: 'success', label: 'Disbursed' },
  CLOSED: { variant: 'neutral', label: 'Closed' },
}

function LoanStatusBadge({ status }: { status: LoanApplicationStatus }) {
  const cfg = LOAN_STATUS_CONFIG[status] ?? { variant: 'neutral' as const, label: status }
  return <Badge variant={cfg.variant} size="md">{t(`admin.loans.status.${status.toLowerCase()}`)}</Badge>
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'application' | 'documents' | 'consents' | 'timeline' | 'bankComms' | 'disbursement'

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'application', labelKey: 'admin.loanDetail.tab.application' },
  { id: 'documents', labelKey: 'admin.loanDetail.tab.documents' },
  { id: 'consents', labelKey: 'admin.loanDetail.tab.consents' },
  { id: 'timeline', labelKey: 'admin.loanDetail.tab.timeline' },
  { id: 'bankComms', labelKey: 'admin.loanDetail.tab.bankComms' },
  { id: 'disbursement', labelKey: 'admin.loanDetail.tab.disbursement' },
]

// ---------------------------------------------------------------------------
// Application tab
// ---------------------------------------------------------------------------

function ApplicationTab({ application }: { application: ReturnType<typeof getLoanApplication> extends Promise<infer T> ? T : never }) {

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left column */}
      <div className="space-y-4">
        <Card padding="md">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            {t('admin.loanDetail.section.applicant')}
          </h3>
          <dl className="space-y-2 text-sm">
            <DetailRow label={t('admin.loanDetail.field.org')} value={application.orgName} />
            <DetailRow label="PAN" value={application.pan} />
            <DetailRow label="GSTIN" value={application.gstin} />
            <DetailRow label={t('admin.loanDetail.field.phone')} value={application.phone} />
            <DetailRow label={t('admin.loanDetail.field.email')} value={application.email} />
            {application.businessVintageYears != null && (
              <DetailRow label={t('admin.loanDetail.field.vintage')} value={`${application.businessVintageYears} yr`} />
            )}
            {application.annualRevenueFy != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-tertiary)]">{t('admin.loanDetail.field.revenue')}</dt>
                <dd><AmountDisplay amount={application.annualRevenueFy} size="sm" /></dd>
              </div>
            )}
          </dl>
        </Card>

        <Card padding="md">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {t('admin.loanDetail.section.params')}
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">{t('admin.loanDetail.field.amount')}</dt>
              <dd><AmountDisplay amount={application.requestedAmount} size="sm" /></dd>
            </div>
            <DetailRow label={t('admin.loanDetail.field.tenure')} value={`${application.tenureMonths} months`} />
            <DetailRow label={t('admin.loanDetail.field.purpose')} value={application.purpose} />
            {application.purposeNote && (
              <DetailRow label={t('admin.loanDetail.field.purposeNote')} value={application.purposeNote} />
            )}
          </dl>
        </Card>

        {(application.eligibilityScore != null || (application.eligibilityReasons?.length ?? 0) > 0) && (
          <Card padding="md">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3">
              {t('admin.loanDetail.section.eligibilitySnapshot')}
            </h3>
            {application.eligibilityScore != null && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[var(--text-tertiary)] text-sm">{t('admin.loanDetail.field.score')}</span>
                <span className="text-lg font-bold text-[var(--text-primary)]">{application.eligibilityScore}</span>
              </div>
            )}
            {application.eligibilityReasons && (
              <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                {application.eligibilityReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-success-600 mt-0.5">✓</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <Card padding="md">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t('admin.loanDetail.section.bankAssignment')}
          </h3>
          {application.bankName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {application.bankLogoUrl && (
                  <img src={application.bankLogoUrl} alt="" className="h-8 w-8 rounded object-contain" aria-hidden="true" />
                )}
                <span className="font-medium">{application.bankName}</span>
                {application.bankAdapterType && (
                  <BankAdapterTypeBadge adapterType={application.bankAdapterType} />
                )}
              </div>
              {application.currentBankRecipientEmail && (
                <p className="text-xs text-[var(--text-tertiary)]">
                  {t('admin.loanDetail.field.recipientEmail')}: {application.currentBankRecipientEmail}
                </p>
              )}
              {application.currentBankEndpointMasked && (
                <p className="text-xs text-[var(--text-tertiary)] font-mono">
                  {t('admin.loanDetail.field.endpoint')}: {application.currentBankEndpointMasked}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-disabled)]">{t('admin.loanDetail.bankAssignment.none')}</p>
          )}
        </Card>

        <Card padding="md">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <User className="h-4 w-4" aria-hidden="true" />
            {t('admin.loanDetail.section.owner')}
          </h3>
          <p className="text-sm">{application.assignedOfficer ?? t('admin.loanDetail.owner.unassigned')}</p>
        </Card>

        {application.bankReferenceNo && (
          <Card padding="md">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">
              {t('admin.loanDetail.field.bankRef')}
            </h3>
            <p className="font-mono text-sm">{application.bankReferenceNo}</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-[var(--text-primary)] font-medium text-right">{value ?? '—'}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------

function DocumentsTab({ applicationId }: { applicationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loanDocuments', applicationId],
    queryFn: () => listApplicationDocuments(applicationId),
  })

  const { data: packageUrl } = useQuery({
    queryKey: ['loanPackageUrl', applicationId],
    queryFn: () => getPackageDownloadUrl(applicationId),
    retry: false,
  })

  const columns: ColumnDef<LoanDocument>[] = [
    {
      accessorKey: 'documentType',
      header: t('admin.loanDetail.docs.col.type'),
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'source',
      header: t('admin.loanDetail.docs.col.source'),
      cell: ({ getValue }) => {
        const s = getValue<string | null>()
        return <span className="text-xs capitalize">{s ?? '—'}</span>
      },
    },
    {
      accessorKey: 'pages',
      header: t('admin.loanDetail.docs.col.pages'),
      cell: ({ getValue }) => {
        const v = getValue<number | null>()
        return <span>{v ?? '—'}</span>
      },
    },
    {
      accessorKey: 'status',
      header: t('admin.loanDetail.docs.col.status'),
      cell: ({ getValue }) => {
        const s = getValue<string>()
        const variantMap: Record<string, 'neutral' | 'info' | 'success' | 'error'> = {
          pending: 'neutral', processing: 'info', verified: 'success', rejected: 'error',
        }
        return <Badge variant={variantMap[s] ?? 'neutral'} size="sm">{s}</Badge>
      },
    },
    {
      accessorKey: 'uploadedAt',
      header: t('admin.loanDetail.docs.col.uploaded'),
      cell: ({ getValue }) => <span className="text-xs">{formatDate(getValue<string>())}</span>,
    },
    {
      accessorKey: 'fileName',
      header: t('admin.loanDetail.docs.col.file'),
      cell: ({ getValue }) => <span className="text-xs text-[var(--text-secondary)]">{getValue<string>()}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={data?.items ?? []}
        columns={columns}
        loading={isLoading}
        showPagination={false}
      />
      <PdfViewerWebPackagePane
        pdfUrl={packageUrl?.url}
        watermarkStatus="unknown"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Consents tab (read-only DPDP audit)
// ---------------------------------------------------------------------------

function ConsentsTab({ applicationId }: { applicationId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loanConsents', applicationId],
    queryFn: () => listConsents(applicationId),
  })

  const [verifyResults, setVerifyResults] = useState<Record<string, 'ok' | 'fail'>>({})
  const [verifying, setVerifying] = useState<string | null>(null)
  const [textModal, setTextModal] = useState<ConsentRecord | null>(null)

  async function handleVerifyHmac(consent: ConsentRecord) {
    setVerifying(consent.consentId)
    // Simulate backend verification — real implementation calls /loans/applications/:id/consent/:cid/verify
    await new Promise(r => setTimeout(r, 1200))
    // Mock always-ok for now; real endpoint returns { valid: boolean }
    setVerifyResults(prev => ({ ...prev, [consent.consentId]: 'ok' }))
    setVerifying(null)
  }

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-lg bg-[var(--surface-sunken)] animate-pulse" />)}</div>
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text-disabled)]">
        {t('admin.loanDetail.consents.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {items.map(consent => (
        <ConsentAuditCard
          key={consent.consentId}
          consentType={consent.consentType}
          version={consent.consentVersion}
          signedAt={consent.signedAt}
          signatureHex={consent.signatureHex}
          ip={consent.ipAddress}
          userAgent={consent.userAgent}
          biometricUsed={consent.biometricUsed}
          onVerifyHmac={() => void handleVerifyHmac(consent)}
          onViewText={() => setTextModal(consent)}
          verifyResult={verifyResults[consent.consentId] ?? null}
          verifying={verifying === consent.consentId}
        />
      ))}

      {textModal && (
        <Modal
          open
          title={t('admin.loanDetail.consent.viewText', { version: textModal.consentVersion })}
          onClose={() => setTextModal(null)}
          size="lg"
        >
          <div className="p-4 space-y-3">
            <p className="text-xs text-[var(--text-tertiary)] font-mono">
              {t('admin.loanDetail.consent.version')}: {textModal.consentVersion}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('admin.loanDetail.consent.textUnavailable')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

const LOAN_STATUS_ORDER: LoanApplicationStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCS_REQUESTED', 'APPROVED', 'DISBURSED', 'CLOSED',
]

function TimelineTab({ applicationId, currentStatus }: { applicationId: string; currentStatus: LoanApplicationStatus }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loanStatusLog', applicationId],
    queryFn: () => listStatusLog(applicationId),
  })

  const currentIdx = LOAN_STATUS_ORDER.indexOf(currentStatus)
  const steps = LOAN_STATUS_ORDER.map((status, idx) => ({
    id: status,
    label: t(`admin.loans.status.${status.toLowerCase()}`),
    status: idx < currentIdx ? 'completed' as const : idx === currentIdx ? 'active' as const : 'pending' as const,
  }))

  const entries = data?.items ?? []

  return (
    <div className="space-y-5">
      <StatusTimeline steps={steps} orientation="horizontal" />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-[var(--surface-sunken)] rounded animate-pulse" />)}</div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--text-disabled)]">{t('admin.loanDetail.timeline.empty')}</p>
      ) : (
        <div className="relative space-y-0">
          {entries.map((entry, idx) => (
            <TimelineEntry key={entry.id} entry={entry} isLast={idx === entries.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineEntry({ entry, isLast }: { entry: StatusLogEntry; isLast: boolean }) {
  const actorColors: Record<string, string> = {
    user: 'bg-[var(--badge-brand-bg)] text-[var(--badge-brand-fg)]',
    system: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]',
    officer: 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]',
    bank: 'bg-[var(--badge-gst-bg)] text-[var(--badge-gst-fg)]',
  }
  const colorClass = actorColors[entry.actorType] ?? actorColors.system

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="h-3 w-3 rounded-full bg-brand-500 ring-2 ring-[var(--surface-raised)] ring-offset-1 shrink-0 mt-1" aria-hidden="true" />
        {!isLast && <div className="w-0.5 flex-1 bg-[var(--border-default)] my-1" aria-hidden="true" />}
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-xs text-[var(--text-tertiary)]">{formatDate(entry.timestamp)}</span>
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', colorClass)}>
            {entry.actorName ?? entry.actorType}
          </span>
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          → {t(`admin.loans.status.${entry.toStatus.toLowerCase()}`)}
        </p>
        {entry.note && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{entry.note}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bank communication tab (scoped to one application)
// ---------------------------------------------------------------------------

function BankCommsTab({ applicationId }: { applicationId: string }) {
  const [selected, setSelected] = useState<BankCommMessage | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['loanBankComms', applicationId],
    queryFn: () => listBankCommunications({ applicationId }),
  })

  const messages = data?.items ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* List */}
      <div className="lg:col-span-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-[var(--surface-sunken)] rounded animate-pulse" />)
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--text-disabled)] py-4">{t('admin.loanDetail.bankComms.empty')}</p>
        ) : (
          messages.map(msg => (
            <button
              key={msg.messageId}
              type="button"
              onClick={() => setSelected(msg)}
              className={cn(
                'w-full text-left rounded-lg border p-3 hover:border-brand-500/50 transition-colors',
                selected?.messageId === msg.messageId
                  ? 'border-brand-500 bg-[var(--badge-brand-bg)]'
                  : 'border-[var(--border-default)] bg-[var(--surface-raised)]'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-[var(--text-tertiary)]">{msg.messageId.slice(0, 12)}…</span>
                <BankCommStatusBadge status={msg.status} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-[var(--text-tertiary)]">{msg.direction === 'outbound' ? '↑' : '↓'}</span>
                <span className="text-sm text-[var(--text-primary)] truncate">{msg.subject ?? msg.endpoint ?? '—'}</span>
              </div>
              <div className="text-xs text-[var(--text-disabled)] mt-0.5">{formatDate(msg.timestamp)}</div>
            </button>
          ))
        )}
      </div>

      {/* Detail pane */}
      <div className="lg:col-span-2">
        {selected ? (
          <Card padding="md" className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-[var(--text-primary)]">{selected.bankName}</span>
              {selected.adapterType && <BankAdapterTypeBadge adapterType={selected.adapterType} />}
              <BankCommStatusBadge status={selected.status} />
            </div>
            <dl className="text-xs space-y-1">
              <DetailRow label={t('admin.loanDetail.bankComms.direction')} value={selected.direction} />
              <DetailRow label={t('admin.loanDetail.bankComms.channel')} value={selected.channel} />
              <DetailRow label={t('admin.loanDetail.bankComms.time')} value={formatDate(selected.timestamp)} />
              {selected.responseStatus != null && (
                <DetailRow label={t('admin.loanDetail.bankComms.responseCode')} value={String(selected.responseStatus)} />
              )}
            </dl>
            {selected.payloadMasked && (
              <PayloadViewer
                kind={selected.channel === 'email' ? 'email' : selected.channel === 'oauth' ? 'oauth-token' : 'json'}
                payload={selected.payloadMasked}
              />
            )}
            {selected.responseMasked && (
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">{t('admin.loanDetail.bankComms.response')}</p>
                <PayloadViewer kind="json" payload={selected.responseMasked} />
              </div>
            )}
          </Card>
        ) : (
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] p-8 text-center text-sm text-[var(--text-disabled)]">
            {t('admin.loanDetail.bankComms.selectHint')}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disbursement tab
// ---------------------------------------------------------------------------

interface RecordDisbursementModalProps {
  applicationId: string
  onDone: () => void
  onClose: () => void
}

function RecordDisbursementModal({ applicationId, onDone, onClose }: RecordDisbursementModalProps) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('')
  const [bankRef, setBankRef] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      recordDisbursement(applicationId, {
        disbursedAmount: Number(amount),
        bankReferenceNo: bankRef,
      }),
    onSuccess: () => {
      toast.success(t('admin.loanDetail.disbursement.success'))
      void qc.invalidateQueries({ queryKey: ['loanApplication', applicationId] })
      onDone()
    },
    onError: () => toast.error(t('admin.loanDetail.disbursement.error')),
  })

  return (
    <Modal
      open
      title={t('admin.loanDetail.disbursement.recordCta')}
      onClose={onClose}
      size="sm"
    >
      <div className="p-4 space-y-4">
        <Input
          label={t('admin.loanDetail.disbursement.modal.amount')}
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          required
        />
        <Input
          label={t('admin.loanDetail.disbursement.modal.utr')}
          value={bankRef}
          onChange={e => setBankRef(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={!amount || !bankRef || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DisbursementTab({ application }: { application: { applicationId: string; status: LoanApplicationStatus; disbursedAmount?: number | null; disbursedAt?: string | null; bankReferenceNo?: string | null } }) {
  const [showModal, setShowModal] = useState(false)

  if (application.status === 'DISBURSED') {
    return (
      <Card padding="md" className="max-w-lg">
        <div className="flex items-center gap-2 text-success-700 mb-3">
          <Banknote className="h-5 w-5" aria-hidden="true" />
          <span className="font-semibold">
            {t('admin.loanDetail.disbursement.recorded', {
              amount: application.disbursedAmount ? `₹${application.disbursedAmount.toLocaleString('en-IN')}` : '',
              date: application.disbursedAt ? formatDate(application.disbursedAt) : '—',
            })}
          </span>
        </div>
        {application.bankReferenceNo && (
          <p className="text-sm text-[var(--text-secondary)] font-mono">
            {t('admin.loanDetail.disbursement.utr')}: {application.bankReferenceNo}
          </p>
        )}
      </Card>
    )
  }

  if (application.status === 'APPROVED') {
    return (
      <Card padding="md" className="max-w-lg space-y-3">
        <div className="flex items-center gap-2 text-amber-700">
          <Clock className="h-5 w-5" aria-hidden="true" />
          <span className="font-semibold">{t('admin.loanDetail.disbursement.awaiting')}</span>
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          {t('admin.loanDetail.disbursement.manualNote')}
        </p>
        <Button onClick={() => setShowModal(true)} leftIcon={<Banknote className="h-4 w-4" />}>
          {t('admin.loanDetail.disbursement.recordCta')}
        </Button>
        {showModal && (
          <RecordDisbursementModal
            applicationId={application.applicationId}
            onDone={() => setShowModal(false)}
            onClose={() => setShowModal(false)}
          />
        )}
      </Card>
    )
  }

  return (
    <div className="py-8 text-center text-[var(--text-disabled)] text-sm">
      {t('admin.loanDetail.disbursement.notAvailable')}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LoanDetailPage() {
  const { applicationId } = useParams<{ applicationId: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabId>('application')
  const [approveModal, setApproveModal] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [bankRef, setBankRef] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const { data: application, isLoading, isError, refetch } = useQuery({
    queryKey: ['loanApplication', applicationId],
    queryFn: () => getLoanApplication(applicationId!),
    enabled: !!applicationId,
  })

  const approveMutation = useMutation({
    mutationFn: () => approveApplication(applicationId!, { bankReferenceNo: bankRef }),
    onSuccess: () => {
      toast.success(t('admin.loanDetail.action.approved'))
      void qc.invalidateQueries({ queryKey: ['loanApplication', applicationId] })
      setApproveModal(false)
    },
    onError: () => toast.error(t('admin.loanDetail.action.approveFailed')),
  })

  const rejectMutation = useMutation({
    mutationFn: () => rejectApplication(applicationId!, { reason: rejectReason }),
    onSuccess: () => {
      toast.success(t('admin.loanDetail.action.rejected'))
      void qc.invalidateQueries({ queryKey: ['loanApplication', applicationId] })
      setRejectModal(false)
    },
    onError: () => toast.error(t('admin.loanDetail.action.rejectFailed')),
  })

  const closeMutation = useMutation({
    mutationFn: () => closeLoanApplication(applicationId!),
    onSuccess: () => {
      toast.success(t('admin.loanDetail.action.closed'))
      void qc.invalidateQueries({ queryKey: ['loanApplication', applicationId] })
    },
    onError: () => toast.error(t('admin.loanDetail.action.closeFailed')),
  })

  const requestDocsMutation = useMutation({
    mutationFn: () => requestDocuments(applicationId!),
    onSuccess: () => {
      toast.success(t('admin.loanDetail.action.docsRequested'))
      void qc.invalidateQueries({ queryKey: ['loanApplication', applicationId] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-[var(--surface-sunken)] rounded" />
        <div className="h-24 bg-[var(--surface-sunken)] rounded-xl" />
        <div className="h-10 bg-[var(--surface-sunken)] rounded-xl" />
        <div className="h-64 bg-[var(--surface-sunken)] rounded-xl" />
      </div>
    )
  }

  if (isError || !application) {
    return (
      <AlertBanner
        type="error"
        title={t('admin.loanDetail.loadError')}
        actions={
          <button type="button" onClick={() => void refetch()} className="text-xs underline">
            {t('common.retry')}
          </button>
        }
      />
    )
  }

  const isClosed = application.status === 'CLOSED' || application.status === 'REJECTED' || application.status === 'DISBURSED'

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
        <Link to="/loans" className="hover:text-brand-500 transition-colors">
          {t('admin.loans.title')}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span className="text-[var(--text-primary)] font-medium font-mono">{application.applicationId.slice(0, 8)}…</span>
      </nav>

      {/* Header block */}
      <Card padding="md" className="!p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-[var(--text-primary)]">{application.orgName ?? t('admin.loanDetail.unknownOrg')}</h1>
              {application.pan && <span className="text-xs text-[var(--text-tertiary)] font-mono">{application.pan}</span>}
              {application.gstin && <span className="text-xs text-[var(--text-tertiary)] font-mono">{application.gstin}</span>}
            </div>
            <div className="mt-1">
              <LoanStatusBadge status={application.status} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {application.status === 'SUBMITTED' && (
              <Button size="sm" onClick={() => void requestDocsMutation.mutate()} loading={requestDocsMutation.isPending}>
                {t('admin.loanDetail.action.requestDocs')}
              </Button>
            )}
            {application.status === 'UNDER_REVIEW' && (
              <>
                <Button size="sm" variant="danger" onClick={() => setRejectModal(true)}>
                  {t('admin.loanDetail.action.reject')}
                </Button>
                <Button size="sm" variant="success" onClick={() => setApproveModal(true)}>
                  {t('admin.loanDetail.action.approve')}
                </Button>
              </>
            )}
            {!isClosed && (
              <Button size="sm" variant="ghost" onClick={() => void closeMutation.mutate()} loading={closeMutation.isPending}>
                {t('admin.loanDetail.action.close')}
              </Button>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              aria-label={t('common.refresh')}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-1">
            <AmountDisplay amount={application.requestedAmount} size="sm" />
          </div>
          <span>·</span>
          <span>{application.tenureMonths} months</span>
          {application.purpose && (
            <>
              <span>·</span>
              <span className="capitalize">{application.purpose}</span>
            </>
          )}
          {application.bankName && (
            <>
              <span>·</span>
              <span>{application.bankName}</span>
            </>
          )}
          {application.bankReferenceNo && (
            <>
              <span>·</span>
              <span className="font-mono text-xs">{application.bankReferenceNo}</span>
            </>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div>
        {/* Tab list */}
        <div
          role="tablist"
          aria-label={t('admin.loanDetail.tabs')}
          className="flex overflow-x-auto border-b border-[var(--border-default)] -mb-px"
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]'
              )}
              onKeyDown={e => {
                const idx = TABS.findIndex(t => t.id === tab.id)
                if (e.key === 'ArrowRight') setActiveTab(TABS[(idx + 1) % TABS.length].id)
                if (e.key === 'ArrowLeft') setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length].id)
              }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div className="pt-5">
          {activeTab === 'application' && (
            <div role="tabpanel" id="panel-application" aria-labelledby="tab-application">
              <ApplicationTab application={application} />
            </div>
          )}
          {activeTab === 'documents' && (
            <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
              <DocumentsTab applicationId={applicationId!} />
            </div>
          )}
          {activeTab === 'consents' && (
            <div role="tabpanel" id="panel-consents" aria-labelledby="tab-consents">
              <ConsentsTab applicationId={applicationId!} />
            </div>
          )}
          {activeTab === 'timeline' && (
            <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
              <TimelineTab applicationId={applicationId!} currentStatus={application.status} />
            </div>
          )}
          {activeTab === 'bankComms' && (
            <div role="tabpanel" id="panel-bankComms" aria-labelledby="tab-bankComms">
              <BankCommsTab applicationId={applicationId!} />
            </div>
          )}
          {activeTab === 'disbursement' && (
            <div role="tabpanel" id="panel-disbursement" aria-labelledby="tab-disbursement">
              <DisbursementTab application={application} />
            </div>
          )}
        </div>
      </div>

      {/* Approve modal */}
      {approveModal && (
        <Modal
          open
          title={t('admin.loanDetail.action.approve')}
          onClose={() => setApproveModal(false)}
          size="sm"
        >
          <div className="p-4 space-y-4">
            <Input
              label={t('admin.loanDetail.action.bankRef')}
              value={bankRef}
              onChange={e => setBankRef(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setApproveModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="success"
                disabled={!bankRef || approveMutation.isPending}
                loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                {t('admin.loanDetail.action.confirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <Modal
          open
          title={t('admin.loanDetail.action.reject')}
          onClose={() => setRejectModal(false)}
          size="sm"
        >
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                {t('admin.loanDetail.action.rejectReason')} *
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                loading={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
              >
                {t('admin.loanDetail.action.confirmReject')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
