import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, X, Copy, ExternalLink, ChevronDown, ChevronUp, Phone, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { IrpStatusCard } from '@/components/ui/IrpStatusCard'
import { EwbStatusCard } from '@/components/ui/EwbStatusCard'
import { HsnSacTypeahead } from '@/components/ui/HsnSacTypeahead'
import { Modal } from '@/components/ui/Modal'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getGstReturn,
  getGstReturnAudit,
  saveGstReturnArn,
  submitGstReturnForFiling,
  flagGstReturnRevision,
  listReturnInvoices,
  addReturnInvoice,
  getIrnStatus,
  getEwbStatus,
  aggregateB2CSummary,
  aggregateHsnSummary,
  detectDocumentIssues,
  type GstReturn,
  type AuditEvent,
  type HsnSacCode,
  type ReturnInvoiceDto,
  type DocumentIssueType,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// ARN validation: 2 alpha + 2 digits + 12 alphanumeric = 16 chars
// ---------------------------------------------------------------------------
const ARN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{12}$/

// ---------------------------------------------------------------------------
// Tax row types (editable table)
// ---------------------------------------------------------------------------
interface TaxRow {
  rate: string
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  cess: number
}

const defaultTaxData: TaxRow[] = [
  { rate: '0%', taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
  { rate: '5%', taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
  { rate: '12%', taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
  { rate: '18%', taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
  { rate: '28%', taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
]

// ---------------------------------------------------------------------------
// Audit trail panel
// ---------------------------------------------------------------------------
const AUDIT_TRAIL_STORAGE_KEY = 'snap_audit_expanded'

function eventTypeLabel(eventType: AuditEvent['eventType']): string {
  const map: Record<AuditEvent['eventType'], string> = {
    FILED: t('admin.gst.return.audit.event.filed'),
    APPROVED: t('admin.gst.return.audit.event.approved'),
    REJECTED: t('admin.gst.return.audit.event.rejected'),
    AMENDED: t('admin.gst.return.audit.event.amended'),
    REVISION_REQUESTED: t('admin.gst.return.audit.event.revisionRequested'),
    ASSIGNED: 'Assigned',
    CREATED: 'Created',
    UPDATED: 'Updated',
  }
  return map[eventType] ?? eventType
}

function eventDotColor(eventType: AuditEvent['eventType']): string {
  switch (eventType) {
    case 'FILED': return 'bg-info-500'
    case 'APPROVED': return 'bg-success-500'
    case 'REJECTED': return 'bg-error-500'
    case 'REVISION_REQUESTED': return 'bg-warning-500'
    case 'AMENDED': return 'bg-warning-400'
    default: return 'bg-neutral-400'
  }
}

interface AuditTrailPanelProps {
  returnId: string
}

function AuditTrailPanel({ returnId }: AuditTrailPanelProps) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(AUDIT_TRAIL_STORAGE_KEY)
      if (stored !== null) return stored === 'true'
    } catch { /* noop */ }
    // Default expanded on wide screens
    return window.innerWidth >= 1280
  })

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_TRAIL_STORAGE_KEY, String(expanded))
    } catch { /* noop */ }
  }, [expanded])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gst-return-audit', returnId],
    queryFn: () => getGstReturnAudit(returnId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!returnId,
  })

  const events = data?.items ?? []

  return (
    <section aria-labelledby="audit-title">
      <Card padding="none">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-controls="audit-event-list"
        >
          <div className="flex items-center gap-2">
            <h2 id="audit-title" className="text-sm font-semibold text-neutral-900">
              {t('admin.gst.return.audit.title')}
            </h2>
            {data && (
              <span className="text-xs text-neutral-400">
                {t('admin.gst.return.audit.count', { count: data.totalCount })}
              </span>
            )}
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4 text-neutral-400" aria-hidden="true" />}
        </button>

        {expanded && (
          <div id="audit-event-list" className="px-5 pb-5">
            {isLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-3 w-3 rounded-full bg-neutral-200 mt-1 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-neutral-100 rounded w-2/3" />
                      <div className="h-2 bg-neutral-100 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isError && (
              <div className="space-y-2">
                <p className="text-sm text-error-600">Failed to load audit trail.</p>
                <button onClick={() => void refetch()} className="text-xs text-brand-600 hover:underline">
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !isError && events.length === 0 && (
              <p className="text-sm text-neutral-400 py-2">
                {t('admin.gst.return.audit.empty')}
              </p>
            )}

            {!isLoading && events.length > 0 && (
              <ol aria-label="Audit events" className="space-y-0">
                {events.map((ev, idx) => {
                  const isLast = idx === events.length - 1
                  const actor = ev.actorDisplayName ?? ev.actorEmail
                  const isSystem = actor === 'System' || !ev.actorEmail
                  return (
                    <li key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full ring-2 ring-white mt-1',
                            eventDotColor(ev.eventType)
                          )}
                          aria-hidden="true"
                        />
                        {!isLast && (
                          <div className="w-px flex-1 bg-neutral-200 my-1 min-h-[20px]" aria-hidden="true" />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-xs text-neutral-500">
                          {formatDateTime(ev.timestamp)}
                        </p>
                        <p className="text-sm text-neutral-900 mt-0.5">
                          <span className="font-semibold">{eventTypeLabel(ev.eventType)}</span>
                          {' '}
                          <span className="text-neutral-500">
                            {t('admin.gst.return.audit.system') === 'System' || isSystem
                              ? t('admin.gst.return.audit.system')
                              : `by ${actor}`}
                          </span>
                        </p>
                        {ev.detail && (
                          <p
                            className="text-xs text-neutral-600 mt-0.5 truncate max-w-xs"
                            title={ev.detail}
                          >
                            {ev.detail}
                          </p>
                        )}
                        {ev.arnReceived && (
                          <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                            ARN: {ev.arnReceived}
                          </p>
                        )}
                        {ev.diffAvailable && (
                          <button className="text-xs text-brand-600 hover:underline mt-0.5">
                            {t('admin.gst.return.audit.diffLink')}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}

            {data && data.totalCount > events.length && (
              <button className="text-xs text-brand-600 hover:underline mt-2">
                {t('admin.gst.return.audit.loadMore')}
              </button>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// ARN Capture section
// ---------------------------------------------------------------------------
interface ArnCaptureProps {
  returnId: string
  existingArn: string | null | undefined
  existingArnSavedAt: string | null | undefined
  existingArnSavedBy: string | null | undefined
  status: GstReturn['status']
}

function ArnCaptureSection({ returnId, existingArn, existingArnSavedAt, existingArnSavedBy, status }: ArnCaptureProps) {
  const queryClient = useQueryClient()
  const [arnInput, setArnInput] = useState(existingArn ?? '')
  const [arnError, setArnError] = useState('')
  const [copied, setCopied] = useState(false)

  // Only show when status is FILED or REVISION_NEEDED
  if (status !== 'FILED' && status !== 'REVISION_NEEDED') return null

  const isReadOnly = !!existingArn
  const hasConflict = !!existingArn && arnInput !== existingArn && arnInput.length > 0

  const mutation = useMutation({
    mutationFn: (arn: string) => saveGstReturnArn(returnId, arn),
    onMutate: () => {
      toast.info(t('admin.gst.return.arn.saving'))
    },
    onSuccess: () => {
      toast.success(t('admin.gst.return.arn.saved'))
      void queryClient.invalidateQueries({ queryKey: ['gst-return', returnId] })
      void queryClient.invalidateQueries({ queryKey: ['gst-return-audit', returnId] })
    },
    onError: () => {
      toast.error(t('admin.gst.return.arn.error'))
    },
  })

  function handleSave() {
    const normalized = arnInput.trim().toUpperCase()
    if (!ARN_REGEX.test(normalized)) {
      setArnError(t('admin.gst.return.arn.invalid'))
      return
    }
    setArnError('')
    mutation.mutate(normalized)
  }

  function handleCopy() {
    const arn = existingArn ?? arnInput
    void navigator.clipboard.writeText(arn).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 space-y-3"
      aria-live="polite"
    >
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        {t('admin.gst.return.arn.label')}
      </p>

      {hasConflict && (
        <AlertBanner
          type="warning"
          title={t('admin.gst.return.arn.conflict', {
            user: existingArnSavedBy ?? 'another user',
            time: existingArnSavedAt ? formatDateTime(existingArnSavedAt) : '',
          })}
        />
      )}

      {arnError && (
        <p className="text-xs text-error-600" role="alert">{arnError}</p>
      )}

      {isReadOnly ? (
        <div className="space-y-1">
          <p
            className="font-mono text-base font-semibold text-neutral-900 tracking-wider"
            aria-describedby="arn-timestamp"
          >
            {existingArn}
          </p>
          {existingArnSavedAt && (
            <p id="arn-timestamp" className="text-xs text-neutral-500">
              {t('admin.gst.return.arn.savedAt', {
                time: formatDateTime(existingArnSavedAt),
                date: formatDateTime(existingArnSavedAt),
              })}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCopy}
              aria-label={t('admin.gst.return.arn.copy')}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span aria-live="polite">{copied ? t('admin.gst.return.arn.copied') : t('admin.gst.return.arn.copy')}</span>
            </button>
            <a
              href="https://services.gst.gov.in/services/auth/fowelcome"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t('admin.gst.return.arn.openPortal')}
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label htmlFor="arn-input" className="sr-only">{t('admin.gst.return.arn.label')}</label>
            <input
              id="arn-input"
              type="text"
              value={arnInput}
              onChange={e => {
                setArnInput(e.target.value.toUpperCase())
                setArnError('')
              }}
              onBlur={e => setArnInput(e.target.value.trim().toUpperCase())}
              placeholder={t('admin.gst.return.arn.placeholder')}
              maxLength={16}
              disabled={mutation.isPending}
              aria-describedby={arnError ? 'arn-error' : undefined}
              className="w-full font-mono text-sm uppercase tracking-wider rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:opacity-60"
            />
            {arnError && (
              <p id="arn-error" className="text-xs text-error-600 mt-1">{arnError}</p>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!arnInput.trim() || mutation.isPending}
          >
            {mutation.isPending ? t('admin.gst.return.arn.saving') : t('admin.gst.return.arn.save')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 sub-tab: B2B Invoices table
// ---------------------------------------------------------------------------
interface Gstr1B2BTabProps {
  invoices: ReturnInvoiceDto[]
  isLoading: boolean
}

function Gstr1B2BTab({ invoices, isLoading }: Gstr1B2BTabProps) {
  const b2b = invoices.filter(i => i.invoiceType === 'B2B' || i.invoiceType === 'EXPORT')

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-neutral-100 rounded-xl" />)}
      </div>
    )
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('admin.gst.return.tab.b2b')}>
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {[
                t('admin.gst.return.invoices.col.invoiceNo'),
                t('admin.gst.return.invoices.col.date'),
                t('admin.gst.return.invoices.col.buyerGstin'),
                t('admin.gst.return.invoices.col.taxableValue'),
                t('admin.gst.return.invoices.col.cgst'),
                t('admin.gst.return.invoices.col.sgst'),
                t('admin.gst.return.invoices.col.igst'),
                t('admin.gst.return.invoices.col.cess'),
                t('admin.gst.return.invoices.col.irn'),
              ].map(col => (
                <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {b2b.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-neutral-400">
                  {t('admin.gst.return.invoices.empty')}
                </td>
              </tr>
            ) : b2b.map(inv => (
              <tr key={inv.invoiceId} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-xs text-neutral-800">{inv.invoiceNumber || '—'}</td>
                <td className="px-4 py-3 text-xs text-neutral-600">{inv.invoiceDate}</td>
                <td className="px-4 py-3 font-mono text-xs text-neutral-600">{inv.buyerGstin ?? '—'}</td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={inv.taxableValue} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={inv.cgstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={inv.sgstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={inv.igstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={inv.cessAmount} size="sm" /></td>
                <td className="px-4 py-3">
                  {inv.irnStatus === 'GENERATED' ? (
                    <Badge variant="success" size="sm">IRN</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">{t('admin.gst.return.invoices.irn.pending')}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 sub-tab: B2C Summary
// ---------------------------------------------------------------------------
interface Gstr1B2CTabProps {
  invoices: ReturnInvoiceDto[]
  isLoading: boolean
}

function Gstr1B2CTab({ invoices, isLoading }: Gstr1B2CTabProps) {
  const rows = useMemo(() => aggregateB2CSummary(invoices), [invoices])

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-neutral-100 rounded-xl" />)}
      </div>
    )
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('admin.gst.return.tab.b2c')}>
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {[
                t('admin.gst.return.b2c.rateCol'),
                t('admin.gst.return.b2c.taxableCol'),
                t('admin.gst.return.b2c.igstCol'),
                t('admin.gst.return.b2c.cgstCol'),
                t('admin.gst.return.b2c.sgstCol'),
                t('admin.gst.return.b2c.totalTaxCol'),
                t('admin.gst.return.b2c.invoiceCountCol'),
              ].map(col => (
                <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-400">
                  {t('admin.gst.return.b2c.empty')}
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.gstRate} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-700">{row.gstRate}%</td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={row.taxableAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={row.igstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={row.cgstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={row.sgstAmount} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={row.totalTax} size="sm" /></td>
                <td className="px-4 py-3 text-neutral-600 text-right">{row.invoiceCount}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold">
                <td className="px-4 py-3 text-sm font-bold text-neutral-900">Total</td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={rows.reduce((s, r) => s + r.taxableAmount, 0)} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={rows.reduce((s, r) => s + r.igstAmount, 0)} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={rows.reduce((s, r) => s + r.cgstAmount, 0)} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={rows.reduce((s, r) => s + r.sgstAmount, 0)} size="sm" /></td>
                <td className="px-4 py-3 text-right"><AmountDisplay amount={rows.reduce((s, r) => s + r.totalTax, 0)} size="sm" /></td>
                <td className="px-4 py-3 text-right text-neutral-600">{rows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 sub-tab: Credit / Debit Notes
// ---------------------------------------------------------------------------
interface Gstr1CreditDebitTabProps {
  invoices: ReturnInvoiceDto[]
  isLoading: boolean
}

function Gstr1CreditDebitTab({ invoices, isLoading }: Gstr1CreditDebitTabProps) {
  const notes = invoices.filter(i => i.invoiceType === 'CREDIT_NOTE' || i.invoiceType === 'DEBIT_NOTE')

  const noteTypeLabel = (type: ReturnInvoiceDto['invoiceType']) =>
    type === 'CREDIT_NOTE'
      ? t('admin.gst.return.creditDebit.type.CREDIT_NOTE')
      : t('admin.gst.return.creditDebit.type.DEBIT_NOTE')

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2].map(i => <div key={i} className="h-10 bg-neutral-100 rounded-xl" />)}
      </div>
    )
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('admin.gst.return.tab.creditDebit')}>
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {[
                t('admin.gst.return.creditDebit.col.noteNo'),
                t('admin.gst.return.creditDebit.col.date'),
                t('admin.gst.return.creditDebit.col.type'),
                t('admin.gst.return.creditDebit.col.buyerGstin'),
                t('admin.gst.return.creditDebit.col.taxable'),
                t('admin.gst.return.invoices.col.cgst'),
                t('admin.gst.return.invoices.col.sgst'),
                t('admin.gst.return.invoices.col.igst'),
                t('admin.gst.return.creditDebit.col.tax'),
              ].map(col => (
                <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {notes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-neutral-400">
                  {t('admin.gst.return.creditDebit.empty')}
                </td>
              </tr>
            ) : notes.map(note => {
              const totalTax = note.cgstAmount + note.sgstAmount + note.igstAmount + note.cessAmount
              return (
                <tr key={note.invoiceId} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-800">{note.invoiceNumber || '—'}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{note.invoiceDate}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={note.invoiceType === 'CREDIT_NOTE' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {noteTypeLabel(note.invoiceType)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">{note.buyerGstin ?? '—'}</td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={note.taxableValue} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={note.cgstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={note.sgstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={note.igstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={totalTax} size="sm" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 sub-tab: HSN Summary
// ---------------------------------------------------------------------------
interface Gstr1HsnSummaryTabProps {
  invoices: ReturnInvoiceDto[]
  isLoading: boolean
}

function Gstr1HsnSummaryTab({ invoices, isLoading }: Gstr1HsnSummaryTabProps) {
  const rows = useMemo(() => aggregateHsnSummary(invoices), [invoices])

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-neutral-100 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400 px-1">{t('admin.gst.return.hsnSummary.derivedNote')}</p>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={t('admin.gst.return.tab.hsnSummary')}>
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {[
                  t('admin.gst.return.hsnSummary.col.description'),
                  t('admin.gst.return.hsnSummary.col.taxable'),
                  t('admin.gst.return.hsnSummary.col.cgst'),
                  t('admin.gst.return.hsnSummary.col.sgst'),
                  t('admin.gst.return.hsnSummary.col.igst'),
                  t('admin.gst.return.hsnSummary.col.cess'),
                ].map(col => (
                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
                    {t('admin.gst.return.hsnSummary.empty')}
                  </td>
                </tr>
              ) : rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-xs text-neutral-700 max-w-xs truncate" title={row.description}>{row.description}</td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={row.totalTaxableValue} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={row.cgstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={row.sgstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={row.igstAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay amount={row.cessAmount} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 sub-tab: Document Issues
// ---------------------------------------------------------------------------
interface Gstr1DocumentIssuesTabProps {
  invoices: ReturnInvoiceDto[]
  isLoading: boolean
  onReview: (invoiceId: string) => void
}

const issueLabel: Record<DocumentIssueType, string> = {
  missingBuyerGstin: 'admin.gst.return.documentIssues.issue.missingBuyerGstin',
  missingInvoiceNumber: 'admin.gst.return.documentIssues.issue.missingInvoiceNumber',
  zeroTaxableValue: 'admin.gst.return.documentIssues.issue.zeroTaxableValue',
  missingHsn: 'admin.gst.return.documentIssues.issue.missingHsn',
}

function Gstr1DocumentIssuesTab({ invoices, isLoading, onReview }: Gstr1DocumentIssuesTabProps) {
  const issues = useMemo(() => detectDocumentIssues(invoices), [invoices])

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2].map(i => <div key={i} className="h-10 bg-neutral-100 rounded-xl" />)}
      </div>
    )
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('admin.gst.return.tab.documentIssues')}>
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {[
                t('admin.gst.return.documentIssues.col.invoiceNo'),
                t('admin.gst.return.documentIssues.col.date'),
                t('admin.gst.return.invoices.col.invoiceType'),
                t('admin.gst.return.documentIssues.col.issue'),
                t('admin.gst.return.documentIssues.col.action'),
              ].map(col => (
                <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-400">
                  {t('admin.gst.return.documentIssues.empty')}
                </td>
              </tr>
            ) : issues.map(row => (
              <tr key={row.invoiceId} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-mono text-xs text-neutral-800">{row.invoiceNumber || '—'}</td>
                <td className="px-4 py-3 text-xs text-neutral-600">{row.invoiceDate}</td>
                <td className="px-4 py-3">
                  <Badge variant="neutral" size="sm">{row.invoiceType}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.issues.map(issue => (
                      <span
                        key={issue}
                        className="inline-flex items-center gap-1 rounded bg-warning-50 px-2 py-0.5 text-xs text-warning-700 border border-warning-200"
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {t(issueLabel[issue])}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onReview(row.invoiceId)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {t('admin.gst.return.documentIssues.action.review')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// GSTR-1 Summary bar
// ---------------------------------------------------------------------------
interface Gstr1SummaryBarProps {
  invoices: ReturnInvoiceDto[]
}

function Gstr1SummaryBar({ invoices }: Gstr1SummaryBarProps) {
  const b2bCount = invoices.filter(i => i.invoiceType === 'B2B' || i.invoiceType === 'EXPORT').length
  const b2cTotal = invoices
    .filter(i => i.invoiceType === 'B2C')
    .reduce((s, i) => s + i.totalInvoiceValue, 0)
  const creditNoteCount = invoices.filter(i => i.invoiceType === 'CREDIT_NOTE' || i.invoiceType === 'DEBIT_NOTE').length
  const totalTax = invoices.reduce((s, i) => s + i.igstAmount + i.cgstAmount + i.sgstAmount + i.cessAmount, 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
      {[
        { label: t('admin.gst.return.summaryBar.b2bCount'), value: String(b2bCount), isAmount: false },
        { label: t('admin.gst.return.summaryBar.b2cTotal'), value: b2cTotal, isAmount: true },
        { label: t('admin.gst.return.summaryBar.creditNotes'), value: String(creditNoteCount), isAmount: false },
        { label: t('admin.gst.return.summaryBar.totalTax'), value: totalTax, isAmount: true },
      ].map(item => (
        <div key={item.label} className="rounded-lg bg-neutral-50 border border-neutral-200 px-4 py-3">
          <p className="text-xs text-neutral-500 mb-1">{item.label}</p>
          {item.isAmount ? (
            <AmountDisplay amount={item.value as number} size="md" />
          ) : (
            <p className="text-lg font-semibold text-neutral-900">{item.value}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add-invoice modal (GSTR-1 / GSTR-1A line-item editor entry point)
// ---------------------------------------------------------------------------

const RETURN_INVOICE_TYPES: ReturnInvoiceDto['invoiceType'][] = ['B2B', 'B2C', 'EXPORT', 'CREDIT_NOTE', 'DEBIT_NOTE']

function AddReturnInvoiceModal({ returnId, onClose, onAdded }: { returnId: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    invoiceNumber: '',
    invoiceType: 'B2B' as ReturnInvoiceDto['invoiceType'],
    invoiceDate: '',
    buyerGstin: '',
    taxableValue: '',
    igstAmount: '',
    cgstAmount: '',
    sgstAmount: '',
    cessAmount: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const num = (v: string) => (v.trim() === '' ? 0 : Number(v))

  const mutation = useMutation({
    mutationFn: () =>
      addReturnInvoice(returnId, {
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceType: form.invoiceType,
        invoiceDate: form.invoiceDate,
        buyerGstin: form.buyerGstin.trim() || undefined,
        taxableValue: num(form.taxableValue),
        igstAmount: num(form.igstAmount),
        cgstAmount: num(form.cgstAmount),
        sgstAmount: num(form.sgstAmount),
        cessAmount: num(form.cessAmount),
      }),
    onSuccess: () => {
      toast.success(t('admin.gst.return.addInvoice.success'))
      onAdded()
    },
    onError: () => toast.error(t('admin.gst.return.addInvoice.error')),
  })

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.invoiceNumber.trim()) e.invoiceNumber = t('admin.gst.return.addInvoice.required')
    if (!form.invoiceDate) e.invoiceDate = t('admin.gst.return.addInvoice.required')
    if (num(form.taxableValue) <= 0) e.taxableValue = t('admin.gst.return.addInvoice.taxableRequired')
    // B2B / exports require a buyer GSTIN
    if ((form.invoiceType === 'B2B' || form.invoiceType === 'DEBIT_NOTE' || form.invoiceType === 'CREDIT_NOTE') && !form.buyerGstin.trim()) {
      e.buyerGstin = t('admin.gst.return.addInvoice.buyerRequired')
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none'

  const totalTax = num(form.igstAmount) + num(form.cgstAmount) + num(form.sgstAmount) + num(form.cessAmount)
  const totalValue = num(form.taxableValue) + totalTax

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.gst.return.addInvoice.title')}
      size="lg"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            form="add-return-invoice-form"
            variant="primary"
            disabled={mutation.isPending}
            loading={mutation.isPending}
          >
            {t('admin.gst.return.addInvoice.submit')}
          </Button>
        </div>
      }
    >
      <form
        id="add-return-invoice-form"
        onSubmit={ev => { ev.preventDefault(); if (validate()) mutation.mutate() }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{t('admin.gst.return.addInvoice.invoiceNo')} *</label>
            <input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} className={cn(inputCls, errors.invoiceNumber && 'border-error-500')} />
            {errors.invoiceNumber && <p className="text-xs text-error-600 mt-0.5">{errors.invoiceNumber}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{t('admin.gst.return.addInvoice.type')} *</label>
            <NativeSelect value={form.invoiceType} onChange={e => setForm(f => ({ ...f, invoiceType: e.target.value as ReturnInvoiceDto['invoiceType'] }))}>
              {RETURN_INVOICE_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
            </NativeSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{t('admin.gst.return.addInvoice.date')} *</label>
            <input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className={cn(inputCls, errors.invoiceDate && 'border-error-500')} />
            {errors.invoiceDate && <p className="text-xs text-error-600 mt-0.5">{errors.invoiceDate}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{t('admin.gst.return.addInvoice.buyerGstin')}</label>
            <input value={form.buyerGstin} onChange={e => setForm(f => ({ ...f, buyerGstin: e.target.value.toUpperCase() }))} maxLength={15} className={cn(inputCls, 'font-mono', errors.buyerGstin && 'border-error-500')} />
            {errors.buyerGstin && <p className="text-xs text-error-600 mt-0.5">{errors.buyerGstin}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{t('admin.gst.return.addInvoice.taxable')} *</label>
            <input type="number" step="0.01" value={form.taxableValue} onChange={e => setForm(f => ({ ...f, taxableValue: e.target.value }))} className={cn(inputCls, 'text-right tabular-nums', errors.taxableValue && 'border-error-500')} />
            {errors.taxableValue && <p className="text-xs text-error-600 mt-0.5">{errors.taxableValue}</p>}
          </div>
          {(['igstAmount', 'cgstAmount', 'sgstAmount', 'cessAmount'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-medium text-neutral-600 mb-1">{t(`admin.gst.return.addInvoice.${field}`)}</label>
              <input type="number" step="0.01" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className={cn(inputCls, 'text-right tabular-nums')} />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-6 pt-2 border-t border-neutral-100 text-sm">
          <span className="text-neutral-500">{t('admin.gst.return.addInvoice.totalTax')}: <span className="font-semibold text-neutral-900 tabular-nums">₹{totalTax.toLocaleString('en-IN')}</span></span>
          <span className="text-neutral-500">{t('admin.gst.return.addInvoice.totalValue')}: <span className="font-semibold text-neutral-900 tabular-nums">₹{totalValue.toLocaleString('en-IN')}</span></span>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Gstr3bTab = 'outward' | 'itc' | 'net' | 'invoices'
type Gstr1Tab = 'b2b' | 'b2c' | 'creditDebit' | 'hsnSummary' | 'documentIssues'

export default function GstReturnReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab3b, setActiveTab3b] = useState<Gstr3bTab>('outward')
  const [activeTab1, setActiveTab1] = useState<Gstr1Tab>('b2b')
  const [invoicePage, setInvoicePage] = useState(1)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [invoiceHsnMap, setInvoiceHsnMap] = useState<Record<string, HsnSacCode | null>>({})
  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false)

  const [taxData, setTaxData] = useState<TaxRow[]>(defaultTaxData)
  const [checklist, setChecklist] = useState({
    salesVerified: false,
    purchaseVerified: false,
    itcReconciled: false,
    lateFeesCalculated: false,
  })

  const { data: gstReturn, isLoading, isError } = useQuery({
    queryKey: ['gst-return', id],
    queryFn: () => getGstReturn(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const isGstr1 = gstReturn?.returnType === 'GSTR-1'

  // For GSTR-3B: paginated invoices (load only when invoices tab active)
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['gst-return-invoices', id, invoicePage],
    queryFn: () => listReturnInvoices(id!, { page: invoicePage, pageSize: 15 }),
    enabled: !!id && !isGstr1 && activeTab3b === 'invoices',
    staleTime: 60_000,
  })

  // For GSTR-1: load ALL invoices (up to 500) so the sub-tabs can filter/aggregate
  const { data: gstr1InvoicesData, isLoading: gstr1InvoicesLoading } = useQuery({
    queryKey: ['gst-return-invoices-all', id],
    queryFn: () => listReturnInvoices(id!, { page: 1, pageSize: 500 }),
    enabled: !!id && isGstr1,
    staleTime: 60_000,
  })

  const gstr1Invoices = gstr1InvoicesData?.items ?? []

  const { data: irnStatus } = useQuery({
    queryKey: ['irn-status', selectedInvoiceId],
    queryFn: () => getIrnStatus(selectedInvoiceId!),
    enabled: !!selectedInvoiceId,
    staleTime: 30_000,
  })

  const { data: ewbStatus } = useQuery({
    queryKey: ['ewb-status', selectedInvoiceId],
    queryFn: () => getEwbStatus(selectedInvoiceId!),
    enabled: !!selectedInvoiceId,
    staleTime: 30_000,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitGstReturnForFiling(id!),
    onSuccess: () => {
      toast.success('Return submitted for filing')
      void queryClient.invalidateQueries({ queryKey: ['gst-return', id] })
      void queryClient.invalidateQueries({ queryKey: ['gst-queue'] })
    },
    onError: () => {
      toast.error('Failed to submit for filing')
    },
  })

  const flagMutation = useMutation({
    mutationFn: () => flagGstReturnRevision(id!, 'Revision needed by reviewer'),
    onSuccess: () => {
      toast.info('Flagged for revision')
      void queryClient.invalidateQueries({ queryKey: ['gst-return', id] })
    },
    onError: () => toast.error('Failed to flag revision'),
  })

  const totals = taxData.reduce((acc, row) => ({
    taxable: acc.taxable + row.taxableAmount,
    cgst: acc.cgst + row.cgst,
    sgst: acc.sgst + row.sgst,
    igst: acc.igst + row.igst,
    total: acc.total + row.cgst + row.sgst + row.igst + row.cess,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 })

  const itcAvailable = 28350
  const itcClaimed = 26500
  const itcDiff = itcAvailable - itcClaimed
  const netTaxPayable = totals.total - itcClaimed
  const allChecked = Object.values(checklist).every(Boolean)

  // Use real data if loaded, fallback for display
  const returnTitle = gstReturn
    ? `${gstReturn.returnType} — ${gstReturn.businessName} — ${gstReturn.period}`
    : 'GST Return Review'
  const returnGstin = gstReturn?.gstin ?? '—'
  const returnStatus = gstReturn?.status ?? 'DRAFT'

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-1/3" />
        <div className="h-64 bg-neutral-100 rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <AlertBanner
        type="error"
        title="Failed to load return"
        description="Could not fetch the GST return data. Please retry."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/gst')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            GST Queue
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-neutral-900 truncate">{returnTitle}</h1>
            <p className="text-sm text-neutral-400 font-mono">
              {returnGstin}
              {gstReturn?.assignedCa && ` · Assigned: ${gstReturn.assignedCa}`}
            </p>
          </div>
          <StatusBadge status={returnStatus} />
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" leftIcon={<Phone className="h-4 w-4" />} className="text-warning-600">
            Request Callback
          </Button>
          <Button variant="secondary" size="sm">Save &amp; Assign</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!allChecked || submitMutation.isPending}
            leftIcon={<Check className="h-4 w-4" />}
            onClick={() => void submitMutation.mutate()}
          >
            Submit for Filing
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* LEFT: Return editor */}
        <div className="xl:col-span-3 space-y-4">

          {/* ── GSTR-1 Review path ── */}
          {isGstr1 ? (
            <>
              {/* Toolbar — Add invoice (editable statuses only) */}
              {gstReturn && (gstReturn.status === 'DRAFT' || gstReturn.status === 'PENDING_APPROVAL' || gstReturn.status === 'REVISION_NEEDED') && (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setAddInvoiceOpen(true)}
                  >
                    {t('admin.gst.return.addInvoice.cta')}
                  </Button>
                </div>
              )}

              {/* Summary stats bar */}
              <Gstr1SummaryBar invoices={gstr1Invoices} />

              {/* GSTR-1 Sub-tabs */}
              <div className="flex flex-wrap border-b border-neutral-200 gap-x-1" role="tablist">
                {(
                  [
                    { key: 'b2b', label: t('admin.gst.return.tab.b2b') },
                    { key: 'b2c', label: t('admin.gst.return.tab.b2c') },
                    { key: 'creditDebit', label: t('admin.gst.return.tab.creditDebit') },
                    { key: 'hsnSummary', label: t('admin.gst.return.tab.hsnSummary') },
                    { key: 'documentIssues', label: t('admin.gst.return.tab.documentIssues') },
                  ] satisfies { key: Gstr1Tab; label: string }[]
                ).map(tab => (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab1 === tab.key}
                    onClick={() => setActiveTab1(tab.key)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                      activeTab1 === tab.key
                        ? 'border-brand-500 text-brand-700'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* GSTR-1 Tab content */}
              {activeTab1 === 'b2b' && (
                <Gstr1B2BTab invoices={gstr1Invoices} isLoading={gstr1InvoicesLoading} />
              )}
              {activeTab1 === 'b2c' && (
                <Gstr1B2CTab invoices={gstr1Invoices} isLoading={gstr1InvoicesLoading} />
              )}
              {activeTab1 === 'creditDebit' && (
                <Gstr1CreditDebitTab invoices={gstr1Invoices} isLoading={gstr1InvoicesLoading} />
              )}
              {activeTab1 === 'hsnSummary' && (
                <Gstr1HsnSummaryTab invoices={gstr1Invoices} isLoading={gstr1InvoicesLoading} />
              )}
              {activeTab1 === 'documentIssues' && (
                <Gstr1DocumentIssuesTab
                  invoices={gstr1Invoices}
                  isLoading={gstr1InvoicesLoading}
                  onReview={(invoiceId) => {
                    setActiveTab1('b2b')
                    setSelectedInvoiceId(invoiceId)
                  }}
                />
              )}
            </>
          ) : (
            <>
              {/* ── GSTR-3B (and other) tabs ── */}
              <div className="flex border-b border-neutral-200" role="tablist">
                {[
                  { key: 'outward' as const, label: t('admin.gst.return.tab.outward') },
                  { key: 'itc' as const, label: t('admin.gst.return.tab.itc') },
                  { key: 'net' as const, label: t('admin.gst.return.tab.net') },
                  { key: 'invoices' as const, label: t('admin.gst.return.tab.invoices') },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab3b === tab.key}
                    onClick={() => setActiveTab3b(tab.key)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                      activeTab3b === tab.key
                        ? 'border-brand-500 text-brand-700'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Outward Supplies Tab */}
              {activeTab3b === 'outward' && (
                <Card padding="none">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="GSTR-3B Section 3.1 Outward Supplies">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                          <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Rate</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">Taxable (₹)</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">CGST (₹)</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">SGST (₹)</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">IGST (₹)</th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide">Cess (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxData.map((row, i) => (
                          <tr key={row.rate} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="px-4 py-3">
                              <span className="font-medium text-neutral-700">{row.rate}</span>
                            </td>
                            {(['taxableAmount', 'cgst', 'sgst', 'igst', 'cess'] as const).map((field) => (
                              <td key={field} className="px-4 py-2 text-right">
                                <input
                                  type="number"
                                  value={row[field]}
                                  onChange={(e) => {
                                    const updated = [...taxData]
                                    updated[i] = { ...updated[i], [field]: Number(e.target.value) }
                                    setTaxData(updated)
                                  }}
                                  className="w-28 text-right rounded border border-neutral-200 px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none font-mono"
                                  aria-label={`${row.rate} ${field}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr className="bg-neutral-50 border-t-2 border-neutral-300 font-semibold">
                          <td className="px-4 py-3 text-sm font-bold text-neutral-900">Total</td>
                          <td className="px-4 py-3 text-right"><AmountDisplay amount={totals.taxable} size="sm" /></td>
                          <td className="px-4 py-3 text-right"><AmountDisplay amount={totals.cgst} size="sm" /></td>
                          <td className="px-4 py-3 text-right"><AmountDisplay amount={totals.sgst} size="sm" /></td>
                          <td className="px-4 py-3 text-right"><AmountDisplay amount={totals.igst} size="sm" /></td>
                          <td className="px-4 py-3 text-right"><AmountDisplay amount={0} size="sm" /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {activeTab3b === 'itc' && (
                <Card>
                  <CardHeader title="Section 4 — Input Tax Credit" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                      <span className="text-sm text-neutral-600">ITC Available (from GSTR-2A/2B)</span>
                      <AmountDisplay amount={itcAvailable} size="md" />
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                      <span className="text-sm text-neutral-600">ITC Claimed</span>
                      <input
                        type="number"
                        defaultValue={itcClaimed}
                        className="w-32 text-right rounded border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 outline-none font-mono"
                        aria-label="ITC Claimed amount"
                      />
                    </div>
                    {itcDiff !== 0 && (
                      <AlertBanner
                        type="warning"
                        title="ITC Difference Detected"
                        description={`₹${itcDiff.toLocaleString('en-IN')} difference between available and claimed ITC. Review GSTR-2A/2B reconciliation.`}
                      />
                    )}
                  </div>
                </Card>
              )}

              {activeTab3b === 'net' && (
                <Card>
                  <CardHeader title="Section 6 — Net Tax Payable" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                      <span className="text-sm text-neutral-600">Total Output Tax</span>
                      <AmountDisplay amount={totals.total} size="md" />
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                      <span className="text-sm text-neutral-600">Less: ITC Claimed</span>
                      <AmountDisplay amount={itcClaimed} size="md" colorCode sign="negative" />
                    </div>
                    <div className="flex items-center justify-between py-4 rounded-lg bg-brand-50 px-4">
                      <span className="text-base font-bold text-brand-800">Net Tax Payable</span>
                      <AmountDisplay amount={netTaxPayable} size="xl" colorCode />
                    </div>
                  </div>
                </Card>
              )}

              {/* Invoice Detail tab (GSTR-3B) */}
              {activeTab3b === 'invoices' && (
                <div className="space-y-4">
                  {invoicesLoading ? (
                    <div className="space-y-2 animate-pulse">
                      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-xl" />)}
                    </div>
                  ) : (
                    <>
                      <Card padding="none">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" aria-label={t('admin.gst.return.invoices.tableLabel')}>
                            <thead>
                              <tr className="bg-neutral-50 border-b border-neutral-200">
                                {[
                                  t('admin.gst.return.invoices.col.invoiceNo'),
                                  t('admin.gst.return.invoices.col.buyerGstin'),
                                  t('admin.gst.return.invoices.col.taxableValue'),
                                  t('admin.gst.return.invoices.col.totalTax'),
                                  t('admin.gst.return.invoices.col.irn'),
                                  t('admin.gst.return.invoices.col.ewb'),
                                  t('admin.gst.return.invoices.col.hsnSac'),
                                ].map(col => (
                                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {(invoicesData?.items ?? []).length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-400">
                                    {t('admin.gst.return.invoices.empty')}
                                  </td>
                                </tr>
                              ) : (invoicesData?.items ?? []).map(invoice => (
                                <tr
                                  key={invoice.invoiceId}
                                  className={cn(
                                    'hover:bg-neutral-50 cursor-pointer',
                                    selectedInvoiceId === invoice.invoiceId && 'bg-brand-50',
                                  )}
                                  onClick={() => setSelectedInvoiceId(
                                    selectedInvoiceId === invoice.invoiceId ? null : invoice.invoiceId
                                  )}
                                >
                                  <td className="px-4 py-3 font-mono text-xs text-neutral-800">
                                    {invoice.invoiceNumber ?? '—'}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                                    {invoice.buyerGstin ?? '—'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <AmountDisplay amount={invoice.taxableValue} size="sm" />
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <AmountDisplay amount={invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount + invoice.cessAmount} size="sm" />
                                  </td>
                                  <td className="px-4 py-3">
                                    {invoice.irnStatus === 'GENERATED' ? (
                                      <Badge variant="success" size="sm">IRN</Badge>
                                    ) : (
                                      <Badge variant="neutral" size="sm">{t('admin.gst.return.invoices.irn.pending')}</Badge>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant="neutral" size="sm">{t('admin.gst.return.invoices.ewb.na')}</Badge>
                                  </td>
                                  <td className="px-4 py-3 min-w-[200px]">
                                    <HsnSacTypeahead
                                      value={invoiceHsnMap[invoice.invoiceId] ?? null}
                                      onChange={code => setInvoiceHsnMap(prev => ({ ...prev, [invoice.invoiceId]: code }))}
                                      placeholder={t('admin.gst.invoice.hsnSac.placeholder')}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>

                      {/* Pagination */}
                      {(invoicesData?.totalCount ?? 0) > 15 && (
                        <div className="flex items-center justify-between px-1">
                          <span className="text-sm text-neutral-500">
                            {t('admin.gst.return.invoices.pagination', {
                              page: invoicePage,
                              total: Math.ceil((invoicesData?.totalCount ?? 0) / 15),
                            })}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={invoicePage === 1}
                              onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                            >
                              {t('common.prev')}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={(invoicesData?.totalCount ?? 0) <= invoicePage * 15}
                              onClick={() => setInvoicePage(p => p + 1)}
                            >
                              {t('common.next')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* IRP + EWB status cards for selected invoice */}
                      {selectedInvoiceId && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            {irnStatus ? (
                              <IrpStatusCard status={irnStatus} />
                            ) : (
                              <div className="h-24 bg-neutral-100 animate-pulse rounded-xl" />
                            )}
                          </div>
                          <div>
                            {ewbStatus ? (
                              <EwbStatusCard status={ewbStatus} />
                            ) : (
                              <div className="h-24 bg-neutral-100 animate-pulse rounded-xl" />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Audit trail — below tabs on main column for tablet/mobile */}
          <div className="xl:hidden">
            {id && <AuditTrailPanel returnId={id} />}
          </div>
        </div>

        {/* RIGHT: Context + Actions */}
        <div className="xl:col-span-2 space-y-4">
          {/* Business Profile */}
          <Card>
            <CardHeader title="Business Profile" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Business</span>
                <span className="font-medium text-neutral-800">{gstReturn?.businessName ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">GSTIN</span>
                <span className="font-mono text-xs text-neutral-700">{gstReturn?.gstin ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Period</span>
                <span className="text-neutral-700">{gstReturn?.period ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Tax Payable</span>
                <AmountDisplay amount={gstReturn?.taxPayable ?? 0} size="sm" />
              </div>
            </div>
          </Card>

          {/* ARN Capture — only shown for FILED / REVISION_NEEDED */}
          {id && gstReturn && (
            <ArnCaptureSection
              returnId={id}
              existingArn={gstReturn.arn}
              existingArnSavedAt={gstReturn.arnSavedAt}
              existingArnSavedBy={gstReturn.arnSavedBy}
              status={gstReturn.status}
            />
          )}

          {/* Checklist */}
          <Card>
            <CardHeader title="Review Checklist" subtitle="All items required before submission" />
            <div className="space-y-3">
              {[
                { key: 'salesVerified', label: 'Sales data verified' },
                { key: 'purchaseVerified', label: 'Purchase data verified' },
                { key: 'itcReconciled', label: 'ITC reconciled with 2A/2B' },
                { key: 'lateFeesCalculated', label: 'Late fees calculated (if any)' },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist[item.key as keyof typeof checklist]}
                    onChange={(e) => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                    aria-label={item.label}
                  />
                  <span className="text-sm text-neutral-700">{item.label}</span>
                </label>
              ))}
            </div>
            {!allChecked && (
              <p className="text-xs text-warning-600 mt-3">
                Complete all checklist items before submitting for filing
              </p>
            )}
          </Card>

          {/* Audit trail — desktop only (right rail) */}
          <div className="hidden xl:block">
            {id && <AuditTrailPanel returnId={id} />}
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            <Button
              variant="primary"
              fullWidth
              disabled={!allChecked || submitMutation.isPending}
              leftIcon={<Check className="h-4 w-4" />}
              onClick={() => void submitMutation.mutate()}
            >
              Submit for Filing
            </Button>
            <Button variant="secondary" fullWidth>
              Save &amp; Assign for Review
            </Button>
            <Button
              variant="ghost"
              fullWidth
              className="text-error-600 hover:bg-error-50"
              leftIcon={<X className="h-4 w-4" />}
              onClick={() => void flagMutation.mutate()}
              disabled={flagMutation.isPending}
            >
              Flag Revision Needed
            </Button>
          </div>
        </div>
      </div>

      {addInvoiceOpen && id && (
        <AddReturnInvoiceModal
          returnId={id}
          onClose={() => setAddInvoiceOpen(false)}
          onAdded={() => {
            setAddInvoiceOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['gst-return-invoices-all', id] })
          }}
        />
      )}
    </div>
  )
}
