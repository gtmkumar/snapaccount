/**
 * CallbackDetailPage — Admin Callback Detail
 * Route: /callbacks/:id
 * Phase: 6E
 * TODO Phase 6F: role-gate to CA + Admin + Ops only
 */
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Phone,
  Copy,
  MessageSquare,
  CheckCircle,
  ArrowUpCircle,
  X,
  Calendar,
  PhoneCall,
  RotateCcw,
  ExternalLink,
  Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { StatusTimeline } from '@/components/ui/StatusTimeline'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getCallback,
  completeCallback,
  escalateCallback,
  cancelCallback,
  addCallbackNote,
  type CallbackStatus,
  type CallbackTimelineEvent,
  type CallNote,
} from '@/lib/callbackApi'

// ---------------------------------------------------------------------------
// State machine — allowed transitions
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<CallbackStatus, CallbackStatus[]> = {
  PENDING: ['SCHEDULED', 'ESCALATED_TO_CA', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'ESCALATED_TO_CA', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'FOLLOW_UP_NEEDED', 'ESCALATED_TO_CA'],
  COMPLETED: ['FOLLOW_UP_NEEDED'],
  FOLLOW_UP_NEEDED: ['SCHEDULED', 'COMPLETED', 'ESCALATED_TO_CA'],
  ESCALATED_TO_CA: ['IN_PROGRESS', 'COMPLETED'],
  CANCELLED: [],
}

