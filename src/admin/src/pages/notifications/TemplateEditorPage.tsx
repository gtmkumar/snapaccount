/**
 * TemplateEditorPage — Split editor/preview for a single notification template (GAP-037, Wave 7)
 * Route: /notifications/templates/:id (UUID)
 * Perms: notification.templates.read (view), notification.templates.edit (save/delete),
 *        notification.templates.testsend (test send)
 *
 * Backend:
 *   GET    /notifications/templates/:id          — load template
 *   PUT    /notifications/templates/:id          — update body/subject/dltTemplateId
 *   DELETE /notifications/templates/:id          — soft-delete (resets to default)
 *   POST   /notifications/templates/:id/test-send — send test { Variables?, RecipientEmail?, RecipientPhone? }
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, GitCompare, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { DualPaneEditor } from '@/components/ui/DualPaneEditor'
import { TemplateBodyEditor } from '@/components/ui/TemplateBodyEditor'
import { TemplatePreviewPane } from '@/components/ui/TemplatePreviewPane'
import { TemplateSourceChip } from '@/components/ui/TemplateSourceChip'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Modal } from '@/components/ui/Modal'
import { Can } from '@/components/shared/Can'
import {
  getNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  testSendNotificationTemplate,
  getVariablesForEvent,
  CHANNEL_LABELS,
  type TemplateChannel,
} from '@/lib/notificationTemplateApi'

// ---------------------------------------------------------------------------
// Diff view (simple line-by-line)
// ---------------------------------------------------------------------------

function SimpleDiff({ original, current }: { original: string; current: string }) {
  const origLines = original.split('\n')
  const currLines = current.split('\n')
  const maxLen = Math.max(origLines.length, currLines.length)

  return (
    <div
      className="font-mono text-xs space-y-0.5 bg-neutral-50 rounded-lg p-3 overflow-x-auto"
      role="region"
      aria-label={t('ntpl.preview.diff')}
    >
      {Array.from({ length: maxLen }).map((_, i) => {
        const o = origLines[i] ?? ''
        const c = currLines[i] ?? ''
        if (o === c) {
          return <div key={i} className="text-neutral-600 whitespace-pre">{c || ' '}</div>
        }
        return (
          <div key={i}>
            {o !== '' && (
              <div className="text-red-700 bg-red-50 whitespace-pre" aria-label={`Removed: ${o}`}>
                {`- ${o}`}
              </div>
            )}
            {c !== '' && (
              <div className="text-emerald-700 bg-emerald-50 whitespace-pre" aria-label={`Added: ${c}`}>
                {`+ ${c}`}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Test send dialog
// ---------------------------------------------------------------------------

interface TestSendDialogProps {
  templateId: string
  channel: TemplateChannel
  locale: string
  onClose: () => void
}

function TestSendDialog({ templateId, channel, locale, onClose }: TestSendDialogProps) {
  const [recipient, setRecipient] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const mutation = useMutation({
    mutationFn: () => testSendNotificationTemplate(templateId, {
      recipientEmail: channel === 'Email' ? recipient || undefined : undefined,
      recipientPhone: channel === 'Sms' ? recipient || undefined : undefined,
    }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t('ntpl.test.success'))
      } else {
        toast.error(t('ntpl.test.failure', { reason: data.message ?? 'Unknown error' }))
      }
      // Rate-limit guard: 10s cooldown
      setCooldown(10)
      const timer = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    },
    onError: () => toast.error(t('ntpl.test.failure', { reason: 'Network error' })),
  })

  return (
    <Modal open onClose={onClose} title={t('ntpl.test.title')}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-neutral-600">
          {t('ntpl.test.description', { channel: CHANNEL_LABELS[channel], language: locale })}
        </p>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            {t('ntpl.test.recipient')}
          </label>
          <input
            type="text"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder={
              channel === 'Email' ? 'admin@example.com'
              : channel === 'Sms' ? '+91XXXXXXXXXX'
              : 'leave blank for self'
            }
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            fullWidth
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || cooldown > 0}
            loading={mutation.isPending}
          >
            {cooldown > 0
              ? `${t('ntpl.test.send')} (${cooldown}s)`
              : t('ntpl.test.send')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [dltTemplateId, setDltTemplateId] = useState('')
  const [originalBody, setOriginalBody] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [showTestSend, setShowTestSend] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [conflictError, setConflictError] = useState(false)

  // Load template by UUID
  const { data: template, isLoading, isError } = useQuery({
    queryKey: ['notification-template', id],
    queryFn: () => getNotificationTemplate(id!),
    enabled: !!id,
    staleTime: 60_000,
  })

  const templateChannel = (template?.channel ?? 'Push') as TemplateChannel
  const variables = template?.eventCode ? getVariablesForEvent(template.eventCode) : []

  // Seed form when template loads
  useEffect(() => {
    if (template) {
      setSubject(template.subject ?? '')
      setBody(template.body)
      setIsActive(template.isActive)
      setDltTemplateId(template.dltTemplateId ?? '')
      setOriginalBody(template.body)
      setIsDirty(false)
    }
  }, [template])

  // Auto-open test send if navigated with ?action=testsend
  useEffect(() => {
    if (searchParams.get('action') === 'testsend' && template) {
      setShowTestSend(true)
    }
  }, [searchParams, template])

  const markDirty = useCallback(() => setIsDirty(true), [])

  // Save (PUT) mutation
  const saveMutation = useMutation({
    mutationFn: () => updateNotificationTemplate(id!, {
      body,
      subject: subject || null,
      dltTemplateId: dltTemplateId || null,
    }),
    onSuccess: () => {
      toast.success(t('ntpl.editor.saved'))
      setIsDirty(false)
      void queryClient.invalidateQueries({ queryKey: ['notification-template', id] })
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        setConflictError(true)
        toast.error(t('ntpl.conflict'))
      } else {
        toast.error(t('common.error.save'))
      }
    },
  })

  // Delete (soft-delete) mutation — resets to code default
  const deleteMutation = useMutation({
    mutationFn: () => deleteNotificationTemplate(id!),
    onSuccess: () => {
      toast.success('Template reset to default')
      setShowDeleteConfirm(false)
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
      void navigate('/notifications/templates')
    },
    onError: () => toast.error(t('common.error.save')),
  })

  function handleBack() {
    if (isDirty) {
      const yes = window.confirm(t('ntpl.editor.discardConfirm'))
      if (!yes) return
    }
    void navigate('/notifications/templates')
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-1/3" />
        <div className="h-[600px] bg-neutral-100 rounded" />
      </div>
    )
  }

  if (isError || !template) {
    return (
      <AlertBanner
        type="error"
        title={t('common.error.load')}
        actions={
          <button onClick={() => void navigate('/notifications/templates')} className="text-xs font-medium text-error-700 underline">
            {t('common.back')}
          </button>
        }
      />
    )
  }

  const isCustom = template.source === 'CUSTOM'
  const isFallback = !isCustom

  // ── Editor pane ──────────────────────────────────────────────────────────

  const editorPane = (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-neutral-800">{template.eventName}</p>
          <p className="text-xs text-neutral-400 font-mono">{template.eventCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateSourceChip source={template.source} />
          <span className="text-xs text-neutral-400 uppercase font-mono">{CHANNEL_LABELS[template.channel]}</span>
          <span className="text-xs text-neutral-400 font-mono">{template.locale}</span>
        </div>
      </div>

      {/* Fallback banner */}
      {isFallback && (
        <AlertBanner
          type="info"
          description={t('ntpl.editor.fallbackBanner')}
        />
      )}

      {/* Conflict banner */}
      {conflictError && (
        <AlertBanner
          type="warning"
          title={t('ntpl.conflict')}
          actions={
            <button
              onClick={() => {
                setConflictError(false)
                void queryClient.invalidateQueries({ queryKey: ['notification-template', id] })
              }}
              className="text-xs font-medium text-warning-700 underline"
            >
              {t('common.reload')}
            </button>
          }
        />
      )}

      {/* Body editor */}
      <Can permission="notification.templates.edit" fallback={
        <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg">
          {template.body}
        </div>
      }>
        <TemplateBodyEditor
          channel={templateChannel}
          variables={variables}
          subject={subject}
          body={body}
          dltTemplateId={dltTemplateId}
          onSubjectChange={v => { setSubject(v); markDirty() }}
          onBodyChange={v => { setBody(v); markDirty() }}
          onDltTemplateIdChange={v => { setDltTemplateId(v); markDirty() }}
        />
      </Can>

      {/* Active toggle */}
      <Can permission="notification.templates.edit">
        <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-neutral-800">{t('ntpl.editor.active')}</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {isActive
                ? t('ntpl.editor.activeHint.on')
                : t('ntpl.editor.activeHint.off')}
            </p>
          </div>
          <Toggle
            checked={isActive}
            onChange={v => { setIsActive(v); markDirty() }}
            label={isActive ? t('common.active') : t('common.inactive')}
            size="md"
          />
        </div>
      </Can>

      {/* Diff toggle */}
      {isCustom && (
        <button
          onClick={() => setShowDiff(v => !v)}
          className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"
        >
          <GitCompare className="h-3.5 w-3.5" />
          {showDiff ? 'Hide diff' : t('ntpl.preview.diff')}
        </button>
      )}

      {/* Diff view vs original loaded body */}
      {showDiff && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">{t('ntpl.preview.diff')}</p>
          <SimpleDiff original={originalBody} current={body} />
        </div>
      )}

      {/* Footer actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100 sticky bottom-0 bg-white pb-2">
        <Can permission="notification.templates.edit">
          <Button
            variant="primary"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!isDirty}
          >
            {t('ntpl.editor.save')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              saveMutation.mutate()
              setShowTestSend(true)
            }}
            loading={saveMutation.isPending}
          >
            {t('ntpl.editor.saveTest')}
          </Button>
        </Can>
        <Can permission="notification.templates.testsend">
          <Button variant="ghost" onClick={() => setShowTestSend(true)}>
            {t('ntpl.test.send')}
          </Button>
        </Can>
        {isCustom && (
          <Can permission="notification.templates.edit">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-warning-600"
            >
              {t('ntpl.editor.reset')}
            </Button>
          </Can>
        )}
        <Button
          variant="ghost"
          onClick={() => { setBody(template.body); setSubject(template.subject ?? ''); setIsDirty(false) }}
        >
          {t('ntpl.editor.discard')}
        </Button>
      </div>
    </div>
  )

  // ── Preview pane ─────────────────────────────────────────────────────────

  const previewPane = (
    <div className="flex flex-col h-full overflow-y-auto p-4 bg-neutral-50 space-y-4">
      <TemplatePreviewPane
        channel={templateChannel}
        language={template.locale}
        subject={subject}
        body={body}
        variables={variables}
      />
    </div>
  )

  return (
    <div className="flex flex-col h-full space-y-0">
      {/* Back header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 bg-white shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          {t('ntpl.list.title')}
        </Button>
        {isDirty && (
          <span className="text-xs text-warning-600 font-medium">
            {t('common.unsavedChanges')}
          </span>
        )}
      </div>

      {/* Split editor (desktop) / stacked (mobile) */}
      <div className="hidden lg:flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 8rem)' }}>
        <DualPaneEditor
          left={editorPane}
          right={previewPane}
          storageKey="notification-template-editor"
          defaultRatio={0.55}
        />
      </div>

      {/* Stacked layout for < lg */}
      <div className="lg:hidden flex-1 overflow-y-auto">
        <div className="bg-neutral-50 p-4 border-b border-neutral-100">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            <p className="text-xs font-medium text-neutral-500">{t('ntpl.preview.title')}</p>
          </div>
          <TemplatePreviewPane
            channel={templateChannel}
            language={template.locale}
            subject={subject}
            body={body}
            variables={variables}
          />
        </div>
        {editorPane}
      </div>

      {/* Test send dialog */}
      {showTestSend && id && (
        <TestSendDialog
          templateId={id}
          channel={templateChannel}
          locale={template.locale}
          onClose={() => setShowTestSend(false)}
        />
      )}

      {/* Delete/reset confirm dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-3">
            <h2 className="text-base font-semibold text-neutral-900">{t('ntpl.editor.reset')}</h2>
            <p className="text-sm text-neutral-600">{t('ntpl.editor.resetConfirm', { event: template.eventCode ?? '' })}</p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => deleteMutation.mutate()} loading={deleteMutation.isPending} fullWidth>
                {t('ntpl.editor.reset')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)} fullWidth>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
