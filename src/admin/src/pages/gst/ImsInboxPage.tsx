/**
 * ImsInboxPage — GSTN IMS Inbox (GAP-101 / Board #32)
 * Route: /gst/ims
 * Permissions: gst.ims.read (list), gst.ims.action (actions), gst.ims.sync (sync)
 *
 * Regulatory context: Mandatory from 1 Apr 2026. Taxpayers must accept/reject
 * inward invoices before GSTR-2B is generated (14th of following month).
 * Deemed acceptance: any PENDING invoice at generation time is auto-ACCEPTED.
 */
import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  PauseCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  X,
  Info,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { Can } from '@/components/shared/Can'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listImsInvoices,
  getImsSummary,
  syncImsInvoices,
  actOnImsInvoice,
  bulkActOnImsInvoices,
  periodToLabel,
  getLastNPeriods,
  getCurrentOpenPeriod,
  formatDateDMY,
  formatDateDMMMY,
  formatTimestampIST,
  daysUntilDeadline,
  canAccept,
  canReject,
  canKeepPending,
  type ImsInvoiceSummary,
  type ImsStatus,
  type ImsAction,
} from '@/lib/gstImsApi'
import { useAuth } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20
const BULK_CAP = 100
const UNDO_WINDOW_MS = 5000
const QUICK_REJECT_REASONS = [
  { key: 'price', label: t('gst.ims.reject.reason.price') },
  { key: 'notReceived', label: t('gst.ims.reject.reason.notReceived') },
  { key: 'duplicate', label: t('gst.ims.reject.reason.duplicate') },
  { key: 'taxRate', label: t('gst.ims.reject.reason.taxRate') },
  { key: 'notMine', label: t('gst.ims.reject.reason.notMine') },
]

// ---------------------------------------------------------------------------
// DueDateChip for IMS (replaces generic DueDateChip with IMS-specific logic)
// ---------------------------------------------------------------------------

interface ImsDueDateChipProps {
  daysLeft: number
  deemedAccepted: boolean
  windowPast: boolean
  status: ImsStatus
}

function ImsDueDateChip({ daysLeft, deemedAccepted, windowPast, status }: ImsDueDateChipProps) {
  if (deemedAccepted || (windowPast && status === 'ACCEPTED')) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
        aria-label={t('gst.ims.status.deemed')}
      >
        <CheckCircle className="h-3 w-3" aria-hidden="true" />
        {t('gst.ims.status.deemed')}
      </span>
    )
  }

  if (status === 'ACCEPTED' || status === 'REJECTED') {
    return null
  }

  let colorCls = 'bg-neutral-100 text-neutral-600 border-neutral-200'
  let Icon = Clock
  let label = t('gst.ims.deadline.inDays', { count: daysLeft })
  let ariaLabel = t('gst.ims.deadline.a11y', { count: daysLeft })

  if (daysLeft <= 0) {
    colorCls = 'bg-red-50 text-red-700 border-red-200'
    Icon = AlertTriangle
    label = t('gst.ims.deadline.dueToday')
    ariaLabel = t('gst.ims.deadline.dueToday')
  } else if (daysLeft <= 3) {
    colorCls = 'bg-red-50 text-red-700 border-red-200'
    Icon = Clock
  } else if (daysLeft <= 7) {
    colorCls = 'bg-amber-50 text-amber-700 border-amber-200'
    Icon = Clock
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
        colorCls
      )}
      aria-label={ariaLabel}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ImsStatusBadge
// ---------------------------------------------------------------------------

interface ImsStatusBadgeProps {
  status: ImsStatus
  deemedAccepted?: boolean
}

