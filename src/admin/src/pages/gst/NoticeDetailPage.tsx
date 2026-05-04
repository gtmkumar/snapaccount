/**
 * NoticeDetailPage — single GST notice working surface (Phase 6B)
 * Route: /gst/notices/:noticeId
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DueDateChip } from '@/components/ui/DueDateChip'
import { AttachmentList, type AttachmentFile } from '@/components/ui/AttachmentList'
import { Card, CardHeader } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getGstNotice,
  respondToGstNotice,
  markGstNoticeUnderReview,
  markGstNoticeClosed,
  type GstNoticeStatus,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRAFT_STORAGE_PREFIX = 'snap_gst_notice_draft_'

function noticeStatusBadge(status: GstNoticeStatus) {
  const config: Record<GstNoticeStatus, { variant: 'info' | 'warning' | 'brand' | 'success'; label: string }> = {
    RECEIVED: { variant: 'info', label: t('admin.gst.notice.status.received') },
    UNDER_REVIEW: { variant: 'warning', label: t('admin.gst.notice.status.underReview') },
    RESPONDED: { variant: 'brand', label: t('admin.gst.notice.status.responded') },
    CLOSED: { variant: 'success', label: t('admin.gst.notice.status.closed') },
  }
  const cfg = config[status] ?? { variant: 'info' as const, label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ---------------------------------------------------------------------------
// PDF Viewer stub (react-pdf not installed — renders link fallback)
// ---------------------------------------------------------------------------

function PdfViewer({ src, height = '480px' }: { src: string; height?: string }) {
  return (
    <div
      role="document"
      aria-label="Notice source PDF"
      className="flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50"
      style={{ height }}
    >
      <p className="text-sm text-neutral-500 mb-3">{t('admin.gst.notice.pdf.preview')}</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        {t('admin.gst.notice.pdf.openNewTab')}
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  title: string
  body: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  pending?: boolean
}

function ConfirmDialog({ title, body, onConfirm, onCancel, confirmLabel, pending }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-3">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        <p className="text-sm text-neutral-600">{body}</p>
        <div className="flex gap-2 pt-1">
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={pending} fullWidth>
            {pending ? '…' : (confirmLabel ?? t('admin.gst.notice.confirm.confirm'))}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel} fullWidth>
            {t('admin.gst.notice.confirm.back')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NoticeDetailPage() {
  const { noticeId } = useParams<{ noticeId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const storageKey = `${DRAFT_STORAGE_PREFIX}${noticeId}`

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState('Filed on GSTN portal manually')
  const [reference, setReference] = useState('')
  const [dateSent, setDateSent] = useState(new Date().toISOString().split('T')[0])
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'pdf' | 'response' | 'details'>('pdf')
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: notice, isLoading, isError } = useQuery({
    queryKey: ['gst-notice', noticeId],
    queryFn: () => getGstNotice(noticeId!),
    enabled: !!noticeId,
    staleTime: 30_000,
  })

  // SEC-042: Load draft from sessionStorage on mount.
  // Notice response bodies often contain GSTIN, financial figures, and notice
  // references — sensitive enough that they shouldn't survive tab close on a
  // shared workstation. sessionStorage is per-tab and clears on close.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as { subject?: string; body?: string; channel?: string; reference?: string }
        setSubject(parsed.subject ?? '')
        setBody(parsed.body ?? '')
        setChannel(parsed.channel ?? 'Filed on GSTN portal manually')
        setReference(parsed.reference ?? '')
      }
    } catch { /* noop */ }

    if (notice) {
      setSubject(`Re: ${notice.noticeNumber}`)
    }
  }, [storageKey, notice?.noticeNumber])

  // SEC-042: Auto-save draft to sessionStorage (not localStorage).
  const saveDraft = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ subject, body, channel, reference }))
      setDraftSavedAt(new Date())
    } catch { /* noop */ }
  }, [storageKey, subject, body, channel, reference])

  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(saveDraft, 5000)
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [subject, body, channel, reference, saveDraft])

  const underReviewMutation = useMutation({
    mutationFn: () => markGstNoticeUnderReview(noticeId!),
    onSuccess: () => {
      toast.success(t('admin.gst.notice.action.underReview.success'))
      void queryClient.invalidateQueries({ queryKey: ['gst-notice', noticeId] })
    },
    onError: () => toast.error(t('admin.gst.notice.action.error')),
  })

  const respondMutation = useMutation({
    mutationFn: () => respondToGstNotice(noticeId!, {
      respondedByUserId: 'current-user',
      responseText: body,
      submissionChannel: channel,
      responseReference: reference || undefined,
      dateSent,
    }),
    onSuccess: () => {
      toast.success(t('admin.gst.notice.action.responded.success'))
      setShowConfirm(false)
      try { sessionStorage.removeItem(storageKey) } catch { /* noop */ }
      void queryClient.invalidateQueries({ queryKey: ['gst-notice', noticeId] })
      void queryClient.invalidateQueries({ queryKey: ['gst-notices'] })
    },
    onError: () => toast.error(t('admin.gst.notice.action.error')),
  })

  const closeMutation = useMutation({
    mutationFn: () => markGstNoticeClosed(noticeId!, 'OFFICER_CLOSED'),
    onSuccess: () => {
      toast.success(t('admin.gst.notice.action.closed.success'))
      void queryClient.invalidateQueries({ queryKey: ['gst-notice', noticeId] })
    },
    onError: () => toast.error(t('admin.gst.notice.action.error')),
  })

  function handleAddFiles(files: File[]) {
    const newAttachments: AttachmentFile[] = files.map(f => ({
      id: `${Date.now()}-${f.name}`,
      fileName: f.name,
      fileSizeBytes: f.size,
      state: 'queued',
    }))
    setAttachments(prev => [...prev, ...newAttachments])
    // Simulate upload
    newAttachments.forEach(att => {
      let progress = 0
      const interval = setInterval(() => {
        progress += 20
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, state: 'uploading' as const, progress } : a))
        if (progress >= 100) {
          clearInterval(interval)
          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, state: 'success' as const } : a))
        }
      }, 300)
    })
  }

  function handleRemoveAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-1/3" />
        <div className="h-96 bg-neutral-100 rounded" />
      </div>
    )
  }

  if (isError || !notice) {
    return (
      <AlertBanner
        type="error"
        title={t('admin.gst.notice.error.load')}
        actions={
          <button onClick={() => void navigate('/gst/notices')} className="text-xs font-medium text-error-700 underline">
            {t('admin.gst.notice.error.backToList')}
          </button>
        }
      />
    )
  }

  const isReadOnly = notice.status === 'RESPONDED' || notice.status === 'CLOSED'
  const canRespond = notice.status === 'RECEIVED' || notice.status === 'UNDER_REVIEW'
  const tabs = [
    { key: 'pdf', label: t('admin.gst.notice.tab.pdf') },
    { key: 'response', label: t('admin.gst.notice.tab.response') },
    { key: 'details', label: t('admin.gst.notice.tab.details') },
  ] as const

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/gst/notices')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('admin.gst.notice.back')}
          </Button>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400">
            GST › {t('admin.gst.notice.breadcrumb')} › {notice.noticeNumber}
          </nav>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-bold text-neutral-900 font-mono">{notice.noticeNumber}</h1>
              <Badge variant="neutral">{notice.noticeType}</Badge>
              {noticeStatusBadge(notice.status)}
              {notice.dueDate && <DueDateChip dueDate={notice.dueDate} />}
            </div>
            <p className="text-sm text-neutral-500">
              GSTIN <span className="font-mono">{notice.gstin}</span>
              {notice.businessName && ` · ${notice.businessName}`}
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            {notice.status === 'RECEIVED' && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Clock className="h-4 w-4" />}
                onClick={() => void underReviewMutation.mutate()}
                disabled={underReviewMutation.isPending}
              >
                {t('admin.gst.notice.action.markUnderReview')}
              </Button>
            )}
            {notice.status === 'RESPONDED' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void closeMutation.mutate()}
                disabled={closeMutation.isPending}
              >
                {t('admin.gst.notice.action.close')}
              </Button>
            )}
            <Button variant="ghost" size="sm" leftIcon={<Phone className="h-4 w-4" />} className="text-warning-600">
              {t('admin.gst.notice.action.requestCallback')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs for smaller screens */}
      <div className="flex border-b border-neutral-200 xl:hidden" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Three-column layout (xl) / tabs (smaller) */}
      <div className="xl:grid xl:grid-cols-5 xl:gap-5 space-y-4 xl:space-y-0">
        {/* PDF Viewer */}
        <div className={cn('xl:col-span-2', activeTab !== 'pdf' && 'hidden xl:block')}>
          <Card padding="none">
            <div className="px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-700">{t('admin.gst.notice.pdf.title')}</p>
            </div>
            <div className="p-4">
              {notice.attachments && notice.attachments.length > 0 && notice.attachments[0].signedUrl ? (
                <PdfViewer src={notice.attachments[0].signedUrl} />
              ) : (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <p className="text-sm text-neutral-400">{t('admin.gst.notice.pdf.noSource')}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Response Composer */}
        <div className={cn('xl:col-span-2', activeTab !== 'response' && 'hidden xl:block')}>
          <Card padding="none">
            <div className="px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-700">{t('admin.gst.notice.response.title')}</p>
              {draftSavedAt && (
                <p className="text-xs text-neutral-400 mt-0.5" aria-live="polite">
                  {t('admin.gst.notice.response.draftSaved', {
                    time: draftSavedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                  })}
                </p>
              )}
            </div>
            <div className="p-4 space-y-3">
              {isReadOnly && (
                <AlertBanner
                  type="info"
                  title={t('admin.gst.notice.response.readOnly')}
                />
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  {t('admin.gst.notice.response.subject')} *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  {t('admin.gst.notice.response.body')} *
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  disabled={isReadOnly}
                  rows={6}
                  placeholder={t('admin.gst.notice.response.bodyPlaceholder')}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none disabled:opacity-60 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  {t('admin.gst.notice.response.channel')} *
                </label>
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none disabled:opacity-60"
                >
                  <option value="Filed on GSTN portal manually">{t('admin.gst.notice.channel.gstnPortal')}</option>
                  <option value="Sent via email to officer">{t('admin.gst.notice.channel.email')}</option>
                  <option value="Other (specify)">{t('admin.gst.notice.channel.other')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    {t('admin.gst.notice.response.reference')}
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    disabled={isReadOnly}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    {t('admin.gst.notice.response.dateSent')}
                  </label>
                  <input
                    type="date"
                    value={dateSent}
                    onChange={e => setDateSent(e.target.value)}
                    disabled={isReadOnly}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Attachments */}
              <div>
                <p className="text-xs font-medium text-neutral-600 mb-1">
                  {t('admin.gst.notice.response.attachments')}
                </p>
                <AttachmentList
                  files={attachments}
                  onAdd={handleAddFiles}
                  onRemove={handleRemoveAttachment}
                  readOnly={isReadOnly}
                />
              </div>

              {/* Action footer */}
              {canRespond && (
                <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-2">
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setShowConfirm(true)}
                    disabled={!body.trim() || !subject.trim()}
                  >
                    {t('admin.gst.notice.action.markResponded')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={saveDraft}
                  >
                    {t('admin.gst.notice.response.saveDraft')}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className={cn('xl:col-span-1 space-y-4', activeTab !== 'details' && 'hidden xl:block')}>
          {/* Metadata */}
          <Card>
            <CardHeader title={t('admin.gst.notice.sidebar.metadata')} />
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('admin.gst.notice.field.noticeType')}</dt>
                <dd className="font-medium text-neutral-800">{notice.noticeType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('admin.gst.notice.col.received')}</dt>
                <dd className="text-neutral-700">
                  {new Date(notice.noticeDate).toLocaleDateString('en-IN')}
                </dd>
              </div>
              {notice.dueDate && (
                <div className="flex justify-between items-center">
                  <dt className="text-neutral-500">{t('admin.gst.notice.col.due')}</dt>
                  <dd><DueDateChip dueDate={notice.dueDate} size="sm" /></dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('admin.gst.notice.col.ca')}</dt>
                <dd className="text-neutral-700">
                  {notice.assignedCaName ?? (
                    <span className="text-neutral-400">{t('admin.gst.notice.unassigned')}</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Existing response (if responded) */}
          {notice.status === 'RESPONDED' && notice.responseText && (
            <Card>
              <CardHeader title={t('admin.gst.notice.sidebar.response')} />
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{notice.responseText}</p>
              {notice.respondedAt && (
                <p className="text-xs text-neutral-400 mt-2">
                  {new Date(notice.respondedAt).toLocaleString('en-IN')}
                  {notice.respondedBy && ` · ${notice.respondedBy}`}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          title={t('admin.gst.notice.confirm.respond.title')}
          body={t('admin.gst.notice.confirm.respond.body', { channel })}
          confirmLabel={t('admin.gst.notice.confirm.respond.confirm')}
          onConfirm={() => void respondMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
          pending={respondMutation.isPending}
        />
      )}
    </div>
  )
}