function canTransition(from: CallbackStatus, to: CallbackStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// ---------------------------------------------------------------------------
// Timeline event helpers
// ---------------------------------------------------------------------------
const EVENT_ICONS: Record<string, React.ReactNode> = {
  REQUESTED: <Phone className="h-3 w-3" />,
  ASSIGNED: <CheckCircle className="h-3 w-3" />,
  SCHEDULED: <Calendar className="h-3 w-3" />,
  RESCHEDULED: <RotateCcw className="h-3 w-3" />,
  CALL_STARTED: <PhoneCall className="h-3 w-3" />,
  NOTE_ADDED: <MessageSquare className="h-3 w-3" />,
  CALL_COMPLETED: <CheckCircle className="h-3 w-3" />,
  FOLLOW_UP_FLAGGED: <RotateCcw className="h-3 w-3" />,
  ESCALATED: <ArrowUpCircle className="h-3 w-3" />,
  CANCELLED: <X className="h-3 w-3" />,
  NOTIFICATION_SENT: <Bell className="h-3 w-3" />,
}

function eventDotColor(eventType: CallbackTimelineEvent['eventType']): string {
  switch (eventType) {
    case 'CALL_COMPLETED': return 'bg-success-500'
    case 'ESCALATED': return 'bg-error-500'
    case 'CANCELLED': return 'bg-neutral-400'
    case 'FOLLOW_UP_FLAGGED': return 'bg-accent-500'
    case 'NOTIFICATION_SENT': return 'bg-info-400'
    default: return 'bg-brand-500'
  }
}

// ---------------------------------------------------------------------------
// Note composer
// ---------------------------------------------------------------------------
interface NoteComposerProps {
  callbackId: string
  onSuccess: () => void
}

function NoteComposer({ callbackId, onSuccess }: NoteComposerProps) {
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState('')
  const [duration, setDuration] = useState('')

  const mutation = useMutation({
    mutationFn: () => addCallbackNote(callbackId, {
      content: body,
      isInternal: false,
      outcome: outcome || undefined,
      durationMinutes: duration ? Number(duration) : undefined,
    }),
    onSuccess: () => {
      toast.success('Note saved')
      setBody('')
      setOutcome('')
      setDuration('')
      onSuccess()
    },
    onError: () => toast.error('Failed to save note'),
  })

  const outcomeOptions = [
    { value: '', label: 'Select outcome' },
    { value: 'RESOLVED', label: t('admin.callback.section.notes.outcome.resolved') },
    { value: 'NEEDS_FOLLOW_UP', label: t('admin.callback.section.notes.outcome.needsFollowUp') },
    { value: 'ESCALATED', label: t('admin.callback.section.notes.outcome.escalated') },
    { value: 'NO_ANSWER', label: t('admin.callback.section.notes.outcome.noAnswer') },
    { value: 'WRONG_NUMBER', label: t('admin.callback.section.notes.outcome.wrongNumber') },
    { value: 'USER_DECLINED', label: t('admin.callback.section.notes.outcome.userDeclined') },
  ]

  return (
    <Card>
      <CardHeader title={t('admin.callback.section.notes')} />
      <div className="space-y-3">
        <div>
          <label htmlFor="note-body" className="sr-only">{t('admin.callback.section.notes')}</label>
          <textarea
            id="note-body"
            rows={4}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t('admin.callback.section.notes.composerPlaceholder')}
            maxLength={4000}
            disabled={mutation.isPending}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none resize-none disabled:opacity-60"
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                if (body.length >= 10) void mutation.mutate()
              }
            }}
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <div>
            <label htmlFor="note-outcome" className="text-xs font-medium text-neutral-500 block mb-1">
              {t('admin.callback.section.notes.outcomeLabel')}
            </label>
            <select
              id="note-outcome"
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              disabled={mutation.isPending}
              className="h-8 rounded-md border border-neutral-300 bg-white text-sm px-2 focus:border-brand-500 outline-none"
            >
              {outcomeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="note-duration" className="text-xs font-medium text-neutral-500 block mb-1">
              {t('admin.callback.section.notes.duration')}
            </label>
            <div className="flex items-center gap-1">
              <input
                id="note-duration"
                type="number"
                min={0}
                max={240}
                value={duration}
                onChange={e => setDuration(e.target.value)}
                disabled={mutation.isPending}
                className="w-16 h-8 rounded-md border border-neutral-300 px-2 text-sm focus:border-brand-500 outline-none"
              />
              <span className="text-xs text-neutral-500">min</span>
            </div>
          </div>
        </div>

        {mutation.isError && (
          <AlertBanner type="error" title="Failed to save note" description="Please retry." />
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void mutation.mutate()}
            disabled={body.length < 10 || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : t('admin.callback.section.notes.save')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Previous notes
// ---------------------------------------------------------------------------
function NoteCard({ note }: { note: CallNote }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = note.body.length > 200

  return (
    <div className="border border-neutral-100 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-600">
            {note.authorName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs font-medium text-neutral-800">{note.authorName}</span>
          <span className="text-xs text-neutral-400">{formatRelativeTime(note.recordedAt)}</span>
        </div>
        <div className="flex gap-1">
          {note.outcome && (
            <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
              {note.outcome}
            </span>
          )}
          {note.durationMinutes && (
            <span className="text-xs text-neutral-500">{note.durationMinutes}m</span>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-700">
        {isLong && !expanded ? note.body.slice(0, 200) + '…' : note.body}
      </p>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-brand-600 hover:underline">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm modal helper
// ---------------------------------------------------------------------------
interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  requireReason?: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  isLoading?: boolean
}

function ConfirmDialog({ isOpen, title, requireReason, onClose, onConfirm, isLoading }: ConfirmDialogProps) {
  const [reason, setReason] = useState('')

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="sm">
      {requireReason && (
        <div className="mb-4">
          <label htmlFor="confirm-reason" className="text-sm font-medium text-neutral-700 block mb-1">
            {t('admin.callback.confirm.cancel.reasonLabel')}
          </label>
          <textarea
            id="confirm-reason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onConfirm(reason)}
          disabled={requireReason ? reason.length < 2 : false || isLoading}
        >
          {isLoading ? 'Processing…' : 'Confirm'}
        </Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Status stepper
// ---------------------------------------------------------------------------
function CallbackStepper({ status }: { status: CallbackStatus }) {
  const happyPath: CallbackStatus[] = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED']
  const happyLabels: Record<string, string> = {
    PENDING: t('admin.callbacks.status.pending'),
    SCHEDULED: t('admin.callbacks.status.scheduled'),
    IN_PROGRESS: t('admin.callbacks.status.inProgress'),
    COMPLETED: t('admin.callbacks.status.completed'),
  }

  const currentIdx = happyPath.indexOf(status)

  const steps = happyPath.map((s, idx) => {
    let stepStatus: 'completed' | 'active' | 'pending'
    if (idx < currentIdx) stepStatus = 'completed'
    else if (idx === currentIdx) stepStatus = 'active'
    else stepStatus = 'pending'

    return {
      id: s,
      label: happyLabels[s] ?? s,
      status: stepStatus as 'completed' | 'active' | 'pending',
    }
  })

  return <StatusTimeline steps={steps} orientation="horizontal" />
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function CallbackDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmModal, setConfirmModal] = useState<{
    type: 'cancel' | 'escalate' | null
  }>({ type: null })

  const { data: cb, isLoading, isError } = useQuery({
    queryKey: ['callback', id],
    queryFn: () => getCallback(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const completeMutation = useMutation({
    mutationFn: () => completeCallback(id!),
    onSuccess: () => {
      toast.success('Callback marked as completed')
      void queryClient.invalidateQueries({ queryKey: ['callback', id] })
      void queryClient.invalidateQueries({ queryKey: ['callbacks'] })
    },
    onError: () => toast.error('Failed to complete callback'),
  })

  const escalateMutation = useMutation({
    mutationFn: (reason: string) => escalateCallback(id!, reason),
    onSuccess: () => {
      toast.success('Escalated to CA')
      setConfirmModal({ type: null })
      void queryClient.invalidateQueries({ queryKey: ['callback', id] })
    },
    onError: () => toast.error('Failed to escalate'),
  })

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelCallback(id!, reason),
    onSuccess: () => {
      toast.success('Callback cancelled')
      setConfirmModal({ type: null })
      void queryClient.invalidateQueries({ queryKey: ['callback', id] })
    },
    onError: () => toast.error('Failed to cancel'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-neutral-100 rounded w-1/2" />
        <div className="h-20 bg-neutral-100 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-neutral-100 rounded" />)}
        </div>
      </div>
    )
  }

  if (isError || !cb) {
    return (
      <div className="space-y-4">
        <AlertBanner
          type="error"
          title={t('admin.callback.error.notFound')}
        />
        <Button variant="secondary" onClick={() => void navigate('/callbacks')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          {t('admin.callback.detail.back')}
        </Button>
      </div>
    )
  }

  const canComplete = canTransition(cb.status, 'COMPLETED')
  const canEscalate = canTransition(cb.status, 'ESCALATED_TO_CA')
  const canCancel = canTransition(cb.status, 'CANCELLED')
  const canStartCall = cb.status === 'SCHEDULED'

  const timeline = cb.timeline ?? []
  const notes = cb.notes ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/callbacks')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('admin.callback.detail.back')}
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              {t('admin.callback.detail.title')} · #{cb.id.slice(0, 12)}
            </h1>
            <p className="text-sm text-neutral-500">{cb.userName} · <span className="font-mono">{cb.userPhone}</span></p>
          </div>
        </div>

        {/* Action buttons */}
        <div role="toolbar" aria-label="Callback actions" className="flex gap-2 flex-wrap shrink-0">
          {canStartCall && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PhoneCall className="h-4 w-4" />}
              onClick={() => toast.info('Call started — tracking in progress')}
            >
              {t('admin.callback.action.startCall')}
            </Button>
          )}
          {canComplete && !canStartCall && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<CheckCircle className="h-4 w-4" />}
              onClick={() => void completeMutation.mutate()}
              disabled={completeMutation.isPending}
              aria-label="Complete callback — transitions status to Completed"
            >
              {t('admin.callback.action.complete')}
            </Button>
          )}
          {canEscalate && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ArrowUpCircle className="h-4 w-4" />}
              onClick={() => setConfirmModal({ type: 'escalate' })}
            >
              {t('admin.callback.action.escalate')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="text-error-600 hover:bg-error-50"
              leftIcon={<X className="h-4 w-4" />}
              onClick={() => setConfirmModal({ type: 'cancel' })}
            >
              {t('admin.callback.action.cancel')}
            </Button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <Card>
        <CallbackStepper status={cb.status} />
      </Card>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left — 2/3 */}
        <div className="xl:col-span-2 space-y-4">

          {/* Reason */}
          {cb.issueDescription && (
            <Card>
              <CardHeader title={t('admin.callback.section.reason')} />
              <p className="text-sm text-neutral-700">{cb.issueDescription}</p>
            </Card>
          )}

          {/* Linked entity */}
          <Card>
            <CardHeader title={t('admin.callback.section.linkedEntity')} />
            {cb.linkedEntity ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{cb.linkedEntity.displayLabel}</p>
                  {cb.linkedEntity.status && (
                    <p className="text-xs text-neutral-500 mt-0.5">Status: {cb.linkedEntity.status}</p>
                  )}
                </div>
                <Link
                  to={`/${cb.linkedEntity.entityType.toLowerCase()}/${cb.linkedEntity.entityId}`}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">{t('admin.callback.section.linkedEntity.empty')}</p>
            )}
          </Card>

          {/* Timeline */}
          {timeline.length > 0 && (
            <Card>
              <CardHeader title={t('admin.callback.section.timeline')} />
              <ol aria-label="Callback timeline" className="space-y-0">
                {timeline.map((ev, idx) => {
                  const isLast = idx === timeline.length - 1
                  return (
                    <li key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className={cn('h-6 w-6 rounded-full flex items-center justify-center text-white mt-0.5', eventDotColor(ev.eventType))}
                          aria-hidden="true"
                        >
                          {EVENT_ICONS[ev.eventType]}
                        </div>
                        {!isLast && (
                          <div className="w-px flex-1 bg-neutral-200 my-1 min-h-[16px]" aria-hidden="true" />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-xs text-neutral-400">{formatDateTime(ev.occurredAt)}</p>
                        <p className="text-sm font-semibold text-neutral-900 mt-0.5">{ev.eventType.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-neutral-500">{ev.actorName}</p>
                        {ev.detail && <p className="text-xs text-neutral-600 mt-0.5">{ev.detail}</p>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}

          {/* Note composer */}
          <NoteComposer
            callbackId={cb.id}
            onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['callback', id] })}
          />

          {/* Previous notes */}
          {notes.length > 0 && (
            <Card>
              <CardHeader title={`Previous notes (${notes.length})`} />
              <div className="space-y-3">
                {[...notes].reverse().map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            </Card>
          )}
        </div>

        {/* Right — 1/3 */}
        <div className="space-y-4">
          {/* Meta */}
          <Card>
            <CardHeader title="Info" />
            <div className="space-y-2 text-sm">
              {[
                { label: t('admin.callback.section.meta.category'), value: cb.category },
                { label: t('admin.callback.section.meta.priority'), value: cb.priority },
                { label: t('admin.callback.section.meta.requestedAt'), value: formatDateTime(cb.requestedAt) },
                { label: t('admin.callback.section.meta.assignedTo'), value: cb.assignedAgentName ?? 'Unassigned' },
              ].map(row => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-neutral-500">{row.label}</span>
                  <span className="font-medium text-neutral-800">{row.value}</span>
                </div>
              ))}
              {cb.preferredWindowStart && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t('admin.callback.section.meta.preferredWindow')}</span>
                  <span className="font-medium text-neutral-800">
                    {formatDateTime(cb.preferredWindowStart)} – {cb.preferredWindowEnd ? formatDateTime(cb.preferredWindowEnd) : ''}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader title="Contact" />
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden="true" />
              <span className="font-mono text-sm text-neutral-700">{cb.userPhone}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" size="sm" leftIcon={<Phone className="h-4 w-4" />}>
                {t('admin.callback.section.contact.call')}
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="h-4 w-4" />}>
                {t('admin.callback.section.contact.sms')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Copy className="h-4 w-4" />}
                onClick={() => void navigator.clipboard.writeText(cb.userPhone).then(() => toast.success('Copied'))}
              >
                {t('admin.callback.section.contact.copy')}
              </Button>
            </div>
          </Card>

          {/* Notifications fired */}
          {cb.notificationsFired && cb.notificationsFired.length > 0 && (
            <Card>
              <CardHeader title={t('admin.callback.section.notifications.title')} />
              <div className="space-y-2">
                {cb.notificationsFired.map(n => (
                  <div key={n.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">{n.channel}</span>
                      <span className="text-neutral-700 font-mono">{n.templateCode}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        n.status === 'DELIVERED' ? 'bg-success-500' :
                        n.status === 'SENT' ? 'bg-success-400' :
                        n.status === 'FAILED' ? 'bg-error-500' :
                        'bg-neutral-300 animate-pulse'
                      )} />
                      <span className="text-neutral-400">{formatRelativeTime(n.sentAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={confirmModal.type === 'cancel'}
        title={t('admin.callback.confirm.cancel.title')}
        requireReason
        onClose={() => setConfirmModal({ type: null })}
        onConfirm={(reason) => void cancelMutation.mutate(reason)}
        isLoading={cancelMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmModal.type === 'escalate'}
        title={t('admin.callback.confirm.escalate.title')}
        requireReason
        onClose={() => setConfirmModal({ type: null })}
        onConfirm={(reason) => void escalateMutation.mutate(reason)}
        isLoading={escalateMutation.isPending}
      />
    </div>
  )
}