function ImsStatusBadge({ status, deemedAccepted }: ImsStatusBadgeProps) {
  const config: Record<ImsStatus, { label: string; cls: string; Icon: typeof CheckCircle }> = {
    PENDING: {
      label: t('gst.ims.status.PENDING'),
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      Icon: Clock,
    },
    ACCEPTED: {
      label: t('gst.ims.status.ACCEPTED'),
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Icon: CheckCircle,
    },
    REJECTED: {
      label: t('gst.ims.status.REJECTED'),
      cls: 'bg-red-50 text-red-700 border-red-200',
      Icon: XCircle,
    },
    PENDING_KEPT: {
      label: t('gst.ims.status.PENDING_KEPT'),
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
      Icon: PauseCircle,
    },
  }

  const { label, cls, Icon } = config[status] ?? config.PENDING

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border', cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
      {deemedAccepted && (
        <span className="ml-1 text-xs text-neutral-500 font-normal">(Deemed)</span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Toast / Undo primitive (lightweight, no external lib needed)
// ---------------------------------------------------------------------------

interface UndoToast {
  id: string
  message: string
  onUndo: () => void
}

function UndoToastBar({ toast, onDismiss }: { toast: UndoToast; onDismiss: (id: string) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-neutral-900 text-white px-4 py-3 rounded-xl shadow-lg min-w-64"
    >
      <span className="flex-1 text-sm">{toast.message}</span>
      <button
        onClick={() => { toast.onUndo(); onDismiss(toast.id) }}
        className="text-brand-300 text-sm font-semibold hover:text-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded px-2 py-0.5"
      >
        {t('gst.ims.undo.label')}
      </button>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-neutral-400 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded p-0.5"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reject reason modal
// ---------------------------------------------------------------------------

interface RejectReasonModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  invoiceNumber: string
  count?: number
  loading?: boolean
}

function RejectReasonModal({
  open,
  onClose,
  onConfirm,
  invoiceNumber,
  count,
  loading,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const isMulti = count && count > 1
  const title = isMulti
    ? t('gst.ims.reject.title', { invoiceNumber: `${count} invoices` })
    : t('gst.ims.reject.title', { invoiceNumber })

  const isValid = reason.trim().length >= 3
  const showError = touched && !isValid

  function handleClose() {
    setReason('')
    setTouched(false)
    onClose()
  }

  function handleConfirm() {
    setTouched(true)
    if (!isValid) {
      reasonRef.current?.focus()
      return
    }
    onConfirm(reason.trim())
    setReason('')
    setTouched(false)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={loading}>
            {t('gst.ims.reject.confirm')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">{t('gst.ims.reject.consequence')}</p>

        {/* Quick-pick reason chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_REJECT_REASONS.map(r => (
            <button
              key={r.key}
              onClick={() => setReason(r.label)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                reason === r.label
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Reason text area */}
        <div>
          <label
            htmlFor="reject-reason"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            {t('gst.ims.reject.reasonLabel')}
            <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
          </label>
          <textarea
            id="reject-reason"
            ref={reasonRef}
            value={reason}
            onChange={e => { setReason(e.target.value); setTouched(true) }}
            rows={3}
            maxLength={250}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 resize-none',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
              showError ? 'border-red-300' : 'border-neutral-300'
            )}
            aria-required="true"
            aria-invalid={showError}
            aria-describedby={showError ? 'reject-reason-error' : undefined}
          />
          {showError && (
            <p id="reject-reason-error" role="alert" className="text-xs text-red-600 mt-1">
              {t('gst.ims.reject.reasonRequired')}
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1 text-right">
            {reason.length}/250
          </p>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Education modal (How IMS works)
// ---------------------------------------------------------------------------

function ImsEducationModal({
  open,
  onClose,
  deadline,
  period,
}: {
  open: boolean
  onClose: () => void
  deadline: string
  period: string
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('gst.ims.edu.title')}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('gst.ims.edu.gotIt')}</Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-neutral-700">
        <p>
          Each supplier-reported inward invoice in the IMS inbox must be actioned before GSTR-2B
          is generated on the 14th of the following month for period{' '}
          <strong>{periodToLabel(period)}</strong> (deadline:{' '}
          <strong>{formatDateDMMMY(deadline)}</strong>).
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>Accept</strong> — ITC flows into GSTR-2B. This is the default happy path.</span>
          </div>
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>Reject</strong> — ITC does NOT flow. The supplier must amend via GSTR-1A.</span>
          </div>
          <div className="flex items-start gap-2">
            <PauseCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>Pending (kept)</strong> — Deferred decision. Still subject to deemed acceptance.</span>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="font-semibold text-amber-800">{t('gst.ims.edu.doingNothing')}</p>
          <p className="text-amber-700 mt-1 text-xs">
            If you do nothing, the invoice is <strong>automatically accepted</strong> on the 14th.
            This silently claims the ITC on your behalf.
          </p>
        </div>
        <p>
          To correct a <strong>rejected</strong> invoice after GSTR-2B is generated, you must
          raise a GSTR-1A amendment.
        </p>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Inline row action buttons
// ---------------------------------------------------------------------------

interface InvoiceActionButtonsProps {
  invoice: ImsInvoiceSummary
  windowPast: boolean
  onAccept: (inv: ImsInvoiceSummary) => void
  onReject: (inv: ImsInvoiceSummary) => void
  onKeepPending: (inv: ImsInvoiceSummary) => void
  onFixViaGstr1a: (inv: ImsInvoiceSummary) => void
  loadingId: string | null
}

function InvoiceActionButtons({
  invoice,
  windowPast,
  onAccept,
  onReject,
  onKeepPending,
  onFixViaGstr1a,
  loadingId,
}: InvoiceActionButtonsProps) {
  const busy = loadingId === invoice.id

  if (windowPast) {
    if (invoice.status === 'REJECTED') {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFixViaGstr1a(invoice)}
          leftIcon={<ExternalLink className="h-3 w-3" />}
        >
          {t('gst.ims.action.fixViaGstr1a')}
        </Button>
      )
    }
    return null
  }

  return (
    <Can permission="gst.ims.action">
      <div className="flex items-center gap-1 flex-wrap">
        {canAccept(invoice.status) && (
          <Button
            variant="success"
            size="sm"
            loading={busy}
            onClick={() => onAccept(invoice)}
            aria-label={`${t('gst.ims.action.accept')} invoice ${invoice.invoiceNumber}`}
          >
            {t('gst.ims.action.accept')}
          </Button>
        )}
        {canReject(invoice.status) && (
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={() => onReject(invoice)}
            aria-label={`${t('gst.ims.action.reject')} invoice ${invoice.invoiceNumber}`}
          >
            {t('gst.ims.action.reject')}
          </Button>
        )}
        {canKeepPending(invoice.status) && (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => onKeepPending(invoice)}
            title={t('gst.ims.keepPending.hint')}
            aria-label={`${t('gst.ims.action.keepPending')} invoice ${invoice.invoiceNumber}`}
          >
            {t('gst.ims.action.keepPending')}
          </Button>
        )}
        {(invoice.status === 'ACCEPTED' || invoice.status === 'REJECTED') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFixViaGstr1a(invoice)}
            leftIcon={<ExternalLink className="h-3 w-3" />}
            aria-label={`Fix invoice ${invoice.invoiceNumber} via GSTR-1A`}
          >
            {t('gst.ims.action.fixViaGstr1a')}
          </Button>
        )}
      </div>
    </Can>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

interface ImsInboxPageProps {
  /** Organization ID from context; in production sourced from global GSTIN selector */
  organizationId?: string
  /** GSTIN string for sync */
  gstin?: string
}

export default function ImsInboxPage({ organizationId = '', gstin = '' }: ImsInboxPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // ── State ─────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState(getCurrentOpenPeriod)
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierGstinFilter, setSupplierGstinFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, ImsStatus>>({})

  const [rejectTarget, setRejectTarget] = useState<ImsInvoiceSummary | null>(null)
  const [rejectBulk, setRejectBulk] = useState(false)
  const [showEduModal, setShowEduModal] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [liveRegionMsg, setLiveRegionMsg] = useState('')

  const [undoToasts, setUndoToasts] = useState<UndoToast[]>([])
  const undoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const periods = getLastNPeriods(12)

  // ── Queries ───────────────────────────────────────────────────────────────
  const summaryKey = ['ims', 'summary', organizationId, period]
  const listKey = ['ims', 'list', organizationId, period, statusFilter, supplierGstinFilter, search, page, pageSize]

  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } =
    useQuery({
      queryKey: summaryKey,
      queryFn: () => getImsSummary(organizationId, period),
      enabled: !!organizationId && !!period,
      staleTime: 30_000,
    })

  const {
    data: listData,
    isLoading: listLoading,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listImsInvoices({
        organizationId,
        period,
        status: statusFilter || undefined,
        supplierGstin: supplierGstinFilter || undefined,
        search: search || undefined,
        page,
        pageSize,
      }),
    enabled: !!organizationId && !!period,
    staleTime: 30_000,
  })

  // ── Sync mutation ─────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: () =>
      syncImsInvoices({ organizationId, gstin: gstin || '', period }),
    onSuccess: data => {
      setSyncError(null)
      setLastSyncedAt(new Date().toISOString())
      setLiveRegionMsg(t('gst.ims.sync.success', { inserted: data.inserted, skipped: data.skipped }))
      void queryClient.invalidateQueries({ queryKey: ['ims'] })
    },
    onError: (err: { response?: { status: number; data?: { message?: string } } }) => {
      const status = err.response?.status
      if (status === 429) {
        setSyncError(t('gst.ims.sync.rateLimited'))
      } else {
        setSyncError(t('gst.ims.sync.error', { message: err.response?.data?.message ?? 'Unknown error' }))
      }
    },
  })

  // ── Action mutation ───────────────────────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: ({ invoiceId, action, reason }: { invoiceId: string; action: ImsAction; reason?: string }) =>
      actOnImsInvoice(invoiceId, {
        organizationId,
        actionedBy: user?.uid ?? '',
        action,
        reason,
      }),
  })

  // ── Bulk action mutation ──────────────────────────────────────────────────
  const bulkMutation = useMutation({
    mutationFn: (params: { action: ImsAction; reason?: string; invoiceIds: string[] }) =>
      bulkActOnImsInvoices({
        organizationId,
        actionedBy: user?.uid ?? '',
        items: params.invoiceIds.map(id => ({ invoiceId: id, action: params.action, reason: params.reason })),
      }),
    onSuccess: data => {
      setSelectedIds(new Set())
      setLiveRegionMsg(
        t('gst.ims.bulk.result', {
          changed: data.changed,
          skipped: data.skipped,
          failed: data.failed,
        })
      )
      void queryClient.invalidateQueries({ queryKey: ['ims'] })
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function addUndoToast(id: string, message: string, onUndo: () => void) {
    const toast: UndoToast = { id, message, onUndo }
    setUndoToasts(prev => [...prev, toast])
    undoTimers.current[id] = setTimeout(() => dismissUndoToast(id), UNDO_WINDOW_MS)
  }

  function dismissUndoToast(id: string) {
    setUndoToasts(prev => prev.filter(t => t.id !== id))
    if (undoTimers.current[id]) {
      clearTimeout(undoTimers.current[id])
      delete undoTimers.current[id]
    }
  }

  const handleAccept = useCallback(
    async (invoice: ImsInvoiceSummary) => {
      const prevStatus = invoice.status
      // Optimistic update
      setOptimisticOverrides(o => ({ ...o, [invoice.id]: 'ACCEPTED' }))
      setLoadingInvoiceId(invoice.id)
      try {
        await actionMutation.mutateAsync({ invoiceId: invoice.id, action: 'ACCEPTED' })
        const toastId = `accept-${invoice.id}`
        const undoStatus: ImsAction = prevStatus === 'PENDING' ? 'PENDING_KEPT' : prevStatus === 'PENDING_KEPT' ? 'PENDING_KEPT' : 'PENDING_KEPT'
        addUndoToast(
          toastId,
          t('gst.ims.accept.success', { invoiceNumber: invoice.invoiceNumber }),
          () => {
            void handleUndoAction(invoice.id, undoStatus)
          }
        )
        setLiveRegionMsg(t('gst.ims.accept.success', { invoiceNumber: invoice.invoiceNumber }))
        void refetchList()
        void refetchSummary()
      } catch {
        // Roll back optimistic update
        setOptimisticOverrides(o => {
          const next = { ...o }
          delete next[invoice.id]
          return next
        })
        setLiveRegionMsg(
          t('gst.ims.error.alreadySettled', { status: 'ACCEPTED', action: 'reject' })
        )
      } finally {
        setLoadingInvoiceId(null)
      }
    },
    [actionMutation, refetchList, refetchSummary]
  )

  const handleUndoAction = useCallback(
    async (invoiceId: string, action: ImsAction) => {
      try {
        await actOnImsInvoice(invoiceId, {
          organizationId,
          actionedBy: user?.uid ?? '',
          action,
        })
        setLiveRegionMsg(t('gst.ims.undo.movedToKept'))
        setOptimisticOverrides(o => {
          const next = { ...o }
          delete next[invoiceId]
          return next
        })
        void queryClient.invalidateQueries({ queryKey: ['ims'] })
      } catch {
        // silent — undo already past window or illegal transition
      }
    },
    [organizationId, queryClient, user?.uid]
  )

  const handleRejectConfirm = useCallback(
    async (reason: string) => {
      if (rejectBulk) {
        const eligible = getEligibleSelection('REJECTED')
        const ids = eligible.map(inv => inv.id)
        setRejectTarget(null)
        setRejectBulk(false)
        await bulkMutation.mutateAsync({ action: 'REJECTED', reason, invoiceIds: ids })
        return
      }
      if (!rejectTarget) return
      const inv = rejectTarget
      setRejectTarget(null)
      setLoadingInvoiceId(inv.id)
      try {
        await actionMutation.mutateAsync({ invoiceId: inv.id, action: 'REJECTED', reason })
        setLiveRegionMsg(t('gst.ims.reject.success', { invoiceNumber: inv.invoiceNumber }))
        const toastId = `reject-${inv.id}`
        addUndoToast(
          toastId,
          t('gst.ims.reject.success', { invoiceNumber: inv.invoiceNumber }),
          () => {
            void handleUndoAction(inv.id, 'PENDING_KEPT')
          }
        )
        void refetchList()
        void refetchSummary()
      } catch {
        setLiveRegionMsg(
          t('gst.ims.error.alreadySettled', { status: 'REJECTED', action: 'accept' })
        )
      } finally {
        setLoadingInvoiceId(null)
      }
    },
    [actionMutation, bulkMutation, rejectBulk, rejectTarget, refetchList, refetchSummary, handleUndoAction]
  )

  const handleKeepPending = useCallback(
    async (invoice: ImsInvoiceSummary) => {
      setOptimisticOverrides(o => ({ ...o, [invoice.id]: 'PENDING_KEPT' }))
      setLoadingInvoiceId(invoice.id)
      try {
        await actionMutation.mutateAsync({ invoiceId: invoice.id, action: 'PENDING_KEPT' })
        const toastId = `keep-${invoice.id}`
        addUndoToast(
          toastId,
          `Invoice ${invoice.invoiceNumber} moved to pending-kept.`,
          () => {
            void handleUndoAction(invoice.id, 'ACCEPTED')
          }
        )
        void refetchList()
        void refetchSummary()
      } catch {
        setOptimisticOverrides(o => {
          const next = { ...o }
          delete next[invoice.id]
          return next
        })
      } finally {
        setLoadingInvoiceId(null)
      }
    },
    [actionMutation, refetchList, refetchSummary, handleUndoAction]
  )

  function handleFixViaGstr1a(invoice: ImsInvoiceSummary) {
    navigate(`/gst/ims/gstr1a?from=${invoice.id}&invoiceNumber=${invoice.invoiceNumber}&supplierGstin=${invoice.supplierGstin}&period=${invoice.period}`)
  }

  // Checkbox selection
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const invoices = listData?.items ?? []
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map(i => i.id)))
    }
  }

  function getEligibleSelection(action: ImsAction): ImsInvoiceSummary[] {
    const invoices = listData?.items ?? []
    return invoices.filter(inv => {
      if (!selectedIds.has(inv.id)) return false
      const status = (optimisticOverrides[inv.id] ?? inv.status) as ImsStatus
      if (action === 'ACCEPTED') return canAccept(status)
      if (action === 'REJECTED') return canReject(status)
      if (action === 'PENDING_KEPT') return canKeepPending(status)
      return false
    })
  }

  const selectedArray = Array.from(selectedIds)
  const overCap = selectedArray.length > BULK_CAP
  const windowPast = summary?.gstr2bGenerationPast ?? false

  // Days until deadline
  const daysLeft = summary?.gstr2bGenerationDeadline
    ? daysUntilDeadline(summary.gstr2bGenerationDeadline)
    : 999

  const pendingAndKept = (summary?.pending ?? 0) + (summary?.pendingKept ?? 0)
  const showBanner = !bannerDismissed && !!summary

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Live region for screen-reader announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveRegionMsg}
      </div>

      {/* Page header */}
      <PageHeader
        title={t('gst.ims.nav.title')}
        subtitle={`${t('gst.ims.breadcrumb')} · ${periodToLabel(period)}`}
        actions={
          <div className="flex items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="ims-period" className="text-sm text-neutral-600">
                {t('gst.ims.period.label')}
              </label>
              <select
                id="ims-period"
                value={period}
                onChange={e => { setPeriod(e.target.value); setPage(1) }}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {periods.map(p => (
                  <option key={p} value={p}>
                    {periodToLabel(p)}
                  </option>
                ))}
              </select>
            </div>

            {/* Sync button */}
            <Can permission="gst.ims.sync">
              <Button
                variant="secondary"
                size="sm"
                loading={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
                leftIcon={<RefreshCw className="h-4 w-4" />}
                aria-label={t('gst.ims.sync.hint')}
                title={t('gst.ims.sync.hint')}
              >
                {t('gst.ims.sync.button')}
              </Button>
            </Can>
          </div>
        }
      />

      {/* Last synced timestamp */}
      <div className="text-xs text-neutral-500">
        {lastSyncedAt
          ? t('gst.ims.sync.lastSynced', { datetime: formatTimestampIST(lastSyncedAt) })
          : t('gst.ims.sync.never')}
      </div>

      {/* Sync error banner */}
      {syncError && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            {syncError}
            <button
              onClick={() => { setSyncError(null); syncMutation.mutate() }}
              className="ml-3 underline font-medium hover:no-underline"
            >
              {t('gst.ims.error.retry')}
            </button>
          </div>
          <button onClick={() => setSyncError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Deemed-acceptance banner */}
      {showBanner && (
        <div
          role={windowPast ? 'status' : 'alert'}
          aria-live={windowPast ? 'polite' : 'assertive'}
          className={cn(
            'flex items-start gap-3 p-4 rounded-xl border text-sm',
            windowPast
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          )}
        >
          {windowPast
            ? <Info className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            : <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="flex-1">
            {windowPast
              ? t('gst.ims.banner.windowPast', { period: periodToLabel(period) })
              : t('gst.ims.banner.actionRequired', {
                  date: formatDateDMMMY(summary?.gstr2bGenerationDeadline ?? ''),
                  count: pendingAndKept,
                })}
            {' '}
            {!windowPast && (
              <button
                onClick={() => setShowEduModal(true)}
                className="underline font-medium hover:no-underline ml-1"
              >
                {t('gst.ims.banner.learnMore')}
              </button>
            )}
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss banner"
            className={cn(
              'shrink-0 hover:opacity-70 transition-opacity',
              windowPast ? 'text-blue-500' : 'text-amber-500'
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary KPI cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="card" />
          ))}
        </div>
      ) : summaryError ? null : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: t('gst.ims.summary.pending'),
              count: summary.pending,
              value: summary.totalPendingValue,
              colorCls: 'border-l-amber-400 bg-amber-50',
              textCls: 'text-amber-800',
              status: 'PENDING',
            },
            {
              label: t('gst.ims.summary.accepted'),
              count: summary.accepted,
              value: summary.totalAcceptedValue,
              colorCls: 'border-l-emerald-400 bg-emerald-50',
              textCls: 'text-emerald-800',
              status: 'ACCEPTED',
            },
            {
              label: t('gst.ims.summary.rejected'),
              count: summary.rejected,
              value: summary.totalRejectedValue,
              colorCls: 'border-l-red-400 bg-red-50',
              textCls: 'text-red-800',
              status: 'REJECTED',
            },
            {
              label: t('gst.ims.summary.pendingKept'),
              count: summary.pendingKept,
              value: undefined,
              colorCls: 'border-l-blue-400 bg-blue-50',
              textCls: 'text-blue-800',
              status: 'PENDING_KEPT',
            },
          ].map(card => (
            <button
              key={card.status}
              onClick={() => {
                setStatusFilter(statusFilter === card.status ? '' : card.status)
                setPage(1)
                setLiveRegionMsg(
                  `Showing ${card.count} ${card.label.toLowerCase()} invoices for ${periodToLabel(period)}`
                )
              }}
              className={cn(
                'text-left p-4 rounded-xl border-l-4 shadow-sm transition-all duration-150 hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                card.colorCls,
                statusFilter === card.status ? 'ring-2 ring-brand-500' : ''
              )}
              aria-pressed={statusFilter === card.status}
            >
              <div className={cn('text-sm font-medium', card.textCls)}>{card.label}</div>
              <div className={cn('text-2xl font-bold mt-1', card.textCls)}>{card.count}</div>
              {card.value !== undefined && (
                <div className="text-xs text-neutral-500 mt-1">
                  <AmountDisplay amount={card.value} size="sm" />
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* Total count */}
      {summary && (
        <div className="text-sm text-neutral-600">
          {t('gst.ims.summary.total', { count: summary.total })}
        </div>
      )}

      {/* Tabs: Inbox | GSTR-1A amendments */}
      <div
        role="tablist"
        className="flex gap-1 border-b border-neutral-200"
        aria-label="IMS views"
      >
        <button
          role="tab"
          aria-selected={true}
          className="px-4 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-600 -mb-px"
        >
          {t('gst.ims.nav.title')}
        </button>
        <button
          role="tab"
          aria-selected={false}
          onClick={() => navigate('/gst/ims/gstr1a')}
          className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          {t('gst.gstr1a.nav.title')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {[
            { value: '', label: t('gst.ims.filter.all') },
            { value: 'PENDING', label: t('gst.ims.status.PENDING') },
            { value: 'ACCEPTED', label: t('gst.ims.status.ACCEPTED') },
            { value: 'REJECTED', label: t('gst.ims.status.REJECTED') },
            { value: 'PENDING_KEPT', label: t('gst.ims.status.PENDING_KEPT') },
          ].map(chip => (
            <button
              key={chip.value}
              onClick={() => { setStatusFilter(chip.value); setPage(1) }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                statusFilter === chip.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
              )}
              aria-pressed={statusFilter === chip.value}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder={t('gst.ims.filter.searchPlaceholder')}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-52"
          aria-label={t('gst.ims.filter.searchPlaceholder')}
        />

        {/* Clear filters */}
        {(statusFilter || search || supplierGstinFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setSearch(''); setSupplierGstinFilter(''); setPage(1) }}
            className="text-xs text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
          >
            {t('gst.ims.filter.clear')}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedArray.length > 0 && (
        <div
          role="region"
          aria-label={t('gst.ims.bulk.selectedCount', { count: selectedArray.length })}
          className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-xl"
        >
          <span
            className="text-sm font-medium text-brand-700"
            aria-live="polite"
          >
            {t('gst.ims.bulk.selectedCount', { count: selectedArray.length })}
          </span>

          {overCap && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
              {t('gst.ims.bulk.cap')}
            </span>
          )}

          {!overCap && !windowPast && (
            <Can permission="gst.ims.action">
              <div className="flex gap-2">
                <Button
                  variant="success"
                  size="sm"
                  loading={bulkMutation.isPending}
                  onClick={() => {
                    const eligible = getEligibleSelection('ACCEPTED')
                    if (eligible.length === 0) return
                    void bulkMutation.mutateAsync({ action: 'ACCEPTED', invoiceIds: eligible.map(i => i.id) })
                  }}
                >
                  {t('gst.ims.action.accept')} ({getEligibleSelection('ACCEPTED').length})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => { setRejectBulk(true); setRejectTarget(null) }}
                >
                  {t('gst.ims.action.reject')} ({getEligibleSelection('REJECTED').length})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={bulkMutation.isPending}
                  onClick={() => {
                    const eligible = getEligibleSelection('PENDING_KEPT')
                    if (eligible.length === 0) return
                    void bulkMutation.mutateAsync({ action: 'PENDING_KEPT', invoiceIds: eligible.map(i => i.id) })
                  }}
                >
                  {t('gst.ims.action.keepPending')} ({getEligibleSelection('PENDING_KEPT').length})
                </Button>
              </div>
            </Can>
          )}

          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-neutral-500 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Invoice table */}
      {listLoading ? (
        <Skeleton variant="dataTableDense" />
      ) : listError ? (
        <div role="alert" className="p-6 text-center text-sm text-red-600">
          <p className="font-medium">{t('gst.ims.error.loadFailed')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetchList()}>
            {t('gst.ims.error.retry')}
          </Button>
        </div>
      ) : !listData || listData.items.length === 0 ? (
        <EmptyState
          variant="generic"
          title={
            statusFilter || search
              ? t('gst.ims.empty.filtered', { status: statusFilter || 'matching' })
              : lastSyncedAt
                ? t('gst.ims.empty.noInvoices', { period: periodToLabel(period) })
                : t('gst.ims.empty.neverSynced', { period: periodToLabel(period) })
          }
          primaryCta={
            !lastSyncedAt
              ? { label: t('gst.ims.sync.button'), onPress: () => syncMutation.mutate() }
              : statusFilter || search
                ? { label: t('gst.ims.filter.clear'), onPress: () => { setStatusFilter(''); setSearch('') } }
                : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm" role="grid" aria-label="IMS invoice inbox">
            <thead>
              <tr className="bg-neutral-50">
                <th scope="col" className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === listData.items.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all invoices on this page"
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.supplier')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.invoice')}
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.taxableValue')}
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.tax')}
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.invoiceValue')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.source')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.deadline')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('gst.ims.col.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {listData.items.map((invoice, idx) => {
                const effectiveStatus = (optimisticOverrides[invoice.id] ?? invoice.status) as ImsStatus
                const taxTotal = invoice.igstAmount + invoice.cgstAmount + invoice.sgstAmount + invoice.cessAmount

                const ariaLabel = [
                  invoice.supplierName,
                  `GSTIN ${invoice.supplierGstin}`,
                  `invoice ${invoice.invoiceNumber} dated ${formatDateDMY(invoice.invoiceDate)}`,
                  `taxable ₹${invoice.taxableValue}`,
                  `tax ₹${taxTotal}`,
                  `total ₹${invoice.invoiceValue}`,
                  `status ${effectiveStatus}`,
                ].join(', ')

                return (
                  <tr
                    key={invoice.id}
                    className={cn(
                      'border-t border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer',
                      idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/30'
                    )}
                    aria-label={ariaLabel}
                    onClick={() => navigate(`/gst/ims/${invoice.id}`)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={e => { e.stopPropagation(); toggleSelect(invoice.id) }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(invoice.id)}
                        onChange={() => toggleSelect(invoice.id)}
                        aria-label={`Select invoice ${invoice.invoiceNumber}`}
                        className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900 truncate max-w-[160px]">
                        {invoice.supplierName}
                      </div>
                      <div className="font-mono text-xs text-neutral-500 mt-0.5">
                        {invoice.supplierGstin}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-neutral-900">{invoice.invoiceNumber}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{formatDateDMY(invoice.invoiceDate)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AmountDisplay amount={invoice.taxableValue} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AmountDisplay amount={taxTotal} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <AmountDisplay amount={invoice.invoiceValue} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                        {invoice.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ImsStatusBadge status={effectiveStatus} deemedAccepted={invoice.deemedAccepted} />
                    </td>
                    <td className="px-4 py-3">
                      <ImsDueDateChip
                        daysLeft={daysLeft}
                        deemedAccepted={invoice.deemedAccepted}
                        windowPast={windowPast}
                        status={effectiveStatus}
                      />
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <InvoiceActionButtons
                        invoice={{ ...invoice, status: effectiveStatus }}
                        windowPast={windowPast}
                        onAccept={handleAccept}
                        onReject={inv => { setRejectTarget(inv); setRejectBulk(false) }}
                        onKeepPending={handleKeepPending}
                        onFixViaGstr1a={handleFixViaGstr1a}
                        loadingId={loadingInvoiceId}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {listData && listData.totalCount > pageSize && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="rounded border border-neutral-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {[20, 50, 100].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, listData.totalCount)} of {listData.totalCount}
            </span>
            <Button
              variant="icon"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
            >
              ‹
            </Button>
            <Button
              variant="icon"
              size="sm"
              disabled={page * pageSize >= listData.totalCount}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              ›
            </Button>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      <RejectReasonModal
        open={!!rejectTarget || rejectBulk}
        onClose={() => { setRejectTarget(null); setRejectBulk(false) }}
        onConfirm={handleRejectConfirm}
        invoiceNumber={rejectTarget?.invoiceNumber ?? ''}
        count={rejectBulk ? getEligibleSelection('REJECTED').length : undefined}
        loading={actionMutation.isPending || bulkMutation.isPending}
      />

      {/* Education modal */}
      <ImsEducationModal
        open={showEduModal}
        onClose={() => setShowEduModal(false)}
        deadline={summary?.gstr2bGenerationDeadline ?? ''}
        period={period}
      />

      {/* Undo toast stack */}
      {undoToasts.map(toast => (
        <UndoToastBar key={toast.id} toast={toast} onDismiss={dismissUndoToast} />
      ))}
    </div>
  )
}
