/**
 * TemplatePreviewPane — live channel-accurate preview of a notification template (GAP-037, Wave 7)
 * Substitutes sample variables and renders channel-specific chrome.
 * [confirm 7B] HTML email support, sample value fixture.
 */
import { useMemo, useEffect } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { Bell, MessageSquare, Mail, Monitor } from 'lucide-react'
import type { TemplateChannel, TemplateVariable } from '@/lib/notificationTemplateApi'

/** Substitute {{variable}} tokens with sample values */
function substituteVariables(text: string, variables: TemplateVariable[]): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const v = variables.find(vv => vv.key === key.trim())
    return v ? v.sampleValue : match
  })
}

// ---------------------------------------------------------------------------
// Channel-specific chrome wrappers
// ---------------------------------------------------------------------------

function PushPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="bg-neutral-800 rounded-xl p-3 text-white max-w-xs mx-auto">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{subject || 'SnapAccount'}</p>
          <p className="text-xs text-neutral-300 mt-0.5 line-clamp-3 whitespace-pre-wrap">{body}</p>
        </div>
      </div>
    </div>
  )
}

function SmsPreview({ body }: { body: string }) {
  return (
    <div className="max-w-xs mx-auto">
      <div className="flex items-end gap-2">
        <div className="flex-1 bg-neutral-100 rounded-2xl rounded-bl-sm px-3 py-2">
          <p className="text-sm text-neutral-900 whitespace-pre-wrap break-words">{body}</p>
        </div>
        <MessageSquare className="h-4 w-4 text-neutral-400 shrink-0 mb-1" aria-hidden="true" />
      </div>
      <p className="text-xs text-neutral-400 mt-1">SMS</p>
    </div>
  )
}

function EmailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden max-w-md mx-auto">
      {/* Email header */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-3 space-y-1">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          <span>noreply@snapaccount.in</span>
        </div>
        {subject && (
          <p className="text-sm font-semibold text-neutral-900 truncate">{subject}</p>
        )}
      </div>
      {/* Email body */}
      <div className="p-4 bg-white">
        <p className="text-sm text-neutral-800 whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  )
}

function InAppPreview({ body }: { body: string }) {
  return (
    <div className="max-w-xs mx-auto bg-neutral-900 text-white rounded-xl px-4 py-3 flex items-start gap-2">
      <Monitor className="h-4 w-4 text-neutral-300 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm whitespace-pre-wrap">{body}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main preview pane
// ---------------------------------------------------------------------------

interface TemplatePreviewPaneProps {
  channel: TemplateChannel
  language: string
  subject: string
  body: string
  variables: TemplateVariable[]
  /** Sample values the editor can override per variable */
  sampleOverrides?: Record<string, string>
  className?: string
  /** Called when preview re-renders (for live-region announcement) */
  onPreviewUpdated?: () => void
}

export function TemplatePreviewPane({
  channel,
  language,
  subject,
  body,
  variables,
  sampleOverrides = {},
  className,
  onPreviewUpdated,
}: TemplatePreviewPaneProps) {
  // Merge sample overrides into the variable list
  const effectiveVariables = useMemo(
    () => variables.map(v => ({
      ...v,
      sampleValue: sampleOverrides[v.key] ?? v.sampleValue,
    })),
    [variables, sampleOverrides]
  )

  const renderedSubject = useMemo(() => substituteVariables(subject, effectiveVariables), [subject, effectiveVariables])
  const renderedBody = useMemo(() => substituteVariables(body, effectiveVariables), [body, effectiveVariables])

  // Announce preview updated to AT (debounce in the caller or here)
  useEffect(() => {
    onPreviewUpdated?.()
  }, [renderedSubject, renderedBody, onPreviewUpdated])

  const isEmpty = !body.trim()

  return (
    <div
      className={cn('flex flex-col gap-4', className)}
      aria-live="polite"
      aria-atomic="true"
      aria-label={t('ntpl.preview.title')}
    >
      {/* Preview title + language badge */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-700">{t('ntpl.preview.title')}</p>
        <span className="text-xs rounded px-1.5 py-0.5 bg-neutral-100 text-neutral-600 font-mono uppercase">
          {language}
        </span>
      </div>

      {/* Placeholder when no body */}
      {isEmpty ? (
        <div className="flex items-center justify-center py-8 text-neutral-400 text-sm text-center">
          Add body to preview
        </div>
      ) : (
        <div className="flex items-center justify-center">
          {channel === 'Push'  && <PushPreview subject={renderedSubject} body={renderedBody} />}
          {channel === 'Sms'   && <SmsPreview body={renderedBody} />}
          {channel === 'Email' && <EmailPreview subject={renderedSubject} body={renderedBody} />}
          {channel === 'InApp' && <InAppPreview body={renderedBody} />}
        </div>
      )}
    </div>
  )
}
